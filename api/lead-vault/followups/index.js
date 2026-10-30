import { requireWorkspacePermission } from '../../_lib/auth.js'
import { getPrivilegedSupabaseClient } from '../../_lib/admin-client.js'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const STATUSES = new Set(['pending','in_progress','completed','cancelled','snoozed'])
const PRIORITIES = new Set(['low','normal','high','urgent'])
const CHANNELS = new Set(['whatsapp','phone','email','in_person','other'])
const SELECT = 'id,owner_id,lead_id,title,description,due_at,status,priority,channel,suggested_by,approval_status,completed_at,created_at,updated_at'

function fail(res,status,error){return res.status(status).json({ok:false,error})}
function cleanPayload(input,creating=false){
  if(!input||typeof input!=='object'||Array.isArray(input))return null
  const allowed=creating
    ? new Set(['lead_id','title','description','due_at','priority','channel'])
    : new Set(['title','description','due_at','status','priority','channel'])
  const out={}
  for(const [key,value] of Object.entries(input)){
    if(!allowed.has(key))return null
    out[key]=value
  }
  if(creating&&(!UUID.test(out.lead_id||'')||typeof out.title!=='string'||!out.title.trim()||out.title.trim().length>160))return null
  if(out.title!==undefined&&(typeof out.title!=='string'||!out.title.trim()||out.title.trim().length>160))return null
  if(out.description!==undefined&&out.description!==null&&(typeof out.description!=='string'||out.description.length>2000))return null
  if(out.due_at!==undefined&&(typeof out.due_at!=='string'||Number.isNaN(Date.parse(out.due_at))))return null
  if(creating&&!out.due_at)return null
  if(out.status!==undefined&&!STATUSES.has(out.status))return null
  if(out.priority!==undefined&&!PRIORITIES.has(out.priority))return null
  if(out.channel!==undefined&&out.channel!==null&&!CHANNELS.has(out.channel))return null
  return out
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store')
  res.setHeader('X-Content-Type-Options','nosniff')
  res.setHeader('Referrer-Policy','no-referrer')
  if(!['GET','POST','PATCH'].includes(req.method)){
    res.setHeader('Allow','GET, POST, PATCH')
    return fail(res,405,'method_not_allowed')
  }

  const permission=req.method==='GET'?'contacts.read':'leads.manage'
  const access=await requireWorkspacePermission(req,permission)
  if(access.error)return fail(res,access.status,access.error)
  const membership=access.memberships[0]
  const supabase=getPrivilegedSupabaseClient()
  if(!supabase)return fail(res,503,'server_database_not_configured')

  if(req.method==='GET'){
    const limit=Math.min(Math.max(Number.parseInt(req.query?.limit||'100',10)||100,1),250)
    const view=req.query?.view||'all'
    if(!['all','overdue','upcoming'].includes(view))return fail(res,400,'invalid_followup_view')
    const leadId=req.query?.lead_id
    if(leadId!==undefined&&(typeof leadId!=='string'||!UUID.test(leadId)))return fail(res,400,'invalid_lead_id')
    const status=req.query?.status
    if(status!==undefined&&!STATUSES.has(status))return fail(res,400,'invalid_followup_status')

    let query=supabase.from('dpf_follow_up_tasks').select(SELECT).eq('owner_id',membership.owner_id)
    if(leadId)query=query.eq('lead_id',leadId)
    if(status)query=query.eq('status',status)
    if(view==='overdue'){
      query=query.in('status',['pending','in_progress','snoozed']).lt('due_at',new Date().toISOString())
    }else if(view==='upcoming'){
      const now=new Date()
      const horizon=new Date(now.getTime()+7*24*60*60*1000)
      query=query.in('status',['pending','in_progress','snoozed']).gte('due_at',now.toISOString()).lte('due_at',horizon.toISOString())
    }
    const {data,error}=await query.order('due_at',{ascending:true}).limit(limit)
    if(error)return fail(res,500,'followup_list_failed')
    return res.status(200).json({ok:true,tasks:data||[],view})
  }

  if(req.method==='POST'){
    const payload=cleanPayload(req.body,true)
    if(!payload)return fail(res,400,'invalid_followup_payload')
    const {data,error}=await supabase.rpc('dpf_create_follow_up_task_with_event',{
      p_owner_id:membership.owner_id,p_payload:payload,
    })
    if(error){
      if(['22023','22P02','22007','23514'].includes(error.code))return fail(res,400,'invalid_followup_payload')
      if(error.code==='P0002')return fail(res,404,'lead_not_found')
      return fail(res,500,'followup_create_failed')
    }
    return res.status(201).json({ok:true,task:data})
  }

  const taskId=req.query?.id
  if(typeof taskId!=='string'||!UUID.test(taskId))return fail(res,400,'invalid_followup_id')
  const payload=cleanPayload(req.body,false)
  if(!payload||Object.keys(payload).length===0)return fail(res,400,'invalid_followup_payload')
  const {data,error}=await supabase.rpc('dpf_update_follow_up_task_with_event',{
    p_owner_id:membership.owner_id,p_task_id:taskId,p_payload:payload,
  })
  if(error){
    if(['22023','22P02','22007','23514'].includes(error.code))return fail(res,400,'invalid_followup_payload')
    if(error.code==='P0002')return fail(res,404,'followup_not_found')
    return fail(res,500,'followup_update_failed')
  }
  return res.status(200).json({ok:true,task:data})
}

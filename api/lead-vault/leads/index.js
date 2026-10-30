import { requireWorkspacePermission } from '../../_lib/auth.js'
import { getPrivilegedSupabaseClient } from '../../_lib/admin-client.js'

const STAGES = new Set(['signal','intent','qualified','matched','conversation','inspection','transaction','closed_won','closed_lost','nurture'])
const CONSENT = new Set(['unknown','given','withdrawn','not_required'])
const RECORD_STATUS = new Set(['active','archived','do_not_contact'])
const FIELDS = new Set(['full_name','phone','email','source','stage','budget_amount','currency_code','preferred_location','property_type','buying_timeline','purpose','payment_preference','motivation','risk_or_objection','next_action_at','next_action_summary','consent_status','record_status'])
const SELECT = 'id,owner_id,full_name,phone,email,source,stage,budget_amount,currency_code,preferred_location,property_type,buying_timeline,purpose,payment_preference,motivation,risk_or_objection,next_action_at,next_action_summary,consent_status,record_status,created_at,updated_at,last_contacted_at,qualified_at,closed_at'

function fail(res,status,error){return res.status(status).json({ok:false,error})}
function cleanPayload(input,creating=false){
  if(!input||typeof input!=='object'||Array.isArray(input))return null
  const out={}
  for(const [key,value] of Object.entries(input)){
    if(!FIELDS.has(key))return null
    out[key]=value
  }
  if(creating){
    if(typeof out.full_name!=='string'||!out.full_name.trim()||out.full_name.trim().length>160)return null
    if(typeof out.phone!=='string'||!out.phone.trim()||out.phone.trim().length>40)return null
    if(typeof out.source!=='string'||!out.source.trim()||out.source.trim().length>120)return null
    out.stage=out.stage||'signal'
    out.currency_code=out.currency_code||'NGN'
    out.consent_status=out.consent_status||'unknown'
    out.record_status=out.record_status||'active'
  }
  if(out.full_name!==undefined&&(typeof out.full_name!=='string'||!out.full_name.trim()||out.full_name.length>160))return null
  if(out.phone!==undefined&&(typeof out.phone!=='string'||!out.phone.trim()||out.phone.length>40))return null
  if(out.email!==undefined&&out.email!==null&&(typeof out.email!=='string'||out.email.length>254))return null
  if(out.source!==undefined&&(typeof out.source!=='string'||!out.source.trim()||out.source.length>120))return null
  if(out.stage!==undefined&&!STAGES.has(out.stage))return null
  if(out.consent_status!==undefined&&!CONSENT.has(out.consent_status))return null
  if(out.record_status!==undefined&&!RECORD_STATUS.has(out.record_status))return null
  if(out.currency_code!==undefined&&(typeof out.currency_code!=='string'||out.currency_code.length!==3))return null
  if(out.budget_amount!==undefined&&out.budget_amount!==null&&(!Number.isFinite(Number(out.budget_amount))||Number(out.budget_amount)<0))return null
  for(const key of ['preferred_location','property_type','buying_timeline','purpose','payment_preference','motivation','risk_or_objection','next_action_summary']){
    if(out[key]!==undefined&&out[key]!==null&&(typeof out[key]!=='string'||out[key].length>2000))return null
  }
  if(out.next_action_at!==undefined&&out.next_action_at!==null&&Number.isNaN(Date.parse(out.next_action_at)))return null
  return out
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store')
  res.setHeader('X-Content-Type-Options','nosniff')
  res.setHeader('Referrer-Policy','no-referrer')
  if(!['GET','POST','PATCH'].includes(req.method)){res.setHeader('Allow','GET, POST, PATCH');return fail(res,405,'method_not_allowed')}
  const access=await requireWorkspacePermission(req,req.method==='GET'?'contacts.read':'leads.manage')
  if(access.error)return fail(res,access.status,access.error)
  const membership=access.memberships[0]
  const supabase=getPrivilegedSupabaseClient()
  if(!supabase)return fail(res,503,'server_database_not_configured')

  if(req.method==='GET'){
    const limit=Math.min(Math.max(Number.parseInt(req.query?.limit||'100',10)||100,1),250)
    const {data,error}=await supabase.from('dpf_leads').select(SELECT).eq('owner_id',membership.owner_id).order('created_at',{ascending:false}).limit(limit)
    if(error)return fail(res,500,'lead_list_failed')
    return res.status(200).json({ok:true,leads:data||[]})
  }


  if(req.method==='POST'){
    const payload=cleanPayload(req.body,true)
    if(!payload)return fail(res,400,'invalid_lead_payload')
    const {data,error}=await supabase.rpc('dpf_create_lead_with_event',{
      p_owner_id:membership.owner_id,
      p_payload:payload,
    })
    if(error){
      if(error.code==='22023'||error.code==='22P02')return fail(res,400,'invalid_lead_payload')
      return fail(res,500,'lead_create_failed')
    }
    return res.status(201).json({ok:true,lead:data})
  }

  const leadId=req.query?.id
  if(typeof leadId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(leadId)){
    return fail(res,400,'invalid_lead_id')
  }
  const payload=cleanPayload(req.body,false)
  if(!payload||Object.keys(payload).length===0)return fail(res,400,'invalid_lead_payload')
  const {data,error}=await supabase.rpc('dpf_update_lead_with_event',{
    p_owner_id:membership.owner_id,
    p_lead_id:leadId,
    p_payload:payload,
  })
  if(error){
    if(error.code==='22023'||error.code==='22P02')return fail(res,400,'invalid_lead_payload')
    if(error.code==='P0002')return fail(res,404,'lead_not_found')
    return fail(res,500,'lead_update_failed')
  }
  return res.status(200).json({ok:true,lead:data})
}

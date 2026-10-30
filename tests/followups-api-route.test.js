import test from 'node:test'
import assert from 'node:assert/strict'
import followupsHandler from '../api/lead-vault/followups/index.js'

function responseRecorder(){
  return {headers:{},statusCode:200,body:null,setHeader(name,value){this.headers[name]=value},status(code){this.statusCode=code;return this},json(value){this.body=value;return this}}
}

test('follow-up collection rejects unsupported methods',async()=>{
  const res=responseRecorder()
  await followupsHandler({method:'DELETE',headers:{}},res)
  assert.equal(res.statusCode,405)
  assert.equal(res.body.error,'method_not_allowed')
})

test('follow-up list requires an authenticated workspace session',async()=>{
  const res=responseRecorder()
  await followupsHandler({method:'GET',headers:{}},res)
  assert.equal(res.statusCode,401)
  assert.equal(res.body.error,'unauthorized')
})

test('follow-up creation requires authentication before accepting data',async()=>{
  const res=responseRecorder()
  await followupsHandler({method:'POST',headers:{},body:{lead_id:'00000000-0000-4000-8000-000000000001',title:'Call buyer',due_at:'2026-11-01T10:00:00Z'}},res)
  assert.equal(res.statusCode,401)
  assert.equal(res.body.error,'unauthorized')
})

test('follow-up update requires authentication before accepting data',async()=>{
  const res=responseRecorder()
  await followupsHandler({method:'PATCH',headers:{},query:{id:'00000000-0000-4000-8000-000000000001'},body:{status:'completed'}},res)
  assert.equal(res.statusCode,401)
  assert.equal(res.body.error,'unauthorized')
})

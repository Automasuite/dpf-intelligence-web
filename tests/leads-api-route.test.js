import test from 'node:test'
import assert from 'node:assert/strict'
import leadsHandler from '../api/lead-vault/leads/index.js'

function responseRecorder(){
  return {headers:{},statusCode:200,body:null,setHeader(name,value){this.headers[name]=value},status(code){this.statusCode=code;return this},json(value){this.body=value;return this}}
}

test('lead collection rejects unsupported methods',async()=>{
  const res=responseRecorder()
  await leadsHandler({method:'DELETE',headers:{}},res)
  assert.equal(res.statusCode,405)
  assert.equal(res.body.error,'method_not_allowed')
})

test('lead collection requires an authenticated workspace session',async()=>{
  const res=responseRecorder()
  await leadsHandler({method:'GET',headers:{}},res)
  assert.equal(res.statusCode,401)
  assert.equal(res.body.error,'unauthorized')
})

test('lead creation requires an authenticated workspace session before accepting data',async()=>{
  const res=responseRecorder()
  await leadsHandler({method:'POST',headers:{},body:{full_name:'Test',phone:'+2348012345678',source:'test'}},res)
  assert.equal(res.statusCode,401)
  assert.equal(res.body.error,'unauthorized')
})

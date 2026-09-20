import test from 'node:test';
import assert from 'node:assert/strict';
import install from '../firebase/functions-v2/game-api.js';
import contract from '../firebase/functions-v2/game-contract.js';
import {createOrder,toPayload} from '../js/order-model.js';
test('V3 API creates, edits schedule in-place, reads, rejects stale writes and deletes by ID',async()=>{
  const rows=[['NBL_260915_레퍼즈','old-version',JSON.stringify(toPayload(createOrder()))]];
  const sheets={spreadsheets:{values:{
    get:async()=>({data:{values:structuredClone(rows)}}),
    append:async({requestBody,valueInputOption})=>{assert.equal(valueInputOption,'RAW');rows.push(...requestBody.values);},
    update:async({range,requestBody,valueInputOption})=>{assert.equal(valueInputOption,'RAW');rows[Number(range.match(/!A(\d+)/)[1])-2]=requestBody.values[0];}
  },get:async()=>({data:{sheets:[{properties:{sheetId:1,title:'Orders'}}]}}),batchUpdate:async({requestBody})=>{rows.splice(requestBody.requests[0].deleteDimension.range.startIndex-1,1);}}};
  const endpoints=install({functions:{https:{onRequest:f=>f}},withCors:f=>(req,res)=>f(req,res,sheets),auth:{getClient:async()=>({})},google:{sheets:()=>sheets},spreadsheetId:'fixture',sheetName:'Orders'});
  const call=async(name,body,query={})=>{const result={code:200};const res={set(){},status(code){result.code=code;return res;},json(data){result.data=data;return res;},send(){}};await endpoints[name]({method:body?'POST':'GET',body,query},res);return result;};
  const legacy=(await call('getOrdersV3')).data[0];assert.equal(legacy.game.date,'2026-09-15');assert.equal(legacy.game.opponent,'레퍼즈');assert.equal(legacy.game.time,'');
  const id=contract.newId(),game={date:'2026-09-20',time:'12:00',opponent:'상대팀'},payload=toPayload(createOrder());
  const saved=await call('saveOrderV3',{id,game,payload,expectedVersion:null});assert.equal(saved.code,200);assert.equal(rows.length,2);
  const invalid=await call('saveOrderV3',{id:contract.newId(),game:{...game,time:''},payload,expectedVersion:null});assert.equal(invalid.code,400);assert.equal(rows.length,2);
  const updated=await call('saveOrderV3',{id,game:{...game,date:'2026-09-21',opponent:'변경팀'},payload,expectedVersion:saved.data.version});assert.equal(updated.code,200);assert.equal(rows.length,2);
  const read=(await call('getOrderV3',null,{id})).data;assert.equal(read.game.date,'2026-09-21');assert.equal(read.game.opponent,'변경팀');
  const stale=await call('saveOrderV3',{id,game,payload,expectedVersion:'stale'});assert.equal(stale.code,409);
  assert.equal((await call('deleteOrderV3',{id,expectedVersion:'stale'})).code,409);assert.equal(rows.length,2);
  assert.equal((await call('deleteOrderV3',{id,expectedVersion:read.version})).code,200);assert.equal(rows.length,1);
  assert.equal((await call('getOrderV3',null,{legacyName:'NBL_260915_레퍼즈'})).data.id,legacy.id);
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {isolatedServer} from '../scripts/test-server.mjs';

test('Connected APIs enforce permissions, atomic analyzer imports, durable idempotency, and explicitly blocked delivery',async()=>{
 const fixture=await isolatedServer();
 try{
  const {request,admin,password,login}=fixture;
  const call=(path,method='GET',body,cookie=admin.cookie)=>request(path,{method,body,cookie});
  for(const role of ['pathologist','auditor','reception'])assert.equal((await call('/api/users','POST',{username:`platform.${role}`,displayName:`Fictional ${role}`,role,password})).status,201);
  const reviewer=await login('platform.pathologist',password),auditor=await login('platform.auditor',password),reception=await login('platform.reception',password);
  const device={id:'UNIT-TSH',name:'Fictional validation instrument',enabled:true,validationConfirmed:true,mappings:{TSH_EXT:{testCode:'TSH',parameters:{TSH_VALUE:{parameterCode:'tsh',unit:'µIU/mL'}}}}};
  assert.equal((await call('/api/instruments','POST',device,reception.cookie)).status,403);
  assert.equal((await call('/api/instruments','POST',{...device,validationConfirmed:false})).status,422);
  assert.equal((await call('/api/instruments','POST',device)).status,201);
  assert.equal((await call('/api/instruments','POST',device)).status,409);
  assert.equal((await call('/api/instruments','POST',{...device,id:'INVALID',mappings:{bad:{testCode:'toString',parameters:{}}}})).status,422);
  const orders=[];
  for(const id of ['IMPORT-A','IMPORT-B']){
   let result=await call('/api/orders','POST',{id,patientId:'PT-'+id,name:'Fictional import patient',age:35,sex:'Female',tests:['TSH'],status:'Registered',paid:0,results:{},notes:''});assert.equal(result.status,201);let order=result.body.order;
   for(const status of ['Collected','Processing']){result=await call('/api/orders/'+id,'PUT',{...order,status,expectedVersion:order.version});assert.equal(result.status,200);order=result.body.order;}orders.push(order);
  }
  const header='order_id,test_code,parameter_code,value,unit,instrument_id,run_id\r\n';
  const row=(id,run,value='2.1',unit='µIU/mL')=>`${id},TSH_EXT,TSH_VALUE,${value},${unit},UNIT-TSH,${run}\r\n`;
  let result=await call('/api/analyzer-imports','POST',{instrumentId:'UNIT-TSH',csv:header+row('IMPORT-A','BAD')+row('MISSING','BAD')});assert.equal(result.status,422);
  let state=(await call('/api/state')).body;assert(state.orders.every(o=>Object.keys(o.results).length===0),'invalid batch must change no patient result');
  const csv=header+row('IMPORT-A','RUN-001')+row('IMPORT-B','RUN-001');
  assert.equal((await call('/api/analyzer-imports','POST',{instrumentId:'UNIT-TSH',csv},reception.cookie)).status,403);
  result=await call('/api/analyzer-imports','POST',{instrumentId:'UNIT-TSH',csv});assert.equal(result.status,200);assert.equal(result.body.changedOrders,2);
  state=(await call('/api/state')).body;assert(state.orders.every(o=>o.status==='Processing'&&o.results.tsh===2.1&&o.analyzerProvenance.length===1));
  const omitted={...state.orders[0],name:'Fictional corrected identity',expectedVersion:state.orders[0].version};delete omitted.results;delete omitted.notes;assert.equal((await call('/api/orders/'+omitted.id,'PUT',omitted,reception.cookie)).status,403,'omitted clinical fields cannot bypass result-edit permissions');
  const versions=state.orders.map(o=>o.version);result=await call('/api/analyzer-imports','POST',{instrumentId:'UNIT-TSH',csv});assert.equal(result.status,200);assert.equal(result.body.duplicate,true);assert.equal(result.body.changedOrders,0);
  assert.deepEqual((await call('/api/state')).body.orders.map(o=>o.version),versions);
  assert.equal((await call('/api/analyzer-imports','POST',{instrumentId:'UNIT-TSH',csv:csv.replace('2.1','2.2')})).status,422);
  let order=state.orders.find(o=>o.id==='IMPORT-A');result=await call('/api/orders/'+order.id,'PUT',{...order,status:'Review',expectedVersion:order.version});assert.equal(result.status,200);order=result.body.order;
  assert.equal((await call('/api/orders/'+order.id,'PUT',{...order,status:'Approved',expectedVersion:order.version})).status,403,'importing staff cannot approve their own imported results');
  result=await call('/api/orders/'+order.id,'PUT',{...order,status:'Approved',expectedVersion:order.version},reviewer.cookie);assert.equal(result.status,200);order=result.body.order;
  assert(order.catalogSnapshot&&order.resultEnteredBy!==order.approvedBy);
  const destination='+919000000001',body={channel:'whatsapp',destination,expectedVersion:order.version,consent:{granted:true,scope:'report_delivery',channel:'whatsapp',destination,patientId:order.patientId,recordedAt:new Date().toISOString(),recordedBy:admin.body.user.id}};
  assert.equal((await call('/api/orders/'+order.id+'/delivery-intents','POST',body,auditor.cookie)).status,403,'audit role is read only');
  assert.equal((await call('/api/orders/'+order.id+'/delivery-intents','POST',{...body,consent:{...body.consent,granted:false}})).status,422);
  result=await call('/api/orders/'+order.id+'/delivery-intents','POST',body);assert.equal(result.status,201);assert.equal(result.body.delivery.status,'blocked');assert.equal(result.body.delivery.providerMessageId,null);
  const again=await call('/api/orders/'+order.id+'/delivery-intents','POST',body);assert.equal(again.body.duplicate,true);assert.equal(again.body.delivery.id,result.body.delivery.id);
  assert.equal((await call('/api/deliveries')).body.deliveries.length,1);
  const readiness=await call('/api/readiness');assert.equal(readiness.status,200);assert.equal(readiness.body.ready,false);assert(readiness.body.checks.some(c=>c.id==='clinical_validation_record'&&c.status==='blocked'));
  const audit=(await call('/api/audit')).body.events;assert.equal(audit.filter(e=>e.type==='analyzer-import').length,2);assert.equal(audit.filter(e=>e.type==='delivery-request').length,1);
 }finally{await fixture.close();}
});

test('Production report release fails closed without the laboratory catalog validation record',async()=>{
 const f=await isolatedServer({nodeEnv:'production'});
 try{
  const send=(path,body,cookie=f.admin.cookie)=>f.request(path,{method:'POST',body,cookie});
  await send('/api/users',{username:'clinical.reviewer',displayName:'Fictional test reviewer',role:'pathologist',password:f.password});
  const reviewer=await f.login('clinical.reviewer',f.password);
  let value=await send('/api/orders',{id:'VALIDATION-HOLD',patientId:'TEST',name:'Fictional validation test',age:35,sex:'Male',tests:['TSH'],status:'Registered',paid:0,results:{},notes:''});let order=value.body.order;
  for(const status of ['Collected','Processing','Review']){value=await f.request('/api/orders/'+order.id,{method:'PUT',cookie:f.admin.cookie,body:{...order,status,results:status==='Review'?{tsh:2.1}:{},expectedVersion:order.version}});assert.equal(value.status,200);order=value.body.order;}
  value=await f.request('/api/orders/'+order.id,{method:'PUT',cookie:reviewer.cookie,body:{...order,status:'Approved',expectedVersion:order.version}});
  assert.equal(value.status,422);assert(value.body.details.blockers.some(b=>b.code==='clinical-validation-required'));
  const saved=(await f.request('/api/state',{cookie:f.admin.cookie})).body.orders.find(o=>o.id===order.id);assert.equal(saved.status,'Review');assert.equal(saved.version,order.version);
 }finally{await f.close();}
});


test('Shared worklist stays bounded while search and totals include historical records',async()=>{
 const f=await isolatedServer();try{const {DatabaseSync}=await import('node:sqlite');const {resolve}=await import('node:path');const db=new DatabaseSync(resolve(f.directory,'labflow.sqlite'));try{const insert=db.prepare('INSERT INTO orders(id,payload,version) VALUES(?,?,1)');db.exec('BEGIN');for(let n=0;n<260;n++){const id='HISTORY-'+String(n).padStart(4,'0');insert.run(id,JSON.stringify({id,patientId:'PT-'+n,name:n===0?'Historical Lookup Name':'Fictional history '+n,age:35,sex:'Male',tests:['TSH'],status:'Registered',amount:400,paid:0,results:{},version:1,createdAt:new Date().toISOString()}));}db.exec('COMMIT');}finally{db.close();}let value=await f.request('/api/state',{cookie:f.admin.cookie});assert.equal(value.body.orders.length,250);assert.equal(value.body.stats.totalOrders,260);assert.equal(value.body.stats.totalInvoiced,104000);assert(!value.body.orders.some(o=>o.id==='HISTORY-0000'));value=await f.request('/api/orders?q=Historical%20Lookup',{cookie:f.admin.cookie});assert.equal(value.status,200);assert.equal(value.body.orders[0].id,'HISTORY-0000');assert.equal(value.body.hasMore,false);value=await f.request('/api/orders?q=Fictional',{cookie:f.admin.cookie});assert.equal(value.body.orders.length,100);assert.equal(value.body.hasMore,true);assert.equal((await f.request('/api/orders?q=x',{cookie:f.admin.cookie})).status,422);}finally{await f.close();}
});

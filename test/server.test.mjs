import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir, readFile, writeFile, cp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { TESTS, PARAMETERS } from '../dist/catalog.js';

const dataDir = await mkdtemp(join(tmpdir(),'labflow-server-test-'));
// Use dynamic port allocation to avoid collisions with other test runs.
const portReservation = net.createServer();
await new Promise((resolve,reject)=>{portReservation.once('error',reject);portReservation.listen(0,'127.0.0.1',resolve);});
const port = portReservation.address().port;
await new Promise(resolve=>portReservation.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const credentials = 'Basic '+Buffer.from('test-user:local-test-password-1234').toString('base64');
let child;
async function start(runtimeRoot=fileURLToPath(new URL('..',import.meta.url))) {
  child = spawn(process.execPath,['server.mjs'],{cwd:runtimeRoot,env:{...process.env,LAB_DEMO:'0',LAB_ALLOW_BASIC:'1',LAB_REQUIRE_INDEPENDENT_REVIEW:'0',LAB_HOST:'127.0.0.1',LAB_USER:'test-user',LAB_PASSWORD:'local-test-password-1234',LAB_DATA_DIR:dataDir,PORT:String(port)},stdio:['ignore','pipe','pipe']});
  let logs=''; child.stdout.on('data',chunk=>{logs+=chunk;}); child.stderr.on('data',chunk=>{logs+=chunk;});
  for(let i=0;i<200;i++) {
    if(child.exitCode!=null) throw new Error(logs);
    try { const response=await fetch(origin+'/api/health',{headers:{Authorization:credentials}}); if(response.ok) return; } catch{}
    await new Promise(resolve=>setTimeout(resolve,30));
  }
  throw new Error('Server not ready: '+logs);
}
async function stop() { if(!child || child.exitCode!=null) return; const closed=new Promise(resolve=>child.once('exit',resolve)); child.kill('SIGTERM'); await closed; }
async function request(path,method='GET',data,extra={}) {
  const headers={Authorization:credentials,...extra};
  if(data!==undefined) {headers.Origin=origin;headers['Content-Type']='application/json';}
  const response=await fetch(origin+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)});
  return {status:response.status,body:await response.json(),headers:response.headers};
}
try {
  await start();
  assert.equal((await fetch(origin+'/api/state')).status,401,'requires credentials');
  assert.equal((await request('/api/state')).body.orders.length,0,'new database starts empty');
  const actorId=(await request('/api/session')).body.user.id;
  const input={id:'TEST-001',patientId:'PT-1',name:'Test Patient',age:34,sex:'Male',phone:'9000000000',email:'test@example.com',category:'Walk-in',referrer:'Dr Test',tests:['CBC'],priority:'Routine',status:'Registered',amount:1,paid:0,paymentMethod:'Cash',results:{},notes:'',reportSnapshot:{labName:'Forged lab'},catalogSnapshot:{tests:{CBC:{name:'Forged panel'}},parameters:{}},collectedAt:'1900-01-01',processingAt:'1900-01-01',receivedAt:'1900-01-01',approvedAt:'1900-01-01',approvedBy:'forged-user'};
  let result=await request('/api/orders','POST',input);
  assert.equal(result.status,201); let order=result.body.order;
  assert.equal(order.amount,450,'server ignores client-supplied totals');
  assert.equal(order.version,1);
  assert.equal(order.reportSnapshot,null,'client cannot set a release snapshot');
  assert.equal(order.catalogSnapshot,null,'client cannot set a catalog snapshot');
  for(const key of ['collectedAt','processingAt','receivedAt','approvedAt','approvedBy']) assert.equal(order[key],null,`client cannot set ${key}`);
  assert.equal((await request('/api/orders','POST',input)).status,409,'duplicate IDs rejected');
  assert.equal((await request('/api/orders/TEST-001','PUT',{...order,status:'Processing',expectedVersion:1})).status,422,'cannot skip collection');
  const wrongOrigin=await fetch(origin+'/api/orders',{method:'POST',headers:{Authorization:credentials,Origin:'https://other.example','Content-Type':'application/json'},body:JSON.stringify({...input,id:'BAD'})});
  assert.equal(wrongOrigin.status,403,'rejects cross-origin writes');
  result=await request('/api/orders/TEST-001','PUT',{...order,status:'Collected',expectedVersion:order.version});
  assert.equal(result.status,200); order=result.body.order;
  assert.equal((await request('/api/orders/TEST-001','PUT',{...order,tests:['TSH'],expectedVersion:order.version})).status,422,'cannot change tests after collection');
  assert.equal((await request('/api/orders/TEST-001','PUT',{...order,status:'Processing',expectedVersion:1})).status,409,'stale client rejected');
  result=await request('/api/orders/TEST-001','PUT',{...order,status:'Processing',expectedVersion:order.version});
  assert.equal(result.status,200); order=result.body.order;
  assert.equal((await request('/api/orders/TEST-001','PUT',{...order,status:'Review',expectedVersion:order.version})).status,422,'incomplete results cannot enter review');
  const results=Object.fromEntries(TESTS.CBC.parameters.map(key=>[key,(PARAMETERS[key].min+PARAMETERS[key].max)/2]));
  const beforeFailures=(await request('/api/state')).body;
  for(const value of [-1,' ',[],[1],{},true]) {
    assert.equal((await request('/api/orders/TEST-001','PUT',{...order,results:{...results,hb:value},expectedVersion:order.version})).status,422,'rejects invalid or negative measured results');
  }
  for(const value of [' ',[],[1],{},true]) {
    assert.equal((await request('/api/orders','POST',{...input,id:'BAD-NUMBER',age:value})).status,422,'rejects nonnumeric ages without coercing to zero');
    assert.equal((await request('/api/orders/TEST-001','PUT',{...order,paid:value,expectedVersion:order.version})).status,422,'rejects nonnumeric payments without coercion');
  }
  assert.equal((await request('/api/orders/TEST-001','PUT',null)).status,422,'invalid update bodies receive validation errors');
  assert.equal((await request('/api/orders/%ZZ','PUT',{...order,expectedVersion:order.version})).status,400,'malformed order paths receive a client error');
  assert.equal((await request('/api/orders/TEST-001','PUT',{...order,expectedVersion:undefined})).status,409,'updates require optimistic version');
  const afterFailures=(await request('/api/state')).body;
  assert.deepEqual(afterFailures,beforeFailures,'failed writes leave order contents, version, timestamps and audit unchanged');
  assert.equal((await request('/api/orders/TEST-001','PUT',{...order,results:{...results,unknown:2},expectedVersion:order.version})).status,422,'rejects unexpected results');
  result=await request('/api/orders/TEST-001','PUT',{...order,results,status:'Review',expectedVersion:order.version});
  assert.equal(result.status,200); order=result.body.order;
  result=await request('/api/orders/TEST-001','PUT',{...order,status:'Approved',expectedVersion:order.version});
  assert.equal(result.status,200); order=result.body.order;
  assert.ok(order.approvedAt);
  assert.equal(order.approvedBy,actorId);
  assert.equal(order.reportSnapshot.labName,'Labflow Diagnostics','approval takes a server-owned laboratory snapshot');
  assert.deepEqual(Object.keys(order.catalogSnapshot.tests),['CBC']);
  assert.deepEqual(order.catalogSnapshot.parameters.hb,PARAMETERS.hb,'release captures result names, units and reference definitions');
  assert.equal((await request('/api/orders/TEST-001','PUT',{...order,results:{...results,hb:1},expectedVersion:order.version})).status,422,'approved clinical data is locked');
  assert.equal((await request('/api/orders/TEST-001','PUT',{...order,paid:451,expectedVersion:order.version})).status,422,'rejects overpayment');
  result=await request('/api/orders/TEST-001','PUT',{...order,paid:450,expectedVersion:order.version});
  assert.equal(result.status,200); order=result.body.order;
  assert.equal((await request('/api/orders/TEST-001','PUT',{...order,paid:400,expectedVersion:order.version})).status,422,'rejects unsupported refund');
  const state=(await request('/api/state')).body;
  assert.equal(state.orders.length,1); assert.equal(state.activity.length,6);
  const backup=await request('/api/backup');
  assert.equal(backup.status,200); assert.equal(backup.body.orders.length,1); assert.ok(backup.headers.get('content-disposition').includes('attachment'));
  assert.equal(backup.body.audit.length,6);
  await stop(); await start();
  const persisted=(await request('/api/state')).body;
  assert.equal(persisted.orders[0].paid,450,'records persist after restart');
  assert.equal(persisted.activity.length,7,'audit and backup event persist');

  // Report configuration accepts only supported settings and preserves omitted
  // existing values when changing a template or one part of a letterhead.
  const profile={labName:'Release Test Laboratory',address:'Test address',phone:'9000000000',email:'lab@example.com',registration:'TEST-REG',pathologist:'',reportTemplate:'sahara',website:'https://lab.example.com',labIncharge:'',labInchargeQualification:'DMLT',pathologistQualification:'MD Pathology',reportFooter:'Correlate results clinically.',workingHours:'Monday to Saturday, 8am–8pm'};
  result=await request('/api/settings','PUT',profile);
  assert.equal(result.status,200); assert.deepEqual(result.body.settings,profile);
  for(const template of ['classic','minimal','sahara']) {
    result=await request('/api/settings','PUT',{reportTemplate:template});
    assert.equal(result.status,200); assert.equal(result.body.settings.reportTemplate,template);
    assert.equal(result.body.settings.labName,profile.labName,'partial settings update preserves lab name');
    assert.equal(result.body.settings.reportFooter,profile.reportFooter,'partial settings update preserves footer');
  }
  assert.equal((await request('/api/settings','PUT',{reportTemplate:'unrecognized'})).status,422,'rejects unsupported report template');
  assert.equal((await request('/api/settings','PUT',{reportFooter:[]})).status,422,'rejects non-text letterhead fields');
  assert.equal((await request('/api/settings','PUT',{reportFooter:null})).status,422,'rejects null letterhead fields');
  assert.equal((await request('/api/settings','PUT',{reportFooter:'x'.repeat(1501)})).status,422,'enforces letterhead length limits');
  assert.equal((await request('/api/settings','PUT',{signature:'not-a-verified-signature'})).status,422,'rejects settings outside whitelist');

  const panelCodes=Object.keys(TESTS);
  assert.equal(panelCodes.length,15,'report generator exposes the requested fifteen panels');
  result=await request('/api/orders','POST',{...input,id:'TEST-ALL',patientId:'PT-ALL',tests:panelCodes});
  assert.equal(result.status,201,'accepts all catalog panels in one order');
  let allPanels=result.body.order;
  assert.equal(allPanels.amount,panelCodes.reduce((total,code)=>total+TESTS[code].price,0),'prices all panels on server');
  assert.equal(allPanels.tests.length,15);
  const save=async changes=>{
    const response=await request('/api/orders/TEST-ALL','PUT',{...allPanels,...changes,expectedVersion:allPanels.version});
    assert.equal(response.status,200,response.body.error); allPanels=response.body.order;
  };
  await save({status:'Collected',collectedAt:'1900-01-01'});
  const collectedAt=allPanels.collectedAt;
  assert.ok(Number.isFinite(Date.parse(collectedAt))); assert.notEqual(collectedAt,'1900-01-01');
  await save({status:'Processing',collectedAt:'1900-01-01',processingAt:'1900-01-01',receivedAt:'1900-01-01'});
  assert.equal(allPanels.collectedAt,collectedAt,'collection timestamp stays fixed');
  const processingAt=allPanels.processingAt, receivedAt=allPanels.receivedAt;
  assert.ok(Number.isFinite(Date.parse(processingAt))); assert.equal(receivedAt,processingAt);
  const allResults=Object.fromEntries([...new Set(panelCodes.flatMap(code=>TESTS[code].parameters))].map(key=>[key,(PARAMETERS[key].min+PARAMETERS[key].max)/2]));
  await save({status:'Review',results:allResults,reportSnapshot:{labName:'Forged lab'},catalogSnapshot:{tests:{},parameters:{}}});
  assert.equal(allPanels.reportSnapshot,null,'snapshot is not accepted before approval');
  assert.equal(allPanels.catalogSnapshot,null,'catalog snapshot is not accepted before approval');
  await save({status:'Approved',reportSnapshot:{labName:'Forged lab'},catalogSnapshot:{tests:{},parameters:{}},approvedAt:'1900-01-01',approvedBy:'forged-user'});
  const snapshot=allPanels.reportSnapshot, releaseCatalog=allPanels.catalogSnapshot, approvedAt=allPanels.approvedAt;
  assert.deepEqual(snapshot,profile,'release freezes the current laboratory profile');
  assert.deepEqual(Object.keys(releaseCatalog.tests),panelCodes,'release includes exactly the ordered panel definitions');
  assert.deepEqual(Object.keys(releaseCatalog.parameters).sort(),Object.keys(allResults).sort(),'release includes exactly the reported parameter definitions');
  for(const [key,definition] of Object.entries(releaseCatalog.parameters)) assert.deepEqual(definition,PARAMETERS[key]);
  assert.equal(allPanels.approvedBy,actorId); assert.notEqual(approvedAt,'1900-01-01');
  result=await request('/api/settings','PUT',{labName:'Changed after release',reportTemplate:'minimal',reportFooter:'New footer'});
  assert.equal(result.status,200);
  await save({paid:0.29,amount:1,reportSnapshot:{labName:'Forged lab'},catalogSnapshot:{tests:{},parameters:{}},collectedAt:'1900-01-01',processingAt:'1900-01-01',receivedAt:'1900-01-01',approvedAt:'1900-01-01',approvedBy:'forged-user',results:Object.fromEntries(Object.entries(allResults).reverse())});
  assert.equal(allPanels.paid,0.29,'accepts valid fractional payments');
  assert.deepEqual(allPanels.reportSnapshot,snapshot,'billing and later profile edits cannot rewrite a released letterhead');
  assert.deepEqual(allPanels.catalogSnapshot,releaseCatalog,'client cannot replace a released catalog');
  assert.equal(allPanels.approvedAt,approvedAt); assert.equal(allPanels.approvedBy,actorId);
  assert.equal(allPanels.collectedAt,collectedAt); assert.equal(allPanels.processingAt,processingAt); assert.equal(allPanels.receivedAt,receivedAt);
  assert.equal(allPanels.amount,panelCodes.reduce((total,code)=>total+TESTS[code].price,0),'released bill total is immutable');
  const fullBackup=(await request('/api/backup')).body;
  const latestBilling=fullBackup.audit.filter(row=>row.order_id==='TEST-ALL' && row.type==='billing').at(-1);
  assert.ok(latestBilling,'payment has an audit entry');
  assert.deepEqual(JSON.parse(latestBilling.before_json).reportSnapshot,snapshot);
  assert.deepEqual(JSON.parse(latestBilling.after_json).reportSnapshot,snapshot,'audit preserves snapshot across billing');
  assert.deepEqual(JSON.parse(latestBilling.after_json).catalogSnapshot,releaseCatalog,'audit preserves clinical definitions across billing');

  // Keep a quoted order and a complete Review draft open across a real catalog
  // upgrade. This uses an isolated runtime copy, never mutating project files.
  result=await request('/api/orders','POST',{...input,id:'QUOTED-ORDER',tests:['CBC','TSH']});
  assert.equal(result.status,201); const quoted=result.body.order;
  result=await request('/api/orders','POST',{...input,id:'REVIEW-OLD'});
  assert.equal(result.status,201); let reviewOrder=result.body.order;
  for(const status of ['Collected','Processing','Review']) {
    result=await request('/api/orders/REVIEW-OLD','PUT',{...reviewOrder,status,results,expectedVersion:reviewOrder.version});
    assert.equal(result.status,200); reviewOrder=result.body.order;
  }

  // Simulate a persisted release from the previous six-panel version, before
  // CBC gained RDW parameters and before report snapshots were implemented.
  await stop();
  const fixtureDb=new DatabaseSync(join(dataDir,'labflow.sqlite'));
  const legacy=JSON.parse(fixtureDb.prepare('SELECT payload FROM orders WHERE id=?').get('TEST-001').payload);
  delete legacy.results.rdw_cv; delete legacy.results.rdw_sd; delete legacy.reportSnapshot; delete legacy.catalogSnapshot;
  fixtureDb.prepare('UPDATE orders SET payload=? WHERE id=?').run(JSON.stringify(legacy),'TEST-001');
  delete reviewOrder.processingAt; delete reviewOrder.receivedAt;
  fixtureDb.prepare('UPDATE orders SET payload=? WHERE id=?').run(JSON.stringify(reviewOrder),'REVIEW-OLD'); fixtureDb.close();
  const variantDirectory=join(dataDir,'changed-catalog-runtime');
  await mkdir(join(variantDirectory,'dist'),{recursive:true});
  await mkdir(join(variantDirectory,'lib'),{recursive:true});
  await cp(new URL('../lib/',import.meta.url),join(variantDirectory,'lib'),{recursive:true});
  await cp(new URL('../scripts/',import.meta.url),join(variantDirectory,'scripts'),{recursive:true});
  await writeFile(join(variantDirectory,'server.mjs'),await readFile(new URL('../server.mjs',import.meta.url),'utf8'));
  await writeFile(join(variantDirectory,'package.json'),JSON.stringify({type:'module'}));
  await writeFile(join(variantDirectory,'dist/catalog.js'),`import {TESTS as originalTests,PARAMETERS as originalParameters,reportNotes as originalNotes} from ${JSON.stringify(new URL('../dist/catalog.js',import.meta.url).href)};
export const TESTS=structuredClone(originalTests),PARAMETERS=structuredClone(originalParameters),reportNotes=structuredClone(originalNotes);
TESTS.CBC.price=999; TESTS.CBC.name='Changed panel name'; TESTS.CBC.sample='Changed specimen';
PARAMETERS.hb.name='Changed analyte'; PARAMETERS.hb.unit='changed-unit'; PARAMETERS.hb.min=1; PARAMETERS.hb.max=2; PARAMETERS.hb.reference='Changed range';
PARAMETERS.future_marker={name:'New marker',unit:'U/L',min:0,max:10,reference:'0–10'};
TESTS.CBC.parameters.push('future_marker'); delete TESTS.ESR; reportNotes.CBC='Changed interpretation guidance';`);
  await start(variantDirectory);
  result=await request('/api/orders/TEST-001','PUT',{...legacy,paymentMethod:'UPI',amount:1,reportSnapshot:{labName:'Forged lab'},expectedVersion:legacy.version});
  assert.equal(result.status,200,'legacy approved records remain payable without newly introduced results');
  assert.deepEqual(result.body.order.results,legacy.results,'legacy released result set stays unchanged');
  assert.equal(result.body.order.amount,legacy.amount); assert.equal(result.body.order.reportSnapshot,undefined,'legacy records are not given a forged or retroactive snapshot');
  assert.equal(result.body.order.catalogSnapshot,undefined,'legacy records are not given retroactive clinical definitions');
  assert.equal(result.body.order.approvedAt,legacy.approvedAt); assert.equal(result.body.order.approvedBy,legacy.approvedBy);

  const reopened=(await request('/api/state')).body.orders.find(item=>item.id==='TEST-ALL');
  assert.deepEqual(reopened.catalogSnapshot,releaseCatalog,'reopened reports retain their clinical definitions after a catalog upgrade');
  assert.equal(reopened.catalogSnapshot.tests.CBC.name,TESTS.CBC.name);
  assert.ok(reopened.catalogSnapshot.tests.ESR,'released panel remains available after removal from live catalog');
  result=await request('/api/orders/TEST-ALL','PUT',{...reopened,paid:1,expectedVersion:reopened.version});
  assert.equal(result.status,200,'released orders remain payable after live panel removal');
  assert.deepEqual(result.body.order.catalogSnapshot,releaseCatalog);
  result=await request('/api/orders/QUOTED-ORDER','PUT',{...quoted,tests:quoted.tests.slice().reverse(),notes:'Updated note',expectedVersion:quoted.version});
  assert.equal(result.status,200); assert.equal(result.body.order.amount,quoted.amount,'clinical edits do not silently change an existing quote');
  assert.deepEqual(result.body.order.tests,quoted.tests,'reordering the same panels preserves original order and quote');
  result=await request('/api/orders/REVIEW-OLD','PUT',{...reviewOrder,paid:0.29,expectedVersion:reviewOrder.version});
  assert.equal(result.status,200,'billing-only saves do not require newly introduced draft parameters'); reviewOrder=result.body.order;
  assert.equal(reviewOrder.amount,450,'catalog price upgrade does not reprice draft billing');
  result=await request('/api/orders/REVIEW-OLD','PUT',{...reviewOrder,status:'Processing',expectedVersion:reviewOrder.version});
  assert.equal(result.status,200,'reviewer can return a draft for correction'); reviewOrder=result.body.order;
  const correctedProcessingAt=reviewOrder.processingAt;
  assert.equal(correctedProcessingAt,null,'returning a legacy review does not invent an original processing time');
  assert.equal(reviewOrder.receivedAt,null,'returning a legacy review does not invent a received time');
  const beforeIncomplete=(await request('/api/state')).body;
  result=await request('/api/orders/REVIEW-OLD','PUT',{...reviewOrder,status:'Review',expectedVersion:reviewOrder.version});
  assert.equal(result.status,422,'resubmission requires newly configured mandatory parameters');
  assert.deepEqual((await request('/api/state')).body,beforeIncomplete,'failed resubmission commits no partial status or audit');
  result=await request('/api/orders/REVIEW-OLD','PUT',{...reviewOrder,status:'Review',results:{...reviewOrder.results,hb:14,future_marker:5},expectedVersion:reviewOrder.version});
  assert.equal(result.status,200); reviewOrder=result.body.order;
  assert.equal(reviewOrder.processingAt,correctedProcessingAt,'correction cycle preserves original processing timestamp');
  result=await request('/api/orders/REVIEW-OLD','PUT',{...reviewOrder,status:'Approved',expectedVersion:reviewOrder.version});
  assert.equal(result.status,200);
  assert.equal(result.body.order.catalogSnapshot.parameters.hb.unit,'changed-unit','new approval captures current reviewed definitions');
  assert.ok(result.body.order.catalogSnapshot.parameters.future_marker);
  assert.equal(result.body.order.amount,450,'report approval preserves the order quote');
  const correctionBackup=(await request('/api/backup')).body;
  assert.ok(correctionBackup.audit.some(row=>row.order_id==='REVIEW-OLD' && row.type==='review' && row.message.includes('correction')),'return for correction is explicitly audited');

  // Report amendment: approved reports can be amended via POST /api/orders/:id/amend
  const amendResult=await request('/api/orders/REVIEW-OLD/amend','POST',{reason:'Corrected sample re-run',expectedVersion:result.body.order.version});
  assert.equal(amendResult.status,201,'authorized staff can create linked amended report');
  const amendedOrder=amendResult.body.order;
  assert.equal(amendedOrder.id,'REVIEW-OLD-CORR1');
  assert.equal(amendedOrder.originalOrderId,'REVIEW-OLD');
  assert.equal(amendedOrder.amendmentReason,'Corrected sample re-run');
  assert.equal(amendedOrder.status,'Processing');
  assert.equal(amendedOrder.resultsRevision,(result.body.order.resultsRevision||1)+1);
  assert.equal(amendedOrder.approvedAt,null,'amended report requires new approval');
  const originalAfterAmend=(await request('/api/state')).body.orders.find(o=>o.id==='REVIEW-OLD');
  assert.equal(originalAfterAmend.status,'Approved','original report remains approved and immutable');
  assert.equal(originalAfterAmend.amendedByOrder,'REVIEW-OLD-CORR1');
  assert.equal((await request('/api/orders/TEST-001/amend','POST',{reason:''})).status,422,'amendment requires non-empty reason');
  console.log('PASS: report snapshots, reopen after catalog changes, review correction, numeric validation, failed-write atomicity, existing-order billing, and previous workflow/security checks.');
} finally { await stop(); await rm(dataDir,{recursive:true,force:true}); }

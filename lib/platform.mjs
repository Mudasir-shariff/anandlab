import {isDeepStrictEqual} from 'node:util';
import {validateAnalyzerImport,createDeliveryIntent,IntegrationError} from './integrations.mjs';
import {checkReadiness} from '../scripts/check-readiness.mjs';
import {TESTS,PARAMETERS} from '../dist/catalog.js';

export function createPlatformRoutes({db,transaction,audit,getOrder,allOrders,normalize,requirePermission,assertOrigin,body,ApiError,root,dataDir}){
 db.exec(`CREATE TABLE IF NOT EXISTS analyzer_instruments(id TEXT PRIMARY KEY,payload TEXT NOT NULL,version INTEGER NOT NULL);
 CREATE TABLE IF NOT EXISTS analyzer_imports(import_key TEXT PRIMARY KEY,checksum TEXT NOT NULL,payload TEXT NOT NULL);
 CREATE TABLE IF NOT EXISTS report_deliveries(id TEXT PRIMARY KEY,payload TEXT NOT NULL);`);
 let readinessCache=null;
 const instruments=()=>db.prepare('SELECT payload FROM analyzer_instruments ORDER BY id').all().map(r=>JSON.parse(r.payload));
 const instrument=id=>{const r=db.prepare('SELECT payload FROM analyzer_instruments WHERE id=?').get(id);return r?JSON.parse(r.payload):null;};
 const plain=value=>value&&typeof value==='object'&&!Array.isArray(value);
 function validateInstrument(input,user){
  if(!plain(input)||!/^[A-Za-z0-9_-]{1,80}$/.test(input.id||'')||typeof input.name!=='string'||!input.name.trim()||input.name.length>150)throw new ApiError(422,'Provide a valid instrument ID and display name.');
  if(input.validationConfirmed!==true)throw new ApiError(422,'Document that the mapping and units were checked against actual instrument output.');
  if(!plain(input.mappings)||!Object.keys(input.mappings).length||Object.keys(input.mappings).length>100)throw new ApiError(422,'Provide at least one test mapping.');
  for(const [external,mapping] of Object.entries(input.mappings)){
   if(!external||external.length>100||!plain(mapping)||!Object.hasOwn(TESTS,mapping.testCode)||!plain(mapping.parameters)||!Object.keys(mapping.parameters).length)throw new ApiError(422,'A test mapping is invalid.');
   for(const [externalParameter,p] of Object.entries(mapping.parameters)){
    if(!externalParameter||externalParameter.length>100||!plain(p)||!TESTS[mapping.testCode].parameters.includes(p.parameterCode)||typeof p.unit!=='string'||p.unit.length>100)throw new ApiError(422,'An analyzer parameter mapping is invalid.');
    if(p.unit!==PARAMETERS[p.parameterCode].unit)throw new ApiError(422,'The mapped target unit must match the canonical parameter unit.');
    if(p.conversion){const c=p.conversion;if(!plain(c)||!Number.isFinite(c.factor)||c.factor<=0||!Number.isFinite(c.offset??0)||typeof c.fromUnit!=='string'||c.toUnit!==PARAMETERS[p.parameterCode].unit)throw new ApiError(422,'A unit conversion must explicitly identify source, target, factor and offset.');}
    else if(p.unit!==PARAMETERS[p.parameterCode].unit)throw new ApiError(422,'Mapped units must match the validated canonical unit, or include an explicit conversion.');
   }
  }
  return {id:input.id,name:input.name.trim(),enabled:input.enabled===true,mappings:input.mappings,validation:{kind:'operator-mapping-attestation',recordedBy:user.id,recordedAt:new Date().toISOString()},version:1};
 }
 return async function platformRoute(req,url,user){
  const path=url.pathname;
  if(path==='/api/readiness'&&req.method==='GET'){
   requirePermission(user,'users:manage');
   if(!readinessCache||Date.now()-readinessCache.at>30_000){const value=await checkReadiness({env:{...process.env,LAB_DATA_DIR:dataDir},root});readinessCache={at:Date.now(),value};}
   const value=readinessCache.value;return {status:200,data:{...value,checks:value.checks.map(c=>({...c,pass:c.status==='pass',name:c.id.replaceAll('_',' ').replace(/^./,ch=>ch.toUpperCase())}))}};
  }
  if(path==='/api/instruments'&&req.method==='GET'){requirePermission(user,'integrations:manage');return {status:200,data:{instruments:instruments()}};}
  if(path==='/api/instruments'&&req.method==='POST'){
   requirePermission(user,'integrations:manage');assertOrigin(req);const value=validateInstrument(await body(req,user),user);
   transaction(()=>{if(instrument(value.id))throw new ApiError(409,'This instrument ID already exists.');db.prepare('INSERT INTO analyzer_instruments(id,payload,version) VALUES(?,?,?)').run(value.id,JSON.stringify(value),value.version);audit(null,'instrument',`Analyzer mapping recorded: ${value.id}`,user.id,null,value);});return {status:201,data:{instrument:value}};
  }
  if(path.startsWith('/api/instruments/')&&req.method==='PATCH'){
   requirePermission(user,'integrations:manage');assertOrigin(req);const input=await body(req,user);let id;try{id=decodeURIComponent(path.slice('/api/instruments/'.length));}catch{throw new ApiError(400,'Invalid instrument path.');}
   const value=transaction(()=>{const old=instrument(id);if(!old)throw new ApiError(404,'Instrument mapping not found.');if(input.expectedVersion!==old.version)throw new ApiError(409,'Instrument mapping changed. Reload before editing.');if(typeof input.enabled!=='boolean')throw new ApiError(422,'Provide the enabled state.');const next={...old,enabled:input.enabled,version:old.version+1};db.prepare('UPDATE analyzer_instruments SET payload=?,version=? WHERE id=?').run(JSON.stringify(next),next.version,id);audit(null,'instrument',`Analyzer mapping ${next.enabled?'enabled':'disabled'}: ${id}`,user.id,old,next);return next;});return {status:200,data:{instrument:value}};
  }
  if(path==='/api/analyzer-imports'&&req.method==='POST'){
   requirePermission(user,'results:write');assertOrigin(req);const input=await body(req,user);if(!plain(input)||typeof input.instrumentId!=='string'||typeof input.csv!=='string')throw new ApiError(422,'Choose an instrument and provide CSV text.');
   const result=transaction(()=>{
    const device=instrument(input.instrumentId);if(!device)throw new ApiError(404,'Instrument mapping not found.');
    const imports=db.prepare('SELECT import_key,checksum FROM analyzer_imports').all().map(r=>({idempotencyKey:r.import_key,checksum:r.checksum}));
    let proposed;try{proposed=validateAnalyzerImport({csv:input.csv,instrument:device,orders:allOrders(),catalog:TESTS,parameters:PARAMETERS,seenImports:imports});}catch(error){if(error instanceof IntegrationError)throw new ApiError(error.status,error.message,{code:error.code,errors:error.errors});throw error;}
    if(proposed.duplicate)return {duplicate:true,changedOrders:0,idempotencyKey:proposed.idempotencyKey};
    for(const change of proposed.changes){
     const old=getOrder(change.orderId);if(!old||old.version!==change.expectedVersion||old.status!=='Processing')throw new ApiError(409,'An order changed before the import committed. No results were imported.');
     if(old.specimen?.state==='rejected'||old.specimens?.some(sp=>sp.status==='Rejected'))throw new ApiError(422,'Rejected specimens cannot accept analyzer results.');
     const next=normalize({...old,results:{...old.results,...change.results}},old);
     if(!isDeepStrictEqual(next.results,old.results))next.resultsRevision=(old.resultsRevision||0)+1;
     next.resultEnteredBy=user.id;next.resultEnteredByName=user.displayName;next.resultEnteredAt=new Date().toISOString();
     next.analyzerProvenance=[...(old.analyzerProvenance||[]),change.provenance];
     db.prepare('UPDATE orders SET payload=?,version=? WHERE id=? AND version=?').run(JSON.stringify(next),next.version,next.id,old.version);
     audit(next.id,'analyzer-import',`Mapped draft results imported from ${device.id}; review required`,user.id,old,next);
    }
    db.prepare('INSERT INTO analyzer_imports(import_key,checksum,payload) VALUES(?,?,?)').run(proposed.idempotencyKey,proposed.checksum,JSON.stringify({instrumentId:proposed.instrumentId,runId:proposed.runId,orderIds:proposed.changes.map(c=>c.orderId),at:new Date().toISOString(),actor:user.id}));
    return {duplicate:false,changedOrders:proposed.changes.length,idempotencyKey:proposed.idempotencyKey};
   });return {status:200,data:result};
  }
  if(path==='/api/deliveries'&&req.method==='GET'){requirePermission(user,'integrations:manage');return {status:200,data:{deliveries:db.prepare('SELECT payload FROM report_deliveries ORDER BY rowid DESC LIMIT 100').all().map(r=>JSON.parse(r.payload))}};}
  const deliveryMatch=path.match(/^\/api\/orders\/([^/]+)\/delivery-intents$/);
  if(deliveryMatch&&req.method==='POST'){
   requirePermission(user,user.role==='reception'?'orders:update':'reports:approve');assertOrigin(req);const input=await body(req,user);let id;try{id=decodeURIComponent(deliveryMatch[1]);}catch{throw new ApiError(400,'Invalid order path.');}
   const result=transaction(()=>{const order=getOrder(id);if(!order)throw new ApiError(404,'Order not found.');if(input.expectedVersion!==order.version)throw new ApiError(409,'Order changed. Reopen the approved report before requesting delivery.');
    const consent={...input.consent,recordedBy:user.id,recordedAt:new Date().toISOString()};let proposal;try{proposal=createDeliveryIntent(order,input.channel,input.destination,consent);}catch(error){if(error instanceof IntegrationError)throw new ApiError(error.status,error.message,{code:error.code});throw error;}
    const previous=db.prepare('SELECT payload FROM report_deliveries WHERE id=?').get(proposal.id);if(previous)return {delivery:JSON.parse(previous.payload),duplicate:true};
    const value={...proposal,status:'blocked',blockReason:'Provider not configured; no message sent',consent,orderId:order.id};db.prepare('INSERT INTO report_deliveries(id,payload) VALUES(?,?)').run(value.id,JSON.stringify(value));audit(order.id,'delivery-request',`${input.channel} report delivery requested; provider is not configured`,user.id,null,value);return {delivery:value,duplicate:false};
   });return {status:201,data:result};
  }
  return null;
 };
}

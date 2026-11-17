import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { TESTS, PARAMETERS } from '../dist/catalog.js';
import { IntegrationError, parseAnalyzerCSV, validateAnalyzerImport, createDeliveryIntent } from '../lib/integrations.mjs';

const header='order_id,test_code,parameter_code,value,unit,instrument_id,run_id';
const instrument={id:'HEMA-01',enabled:true,mappings:{CBC:{testCode:'CBC',parameters:{HGB:{parameterCode:'hb',unit:'g/dL'},WBC:{parameterCode:'wbc',unit:'cells/µL'},LYM:{parameterCode:'lymphocytes',unit:'%'}}}}};
const order={id:'LF-123',patientId:'PT-123',name:'Integration Test',age:40,sex:'Other',status:'Processing',version:3,tests:['CBC'],results:{}};
const makeCSV=(rows)=>`${header}\r\n${rows.join('\r\n')}\r\n`;
const row=(parameter='HGB',value='14',unit='g/dL',id='LF-123',run='RUN-01',device='HEMA-01',panel='CBC')=>[id,panel,parameter,value,unit,device,run].join(',');
const validate=(csv,overrides={})=>validateAnalyzerImport({csv,instrument,orders:[order],catalog:TESTS,parameters:PARAMETERS,seenImports:new Map(),...overrides});
const throwsCode=(fn,code)=>assert.throws(fn,error=>error instanceof IntegrationError&&error.code===code);

 test('CSV accepts BOM,CRLF,reordered headers, escaped quotes, embedded newlines and zero',()=>{
  const reordered='\ufeffVALUE,PARAMETER_CODE,TEST_CODE,order_id,unit,instrument_id,run_id\r\n"0",HGB,CBC,LF-123,"g/dL",HEMA-01,"RUN,""quoted""\r\ncontinued"\r\n';
  const records=parseAnalyzerCSV(reordered);
  assert.equal(records.length,1);assert.equal(records[0].value,'0');assert.equal(records[0].run_id,'RUN,"quoted"\r\ncontinued');assert.equal(records[0].lineNumber,2);
  assert.equal(parseAnalyzerCSV(`${header}\n${row()}\n\n`)[0].order_id,'LF-123');
 });
 test('CSV fails atomically for malformed quotes, columns,duplicate/unknown headers and empty files',()=>{
  throwsCode(()=>parseAnalyzerCSV(`${header}\n"unterminated`),'CSV_UNTERMINATED');
  throwsCode(()=>parseAnalyzerCSV(`${header}\n${row().replace('LF-123','LF"123')}`),'CSV_QUOTE');
  throwsCode(()=>parseAnalyzerCSV(`${header}\n"LF-123"x,CBC,HGB,14,g/dL,HEMA-01,RUN-01`),'CSV_AFTER_QUOTE');
  throwsCode(()=>parseAnalyzerCSV(`${header}\nLF-123,CBC`),'CSV_COLUMNS');
  throwsCode(()=>parseAnalyzerCSV(header.replace('run_id','instrument_id')+'\n'+row()),'CSV_HEADER');
  throwsCode(()=>parseAnalyzerCSV(header+',extra\n'+row()+',ignored'),'CSV_HEADER');
  throwsCode(()=>parseAnalyzerCSV(`${header}\n`),'CSV_EMPTY');
  throwsCode(()=>parseAnalyzerCSV(`${header}\n${row()}\0`),'CSV_CONTROL');
  throwsCode(()=>parseAnalyzerCSV(`${header}\n"${'x'.repeat(65537)}",CBC,HGB,14,g/dL,HEMA-01,RUN-01`),'CSV_FIELD_TOO_LARGE');
 });
 test('Import returns reviewed Processing draft changes with provenance and never mutates records',()=>{
  const before=JSON.stringify({instrument,order,TESTS,PARAMETERS});
  const csv=makeCSV([row(),row('WBC','7200','cells/µL'),row('LYM','0','%')]);
  const result=validate(csv);
  assert.deepEqual(result.errors,[]);assert.equal(result.changes.length,1);
  assert.equal(result.checksum,createHash('sha256').update(csv).digest('hex'));
  const [change]=result.changes;assert.equal(change.orderId,order.id);assert.equal(change.expectedVersion,3);assert.equal(change.status,'Processing');assert.equal(change.requiresReview,true);
  assert.deepEqual(change.results,{hb:14,wbc:7200,lymphocytes:0});assert.equal(change.provenance.measurements.length,3);assert.equal(change.provenance.measurements[0].rawUnit,'g/dL');
  assert.equal(JSON.stringify({instrument,order,TESTS,PARAMETERS}),before);
 });
 test('Conflicting rows fail the entire batch, identical duplicates collapse while provenance remains',()=>{
  const result=validate(makeCSV([row(),row()]));assert.equal(result.changes[0].results.hb,14);assert.equal(result.changes[0].provenance.measurements.length,2);
  assert.throws(()=>validate(makeCSV([row(),row('HGB','16')])),error=>error.code==='ANALYZER_IMPORT_INVALID'&&error.errors.some(item=>item.code==='DUPLICATE_CONFLICT'));
  throwsCode(()=>validate(makeCSV([row(),row('WBC','7200','cells/µL','UNKNOWN')])),'ANALYZER_IMPORT_INVALID');
 });
 test('Only configured panels/analytes and exact specimen-order Processing records are accepted',()=>{
  for(const csv of [makeCSV([row('UNKNOWN')]),makeCSV([row('HGB','14','g/dL','LF-123','RUN-01','HEMA-01','UNKNOWN')]),makeCSV([row('HGB','14','g/dL','UNKNOWN')]),makeCSV([row('HGB','14','g/dL','LF-123','OTHER','OTHER')])])throwsCode(()=>validate(csv),'ANALYZER_IMPORT_INVALID');
  throwsCode(()=>validate(makeCSV([row()]),{orders:[{...order,status:'Review'}]}),'ANALYZER_IMPORT_INVALID');
  throwsCode(()=>validate(makeCSV([row()]),{orders:[{...order,status:'Approved'}]}),'ANALYZER_IMPORT_INVALID');
  throwsCode(()=>validate(makeCSV([row()]),{orders:[{...order,tests:['LFT']}]}),'ANALYZER_IMPORT_INVALID');
  throwsCode(()=>validate(makeCSV([row()]),{instrument:{...instrument,enabled:false}}),'INSTRUMENT_DISABLED');
  throwsCode(()=>validate(makeCSV([row()]),{instrument:{...instrument,mappings:{CBC:{testCode:'CBC',parameters:{HGB:{parameterCode:'hb',unit:'mg/dL'}}}}}}),'CONFIG_INVALID');
 });
 test('Unit conversion is opt-in per instrument analyte; no implicit aliases or scaling',()=>{
  throwsCode(()=>validate(makeCSV([row('WBC','7.2','10^3/µL')])),'ANALYZER_IMPORT_INVALID');
  const configured=structuredClone(instrument);configured.mappings.CBC.parameters.WBC.conversion={fromUnit:'10^3/µL',toUnit:'cells/µL',factor:1000,offset:0};
  const result=validate(makeCSV([row('WBC','7.2','10^3/µL')]),{instrument:configured});assert.equal(result.changes[0].results.wbc,7200);assert.equal(result.changes[0].provenance.measurements[0].conversion.factor,1000);
  throwsCode(()=>validate(makeCSV([row('WBC','7.2','10^3/μL')]),{instrument:configured}),'ANALYZER_IMPORT_INVALID');
 });
 test('Invalid numeric payloads and unreviewed overwrites are blocked',()=>{
  for(const value of ['NaN','Infinity','0x10','=1+2','1e999','1e10','""'])throwsCode(()=>validate(makeCSV([row('HGB',value)])),'ANALYZER_IMPORT_INVALID');
  throwsCode(()=>validate(makeCSV([row()]),{orders:[{...order,results:{hb:13}}]}),'ANALYZER_IMPORT_INVALID');
  assert.equal(validate(makeCSV([row()]),{orders:[{...order,results:{hb:14}}]}).changes[0].results.hb,14);
 });
 test('Instrument/run/payload idempotency remains safe after order approval',()=>{
  const csv=makeCSV([row()]);const initial=validate(csv);const seen=new Map([[initial.idempotencyKey,{checksum:initial.checksum}]]);
  const duplicate=validate(csv,{seenImports:seen,orders:[{...order,status:'Approved'}]});assert.equal(duplicate.duplicate,true);assert.deepEqual(duplicate.changes,[]);
  throwsCode(()=>validate(makeCSV([row('HGB','15')]),{seenImports:seen}),'IMPORT_REPLAY_CONFLICT');
  throwsCode(()=>validate(makeCSV([row(),row('WBC','7','cells/µL','LF-123','DIFFERENT')])),'ANALYZER_IMPORT_INVALID');
  throwsCode(()=>validate(csv,{seenImports:new Map([[initial.idempotencyKey,{}]])}),'CONFIG_INVALID');
 });
 test('A100-order run retains every proposed analyte and order version',()=>{
  const batchOrders=Array.from({length:100},(_,index)=>({...order,id:`LF-${index}`,patientId:`PT-${index}`,version:index+1,results:{}}));
  const rows=batchOrders.flatMap(item=>[row('HGB','14','g/dL',item.id),row('WBC','7200','cells/µL',item.id)]);
  const result=validate(makeCSV(rows),{orders:batchOrders});assert.equal(result.changes.length,100);assert.equal(result.changes.reduce((sum,item)=>sum+item.provenance.measurements.length,0),200);
  assert(result.changes.every(item=>item.expectedVersion===Number(item.orderId.slice(3))+1));
 });

const approved={...order,status:'Approved',approvedAt:'2026-11-01T12:00:00.000Z',approvedBy:'reviewer-1',version:5,results:{hb:14},reportSnapshot:{labName:'Example'},catalogSnapshot:{tests:{CBC:TESTS.CBC},parameters:PARAMETERS}};
const consent=(channel='whatsapp',destination='+919876543210')=>({granted:true,scope:'report_delivery',channel,destination,patientId:approved.patientId,recordedAt:new Date(Date.now()-1000).toISOString(),recordedBy:'staff-1'});
 test('Delivery returns an unsent queued proposal only for an approved report and matching consent',()=>{
  const before=JSON.stringify(approved);const intent=createDeliveryIntent(approved,'whatsapp','+919876543210',consent());
  assert.equal(intent.status,'queued');assert.equal(intent.providerMessageId,null);assert.equal(intent.attempts,0);assert.equal(intent.channel,'whatsapp');assert.equal(JSON.stringify(approved),before);
  assert.equal(createDeliveryIntent({...approved,version:6,paid:100,updatedAt:new Date().toISOString()},'whatsapp','+919876543210',consent()).id,intent.id,'billing edits must not generate a second intent for an identical released report');
  assert.notEqual(createDeliveryIntent({...approved,results:{hb:15}},'whatsapp','+919876543210',consent()).id,intent.id);
  assert.equal(createDeliveryIntent(approved,'email','person@EXAMPLE.TEST',consent('email','person@example.test')).destination,'person@example.test');
 });
 test('Delivery rejects invalid recipients, missing/revoked/expired/mismatched consent and unapproved reports',()=>{
  throwsCode(()=>createDeliveryIntent({...approved,status:'Review'},'whatsapp','+919876543210',consent()),'REPORT_NOT_APPROVED');
  throwsCode(()=>createDeliveryIntent({...approved,approvedAt:null},'whatsapp','+919876543210',consent()),'REPORT_APPROVAL_INVALID');
  throwsCode(()=>createDeliveryIntent(approved,'whatsapp','9876543210',consent()),'RECIPIENT_INVALID');
  for(const destination of ['a@example.test,b@example.test','Name <a@example.test>','a@example.test\r\nBcc:x@y.test','a..b@example.test'])throwsCode(()=>createDeliveryIntent(approved,'email',destination,consent('email',destination)),'RECIPIENT_INVALID');
  throwsCode(()=>createDeliveryIntent(approved,'email','a@example.test',consent()),'CONSENT_REQUIRED');
  throwsCode(()=>createDeliveryIntent(approved,'whatsapp','+919876543210',true),'CONSENT_REQUIRED');
  throwsCode(()=>createDeliveryIntent(approved,'whatsapp','+919876543210',{...consent(),patientId:'OTHER'}),'CONSENT_REQUIRED');
  throwsCode(()=>createDeliveryIntent(approved,'whatsapp','+919876543210',{...consent(),destination:'+919999999999'}),'CONSENT_RECIPIENT_MISMATCH');
  throwsCode(()=>createDeliveryIntent(approved,'whatsapp','+919876543210',{...consent(),revokedAt:new Date().toISOString()}),'CONSENT_REVOKED');
  throwsCode(()=>createDeliveryIntent(approved,'whatsapp','+919876543210',{...consent(),expiresAt:'2020-01-01T00:00:00.000Z'}),'CONSENT_EXPIRED');
  for(const recordedAt of [true,'2026-02-30T00:00:00.000Z',new Date(Date.now()+3600000).toISOString()])throwsCode(()=>createDeliveryIntent(approved,'whatsapp','+919876543210',{...consent(),recordedAt}),'CONSENT_TIMESTAMP_INVALID');
 });

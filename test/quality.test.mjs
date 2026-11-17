import test from 'node:test';
import assert from 'node:assert/strict';
import { TESTS, PARAMETERS } from '../dist/catalog.js';
import { assessRelease, resultFingerprint, findCriticalResults, validateSpecimenAction,
  acknowledgeCritical, createSpecimens, applyWorkflowSpecimens, QualityError } from '../lib/quality.mjs';

const now='2026-11-14T10:00:00.000Z';
const actor={id:'staff-pathologist',username:'reviewer',displayName:'Lab Reviewer',role:'pathologist'};
const catalog={T:{name:'Validated test',sample:'Serum',parameters:['a','b']}};
const parameters={a:{name:'Marker A',unit:'U/L',min:1,max:8},b:{name:'Marker B',unit:'mg/dL',min:2,max:9}};
const order=()=>({id:'LF-QUALITY',patientId:'PT-Q',tests:['T'],status:'Review',results:{a:5,b:6},notes:'draft findings',version:3,
 createdAt:'2026-11-14T08:00:00.000Z',collectedAt:'2026-11-14T08:30:00.000Z',processingAt:'2026-11-14T09:00:00.000Z',receivedAt:'2026-11-14T09:00:00.000Z',resultsRevision:1});
const opts={catalog,parameters,now};
const has=(result,code)=>result.blockers.some(item=>item.code===code);

test('release assessment keeps absent QC and critical policies visibly unconfigured without inventing thresholds',()=>{
 const input=order();const result=assessRelease(input,opts);
 assert.equal(result.canRelease,true);assert.equal(result.criticalFindings.length,0);
 assert(result.warnings.some(item=>item.code==='critical-rules-not-configured'));
 assert(result.warnings.some(item=>item.code==='qc-not-configured'));
 assert.equal(input.status,'Review');assert.equal(input.version,3);
});

test('release blocks incomplete, coerced and unknown test/parameter results',()=>{
 for(const value of [undefined,'', '  ',true,[],{},'0x10',-1,Infinity]){
  const input=order();input.results.a=value;
  assert(has(assessRelease(input,opts),'missing-or-invalid-result'),`must reject ${String(value)}`);
 }
 const unknown=order();unknown.tests=['unknown'];assert(has(assessRelease(unknown,opts),'missing-panel-definition'));
 assert(has(assessRelease(order(),{...opts,parameters:{}}),'missing-parameter-definition'));
 assert(has(assessRelease({...order(),status:'Processing'},opts),'not-ready-for-review'));
 assert.equal(assessRelease(null,opts).canRelease,false);
});

test('only configured critical thresholds create critical findings; invalid rules block release',()=>{
 const configured={...parameters,a:{...parameters.a,criticalMax:4}};
 const input=order();const result=assessRelease(input,{...opts,parameters:configured});
 assert.equal(result.criticalFindings.length,1);assert.equal(result.criticalFindings[0].parameterKey,'a');
 assert(has(result,'critical-notification-required'));
 for(const bad of [{criticalMin:'3'},{criticalMax:NaN},{criticalMin:7,criticalMax:4}]){
  assert(has(assessRelease(input,{...opts,parameters:{...parameters,a:{...parameters.a,...bad}}}),'critical-rule-invalid'));
 }
 assert.equal(findCriticalResults(input,{...opts,parameters:{...parameters,a:{...parameters.a,criticalMax:5}}}).length,0,'thresholds mean above/below, not equality');
});

test('notification requires explicit current-result fingerprint, communication details and real notification time',()=>{
 const input=order(),config={...opts,parameters:{...parameters,a:{...parameters.a,criticalMax:4}}};
 const valid={parameterKey:'a',resultFingerprint:resultFingerprint(input),notifiedPerson:'Referring physician',contact:'+91 90000 00000',notifiedAt:'2026-11-14T09:55:00.000Z',reason:'Phone notification; measured value read back',readBackConfirmed:true};
 for(const [field,value] of [['resultFingerprint','old'],['notifiedPerson',''],['contact',''],['reason',''],['readBackConfirmed',false],['notifiedAt',null],['notifiedAt','2026-11-15T09:55:00Z'],['notifiedAt','2026-11-13T09:55:00Z']]){
  assert.throws(()=>acknowledgeCritical(input,{...valid,[field]:value},actor,config),QualityError,field);
 }
 assert.throws(()=>acknowledgeCritical(input,valid,null,config),QualityError);
 const next=acknowledgeCritical(input,valid,actor,config);
 assert.equal(input.criticalAcknowledgments,undefined,'caller record must stay unchanged');
 assert.equal(next.version,input.version,'server owns version mutation');
 assert.equal(next.criticalAcknowledgments[0].recordedBy.id,actor.id);
 assert.equal(assessRelease(next,config).canRelease,true);
 const changed={...next,results:{...next.results,a:7},resultsRevision:2};
 assert(has(assessRelease(changed,config),'critical-notification-required'));
 const reverted={...changed,results:{...changed.results,a:5},resultsRevision:3};
 assert(has(assessRelease(reverted,config),'critical-notification-required'),'changed/reverted values need a new notification');
 const billed={...next,version:next.version+1,paid:100,updatedAt:now};
 assert.equal(assessRelease(billed,config).canRelease,true,'billing must not invalidate a measured-result acknowledgment');
});

test('required QC rejects failed, missing, expired, or unverifiable evidence and accepts explicit valid evidence',()=>{
 const config={...opts,catalog:{T:{...catalog.T,qcRequired:true}}};
 assert(has(assessRelease(order(),config),'qc-not-passed'));
 assert(has(assessRelease(order(),{...config,qcStatus:{T:{status:'failed'}}}),'qc-not-passed'));
 assert(has(assessRelease(order(),{...config,qcStatus:{T:{status:'passed'}}}),'qc-evidence-invalid'));
 assert(has(assessRelease(order(),{...config,qcStatus:{T:{status:'passed',recordedAt:'2026-11-13T09:00:00Z',expiresAt:'2026-11-14T09:00:00Z'}}}),'qc-expired'));
 const result=assessRelease(order(),{...config,qcStatus:{T:{status:'passed',recordedAt:'2026-11-14T09:00:00Z',expiresAt:'2026-11-15T09:00:00Z'}}});
 assert.equal(result.canRelease,true);
});

test('legacy aggregate rejection blocks release and recollection preserves before state while clearing obsolete results',()=>{
 const input=order();const rejected=validateSpecimenAction(input,'reject',{reason:'Specimen hemolysed'},actor,{now});
 assert.equal(input.specimen,undefined);assert.equal(rejected.specimen.state,'rejected');
 assert(has(assessRelease(rejected,opts),'specimen-rejected'));
 assert.throws(()=>validateSpecimenAction(rejected,'reject',{reason:'Rejected again'},actor,{now}),QualityError);
 const recollected=validateSpecimenAction(rejected,'recollect',{reason:'Replacement sample received'},actor,{now});
 assert.equal(recollected.status,'Collected');assert.deepEqual(recollected.results,{});assert.equal(recollected.notes,'');
 assert.equal(recollected.specimen.cycle,1);assert.equal(recollected.resultsRevision,2);
 assert.equal(recollected.processingAt,null);assert.equal(recollected.receivedAt,null);
 assert.equal(recollected.specimen.events.length,2);assert.equal(rejected.specimen.events.length,1);
 assert.throws(()=>validateSpecimenAction({...input,status:'Approved'},'reject',{reason:'Cannot alter released'},actor,{now}),QualityError);
 assert.throws(()=>validateSpecimenAction(input,'reject',{reason:'  '},actor,{now}),QualityError);
});

test('specimen planner assigns unique IDs, combines compatible serum panels, and separates fasting/postprandial samples',()=>{
 const input={id:'LF-PLAN',tests:['CBC','LFT','KFT','GLUCOSE']};
 const specimens=createSpecimens(input,{catalog:TESTS});
 assert.equal(new Set(specimens.map(item=>item.id)).size,specimens.length);
 assert.equal(specimens.length,4);
 assert(specimens.every(item=>item.status==='Registered'&&item.collectedAt===null&&item.receivedAt===null));
 const serum=specimens.find(item=>item.kind==='Serum');assert.deepEqual(serum.testCodes,['LFT','KFT']);
 const timed=specimens.filter(item=>item.testCodes.includes('GLUCOSE'));
 assert.equal(timed.length,2);assert.deepEqual(timed.flatMap(item=>item.parameterKeys),['glucose_fasting','glucose_postprandial']);
 assert.notEqual(timed[0].id,timed[1].id);
 assert.throws(()=>createSpecimens({id:'X',tests:['missing']},{catalog:TESTS}),QualityError);
});

test('whole-order confirmations synchronize all specimen IDs without changing existing recorded collection times',()=>{
 let input={...order(),status:'Registered'};input.specimens=createSpecimens(input,{catalog});
 const collected=applyWorkflowSpecimens(input,'Collected',{catalog,actor,now});
 assert(collected.specimens.every(item=>item.status==='Collected'&&item.collectedAt===now));
 assert(input.specimens.every(item=>item.status==='Registered'));
 const received=applyWorkflowSpecimens({...collected,status:'Collected'},'Processing',{catalog,actor,now:'2026-11-14T10:05:00Z'});
 assert(received.specimens.every(item=>item.status==='Received'&&item.collectedAt===now));
 assert.equal(received.specimens[0].events.length,2);
 assert.equal(assessRelease({...received,status:'Review'},opts).canRelease,true);
});

test('individual collection and receipt require each distinct specimen before release',()=>{
 let input={...order(),tests:['CBC','GLUCOSE'],status:'Registered',results:{}};
 input.specimens=createSpecimens(input,{catalog:TESTS});
 assert.throws(()=>validateSpecimenAction(input,'collect',{},actor,{now}),QualityError,'multi-specimen action requires ID');
 assert.throws(()=>validateSpecimenAction(input,'receive',{specimenId:input.specimens[0].id},actor,{now}),QualityError);
 for(const specimen of input.specimens){input=validateSpecimenAction(input,'collect',{specimenId:specimen.id},actor,{now});}
 assert.equal(input.status,'Collected');
 input=validateSpecimenAction(input,'receive',{specimenId:input.specimens[0].id},actor,{now});
 assert.equal(input.status,'Collected','one received specimen cannot advance the whole order');
 assert(has(assessRelease({...input,status:'Review'},{catalog:TESTS,parameters:PARAMETERS,now}),'specimen-not-received'));
 for(const specimen of input.specimens.filter(item=>item.status!=='Received'))input=validateSpecimenAction(input,'receive',{specimenId:specimen.id},actor,{now});
 assert.equal(input.status,'Processing');
});

test('rejecting/recollecting one specimen preserves unrelated results and produces a complete audit event chain',()=>{
 let input={...order(),tests:['LFT','CBC'],status:'Review',results:{alt:30,hb:14},resultsRevision:4};
 input.specimens=createSpecimens(input,{catalog:TESTS});input=applyWorkflowSpecimens(input,'Processing',{catalog:TESTS,actor,now});
 const serum=input.specimens.find(item=>item.kind==='Serum');
 const rejected=validateSpecimenAction(input,'reject',{specimenId:serum.id,reason:'Hemolysis exceeds validated acceptance limit'},actor,{now});
 assert.equal(rejected.specimen.state,'rejected');assert(has(assessRelease(rejected,{catalog:TESTS,parameters:PARAMETERS,now}),'specimen-rejected'));
 assert.throws(()=>applyWorkflowSpecimens(rejected,'Review',{catalog:TESTS,actor,now}),QualityError);
 const recollected=validateSpecimenAction(rejected,'recollect',{specimenId:serum.id,reason:'New sample independently identified'},actor,{now});
 assert.equal(recollected.results.hb,14);assert.equal(recollected.results.alt,undefined);
 assert.equal(recollected.status,'Collected');assert.equal(recollected.resultsRevision,5);
 assert.equal(recollected.specimens.find(item=>item.replacesSpecimenId===serum.id).events.at(-1).actor.id,actor.id);
 assert.equal(recollected.specimen.state,'recollected');
 const replacement=recollected.specimens.find(item=>item.replacesSpecimenId===serum.id);
 assert.notEqual(replacement.id,serum.id,'replacement sample needs a fresh barcode identity');
 assert(replacement.previousIds.includes(serum.id));
 assert.equal(rejected.results.alt,30,'original rejected-sample record remains unchanged');
});

test('released assessments use frozen threshold definitions instead of later live-catalog changes',()=>{
 const input={...order(),status:'Approved',catalogSnapshot:{tests:catalog,parameters}};
 const changed={...parameters,a:{...parameters.a,criticalMax:1}};
 assert.equal(assessRelease(input,{...opts,parameters:changed}).criticalFindings.length,0);
});

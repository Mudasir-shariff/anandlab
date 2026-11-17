import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {cpus,totalmem} from 'node:os';
import {DatabaseSync} from 'node:sqlite';
import {isolatedServer} from './test-server.mjs';

export async function runBenchmark({count=100,concurrency=8}={}){
 if(!Number.isInteger(count)||count<1||count>1000||!Number.isInteger(concurrency)||concurrency<1||concurrency>32)throw new Error('Use 1–1000 patients and 1–32 concurrent requests.');
 const fixture=await isolatedServer(),samples=[],started=performance.now();
 try{
  const {request,admin,login,password}=fixture;
  async function checked(path,options,expected=200){const value=await request(path,options);assert.equal(value.status,expected,`${path}: ${value.body.error||'Unexpected response'}`);return value.body;}
  for(const role of ['technician','pathologist'])await checked('/api/users',{method:'POST',cookie:admin.cookie,body:{username:`verification.${role}`,displayName:`Fictional ${role}`,role,password}},201);
  const technician=await login('verification.technician',password),reviewer=await login('verification.pathologist',password);
  async function parallel(items,action){let next=0;const result=new Array(items.length);await Promise.all(Array.from({length:Math.min(concurrency,items.length)},async()=>{while(next<items.length){const index=next++;const begin=performance.now();result[index]=await action(items[index],index);samples.push(performance.now()-begin);}}));return result;}
  let orders=await parallel(Array.from({length:count},(_,i)=>i),async i=>(await checked('/api/orders',{method:'POST',cookie:admin.cookie,body:{id:`LOAD-${String(i+1).padStart(4,'0')}`,patientId:`LOAD-PT-${i+1}`,name:`Fictional workload patient ${i+1}`,age:35,sex:'Male',phone:'',email:'',category:'Walk-in',referrer:'Self',tests:['TSH'],priority:'Routine',status:'Registered',paid:0,paymentMethod:'Cash',results:{},notes:''}},201)).order);
  const advance=async(status,session,patch={})=>orders=await parallel(orders,async o=>(await checked(`/api/orders/${o.id}`,{method:'PUT',cookie:session.cookie,body:{...o,...patch,status,expectedVersion:o.version}})).order);
  await advance('Collected',admin);await advance('Processing',technician);await advance('Review',technician,{results:{tsh:2.1}});await advance('Approved',reviewer);
  const state=await checked('/api/state',{cookie:admin.cookie});
  assert.equal(state.orders.length,count);assert.equal(new Set(state.orders.map(o=>o.id)).size,count);
  for(const o of state.orders){assert.equal(o.status,'Approved');assert.equal(o.version,5);assert.equal(o.results.tsh,2.1);assert.notEqual(o.resultEnteredBy,o.approvedBy);assert(o.reportSnapshot&&o.catalogSnapshot);assert(o.specimens.every(sp=>sp.status==='Received'));}
  const stale=await request(`/api/orders/${orders[0].id}`,{method:'PUT',cookie:admin.cookie,body:{...orders[0],paid:1,expectedVersion:1}});assert.equal(stale.status,409);
  const db=new DatabaseSync(resolve(fixture.directory,'labflow.sqlite'),{readOnly:true});let integrity;try{integrity=db.prepare('PRAGMA integrity_check').get().integrity_check;assert.equal(integrity,'ok');assert.equal(db.prepare('SELECT COUNT(*) AS n FROM orders').get().n,count);}finally{db.close();}
  samples.sort((a,b)=>a-b);const percentile=p=>Number(samples[Math.min(samples.length-1,Math.ceil(samples.length*p)-1)].toFixed(2));
  return {format:'labflow-workload-v1',checkedAt:new Date().toISOString(),patients:count,concurrency,clinicalWrites:samples.length,failedExpectedSuccessRequests:0,expectedStaleWriteStatus:409,approvedReports:count,independentReview:true,databaseIntegrity:integrity,durationMs:Number((performance.now()-started).toFixed(2)),latencyMs:{p50:percentile(.5),p95:percentile(.95),p99:percentile(.99)},environment:{node:process.version,cpu:cpus()[0]?.model,logicalCpus:cpus().length,totalMemoryBytes:totalmem()},scope:'Isolated local HTTP/SQLite workflow test with fictional data; not a production SLA, device validation or clinical validation.'};
 }finally{await fixture.close();}
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const report=await runBenchmark();const out=fileURLToPath(new URL('../work/benchmark-result.json',import.meta.url));await mkdir(dirname(out),{recursive:true});await writeFile(out,JSON.stringify(report,null,2)+'\n');await writeFile(new URL('../dist/benchmark-results.json',import.meta.url),JSON.stringify(report,null,2)+'\n');
 let document=await readFile(new URL('../docs/BENCHMARK.md',import.meta.url),'utf8');document=document.replace(/Checked \d{4}-\d{2}-\d{2}T[\d:.]+Z\./,'Checked '+report.checkedAt+'.');for(const [label,value]of [['Total measured workflow',report.durationMs+' ms'],['Write latency p50 / p95 / p99',report.latencyMs.p50+' / '+report.latencyMs.p95+' / '+report.latencyMs.p99+' ms']]){document=document.split('\n').map(line=>line.startsWith('| '+label+' |')?'| '+label+' | '+value+' |':line).join('\n');}await writeFile(new URL('../docs/BENCHMARK.md',import.meta.url),document);console.log(JSON.stringify(report,null,2));
}

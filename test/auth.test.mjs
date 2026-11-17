import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import net from 'node:net';
import { TESTS, PARAMETERS } from '../dist/catalog.js';
import { AuthStore } from '../lib/auth.mjs';

const directory=await mkdtemp(join(tmpdir(),'labflow-auth-test-'));
// Dynamic port allocation to avoid collisions between concurrent test runs.
const portReservation=net.createServer();
await new Promise((resolve,reject)=>{portReservation.once('error',reject);portReservation.listen(0,'127.0.0.1',resolve);});
const authPort=portReservation.address().port;
await new Promise(resolve=>portReservation.close(resolve));
const origin=`http://127.0.0.1:${authPort}`;
const adminPassword='unique-test-admin-password-1234';
const staffPassword='unique-test-staff-password-1234';
let child,logs='';
async function start(password=adminPassword) {
 child=spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,LAB_DEMO:'0',LAB_ALLOW_BASIC:'0',LAB_REQUIRE_INDEPENDENT_REVIEW:'1',LAB_HOST:'127.0.0.1',LAB_USER:'administrator',LAB_PASSWORD:password,LAB_DATA_DIR:directory,PORT:String(authPort)},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',bytes=>{logs+=bytes;});child.stderr.on('data',bytes=>{logs+=bytes;});
 for(let attempt=0;attempt<200;attempt++) {if(child.exitCode!=null)throw new Error(logs);try{if((await fetch(origin+'/api/health')).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,30));}
 throw new Error('Auth test server did not start: '+logs);
}
async function stop(){if(!child||child.exitCode!=null)return;const closed=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await closed;}
async function request(path,{method='GET',body,cookie,headers={}}={}) {
 const allHeaders={...headers};if(cookie)allHeaders.Cookie=cookie;
 if(body!==undefined){allHeaders.Origin=origin;allHeaders['Content-Type']='application/json';}
 const response=await fetch(origin+path,{method,headers:allHeaders,body:body===undefined?undefined:JSON.stringify(body)});
 const type=response.headers.get('content-type')||'';return {status:response.status,body:type.includes('application/json')?await response.json():await response.text(),headers:response.headers};
}
async function login(username,password=staffPassword){const response=await request('/api/login',{method:'POST',body:{username,password}});assert.equal(response.status,200,JSON.stringify(response.body));return {...response,cookie:response.headers.get('set-cookie').split(';')[0]};}
function payload(id){return {id,patientId:`PT-${id}`,name:'Fictional Auth Test',age:35,sex:'Male',phone:'',email:'',category:'Walk-in',referrer:'Self',tests:['CBC'],priority:'Routine',status:'Registered',paid:0,paymentMethod:'Cash',results:{},notes:''};}
const measured=Object.fromEntries(TESTS.CBC.parameters.map(key=>[key,(PARAMETERS[key].min+PARAMETERS[key].max)/2]));
try {
 await start();
 assert.equal((await request('/api/session')).status,401);
 const legacy='Basic '+Buffer.from(`administrator:${adminPassword}`).toString('base64');
 assert.equal((await request('/api/state',{headers:{Authorization:legacy}})).status,401,'Basic compatibility is disabled by default');
 const wrongOrigin=await fetch(origin+'/api/login',{method:'POST',headers:{Origin:'https://other.example','Content-Type':'application/json'},body:JSON.stringify({username:'administrator',password:adminPassword})});
 assert.equal(wrongOrigin.status,403,'login requires matching origin');
 assert.equal((await request('/api/login',{method:'POST',body:{username:'administrator',password:'wrong'}})).status,401);
 assert.equal((await request('/api/login',{method:'POST',body:{username:'missing-user',password:'wrong'}})).status,401);
 let admin=await login('administrator',adminPassword);
 assert.match(admin.headers.get('set-cookie'),/HttpOnly/);assert.match(admin.headers.get('set-cookie'),/SameSite=Strict/);
 assert.equal(admin.body.user.role,'admin');assert.equal(admin.body.independentReviewRequired,true);
 assert.ok(admin.body.permissions.includes('users:manage'));
 const users={admin:admin.body.user},sessions={admin};
 for(const role of ['reception','technician','pathologist','billing','auditor']) {
  const created=await request('/api/users',{method:'POST',cookie:admin.cookie,body:{username:`staff.${role}`,displayName:`Test ${role}`,role,password:staffPassword}});
  assert.equal(created.status,201);users[role]=created.body.user;sessions[role]=await login(`staff.${role}`);
  assert.equal(sessions[role].body.user.id,users[role].id);
 }
 let list=await request('/api/users',{cookie:admin.cookie});assert.equal(list.body.users.length,6);
 assert.ok(!JSON.stringify(list.body).includes('password_hash'));assert.ok(!JSON.stringify(list.body).includes(staffPassword));
 assert.equal((await request('/api/users',{cookie:sessions.auditor.cookie})).status,403);
 assert.equal((await request('/api/users/'+users.admin.id,{method:'PATCH',cookie:admin.cookie,body:{disabled:true}})).status,409,'last active administrator protected');
 assert.equal((await request('/api/users',{method:'POST',cookie:admin.cookie,body:{username:'bad-role',role:'superuser',password:staffPassword}})).status,422);
 assert.equal((await request('/api/orders',{method:'POST',cookie:sessions.auditor.cookie,body:payload('DENIED')})).status,403);
 let response=await request('/api/orders',{method:'POST',cookie:sessions.reception.cookie,body:payload('ROLE-TEST')});assert.equal(response.status,201);let order=response.body.order;
 assert.equal(order.registeredBy,users.reception.id);
 const change=async(role,changes,expected=200)=>{const result=await request('/api/orders/ROLE-TEST',{method:'PUT',cookie:sessions[role].cookie,body:{...order,...changes,expectedVersion:order.version}});assert.equal(result.status,expected,JSON.stringify(result.body));if(result.status===200)order=result.body.order;return result;};
 await change('reception',{results:measured},403);
 await change('reception',{status:'Collected'});assert.ok(order.specimens.length);
 await change('reception',{status:'Processing'},403);
 await change('technician',{status:'Processing'});
 await change('technician',{results:measured,status:'Review'});assert.equal(order.resultEnteredBy,users.technician.id);
 await change('technician',{status:'Approved'},403);
 await change('billing',{results:{...measured,hb:1}},403);
 assert.equal((await request('/api/backup',{cookie:sessions.billing.cookie})).status,403);
 assert.equal((await request('/api/settings',{method:'PUT',cookie:sessions.reception.cookie,body:{labName:'Unauthorized'}})).status,403);
 let qc=await request('/api/quality-controls/CBC',{method:'PUT',cookie:sessions.technician.cookie,body:{expectedVersion:0,status:'rejected',runId:'QC-FAILED-1',evidence:'Measured QC failed laboratory limits',reason:'Control outside documented limits'}});
 assert.equal(qc.status,200);assert.equal(qc.body.control.recordedBy,users.technician.id);
 const deniedRelease=await change('pathologist',{status:'Approved'},422);assert.ok(deniedRelease.body.details.blockers.some(item=>item.code==='qc-not-passed'));
 qc=await request('/api/quality-controls/CBC',{method:'PUT',cookie:sessions.technician.cookie,body:{expectedVersion:1,status:'accepted',runId:'QC-ACCEPTED-2',evidence:'Control measurements reviewed against the laboratory SOP',reason:'Repeat control met laboratory acceptance limits',acceptedAt:new Date(Date.now()-1000).toISOString(),expiresAt:new Date(Date.now()+3600_000).toISOString()}});
 assert.equal(qc.status,200);
 const assessment=await request('/api/orders/ROLE-TEST/release-check',{cookie:sessions.pathologist.cookie});assert.equal(assessment.body.canRelease,true);
 await change('pathologist',{status:'Approved'});assert.equal(order.approvedBy,users.pathologist.id);assert.equal(order.approvedByName,users.pathologist.displayName);
 await change('billing',{paid:450,paymentMethod:'UPI'});assert.equal(order.resultEnteredBy,users.technician.id);
 await change('auditor',{paid:450},403);
 response=await request('/api/audit?limit=100',{cookie:sessions.auditor.cookie});assert.equal(response.status,200);assert.ok(response.body.events.some(event=>event.actor===users.pathologist.id));assert.ok(response.body.authEvents.some(event=>event.action==='login.succeeded'));
 assert.ok(!JSON.stringify(response.body).includes(staffPassword),'audit never includes supplied passwords');

 // A staff member cannot manufacture another author's provenance or approve a
 // report they entered, even while holding the administrator role.
 response=await request('/api/orders',{method:'POST',cookie:admin.cookie,body:payload('SELF-REVIEW')});let self=response.body.order;
 for(const status of ['Collected','Processing','Review']){response=await request('/api/orders/SELF-REVIEW',{method:'PUT',cookie:admin.cookie,body:{...self,status,results:status==='Review'?measured:self.results,expectedVersion:self.version}});assert.equal(response.status,200);self=response.body.order;}
 response=await request('/api/orders/SELF-REVIEW',{method:'PUT',cookie:admin.cookie,body:{...self,status:'Approved',resultEnteredBy:users.technician.id,expectedVersion:self.version}});assert.equal(response.status,403,'default policy enforces independent reviewer');
 assert.ok(response.body.details.blockers.some(item=>item.code==='independent-review-required'));

 // Disabled accounts, password resets and role changes revoke existing cookies.
 response=await request('/api/users/'+users.technician.id,{method:'PATCH',cookie:admin.cookie,body:{disabled:true}});assert.equal(response.status,200);
 assert.equal((await request('/api/session',{cookie:sessions.technician.cookie})).status,401);
 assert.equal((await request('/api/login',{method:'POST',body:{username:'staff.technician',password:staffPassword}})).status,401);
 await request('/api/users/'+users.technician.id,{method:'PATCH',cookie:admin.cookie,body:{disabled:false}});sessions.technician=await login('staff.technician');
 const replacement='replacement-staff-password-5678';
 await request('/api/users/'+users.technician.id,{method:'PATCH',cookie:admin.cookie,body:{password:replacement}});
 assert.equal((await request('/api/session',{cookie:sessions.technician.cookie})).status,401);
 assert.equal((await request('/api/login',{method:'POST',body:{username:'staff.technician',password:staffPassword}})).status,401);
 sessions.technician=await login('staff.technician',replacement);
 await request('/api/users/'+users.technician.id,{method:'PATCH',cookie:admin.cookie,body:{role:'auditor'}});
 assert.equal((await request('/api/session',{cookie:sessions.technician.cookie})).status,401);
 sessions.technician=await login('staff.technician',replacement);assert.ok(!sessions.technician.body.permissions.includes('results:write'));
 const logoutWithoutOrigin=await request('/api/logout',{method:'POST',cookie:sessions.billing.cookie});assert.equal(logoutWithoutOrigin.status,403);
 const logout=await request('/api/logout',{method:'POST',body:{},cookie:sessions.billing.cookie});assert.equal(logout.status,200);assert.match(logout.headers.get('set-cookie'),/Max-Age=0/);
 assert.equal((await request('/api/session',{cookie:sessions.billing.cookie})).status,401);

 const database=new DatabaseSync(join(directory,'labflow.sqlite'));
 const rows=database.prepare('SELECT * FROM staff_users').all();assert.equal(new Set(rows.map(row=>row.password_salt)).size,rows.length,'each password has a random salt');
 assert.ok(rows.every(row=>row.password_hash.startsWith('scrypt-v1$')));
 assert.ok(!JSON.stringify(rows).includes(adminPassword));assert.ok(!JSON.stringify(rows).includes(staffPassword));
 const token=admin.cookie.split('=')[1];assert.ok(database.prepare('SELECT token_hash FROM staff_sessions').all().every(row=>row.token_hash!==token && row.token_hash.length===64),'sessions persist only hashed tokens');
 const secureStore=new AuthStore(database,{secureCookie:true});assert.match(secureStore.cookie('test'),/; Secure$/);assert.match(secureStore.clearCookie(),/; Secure$/);
 database.close();
 await stop();await start('different-bootstrap-password-that-must-not-reset-users');
 assert.equal((await request('/api/session',{cookie:admin.cookie})).status,200,'staff and sessions persist across restart');
 admin=await login('administrator',adminPassword);
 const cli=spawnSync(process.execPath,['scripts/manage-users.mjs','create','--username','cli.auditor','--role','auditor','--password-stdin'],{cwd:new URL('..',import.meta.url),env:{...process.env,LAB_DATA_DIR:directory},input:staffPassword+'\n',encoding:'utf8'});
 assert.equal(cli.status,0,cli.stderr);assert.ok(!cli.stdout.includes(staffPassword));const cliUser=JSON.parse(cli.stdout).user;assert.equal(cliUser.role,'auditor');
 const cliSession=await login('cli.auditor');assert.equal(cliSession.body.user.id,cliUser.id);
 assert.ok(!logs.includes(adminPassword) && !logs.includes(staffPassword),'server output never logs passwords');
 console.log('PASS: staff roles, scrypt salts, session cookies, independent review, user management, disable/reset/role revocation, QC release gating, audit privacy, durable auth and offline CLI.');
}finally{await stop();await rm(directory,{recursive:true,force:true});}

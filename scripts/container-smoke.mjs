import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import assert from 'node:assert/strict';
const suffix=randomBytes(5).toString('hex'),name=`labflow-smoke-${suffix}`,dataVolume=`${name}-data`,backupVolume=`${name}-backups`;
const username='container.verification',password=randomBytes(24).toString('base64url');
const env={...process.env,LAB_USER:username,LAB_PASSWORD:password};
const prefix=env.LAB_DOCKER_HOST?['--host='+env.LAB_DOCKER_HOST]:[];
function docker(args,allowFailure=false){const value=spawnSync('docker',[...prefix,...args],{env,encoding:'utf8'});if(value.status&&!allowFailure)throw new Error(`Docker ${args[0]} failed: ${value.stderr}`);return value.stdout.trim();}
let started=false;
try{
 docker(['run','--rm','-d','--name',name,'--read-only','--user','1000:1000','--cap-drop','ALL','--security-opt','no-new-privileges:true','--tmpfs','/tmp:uid=1000,gid=1000,mode=0700','--mount',`type=volume,src=${dataVolume},dst=/app/data`,'--mount',`type=volume,src=${backupVolume},dst=/app/backups`,'-p','127.0.0.1::3000','-e','LAB_USER','-e','LAB_PASSWORD','-e','NODE_ENV=test','labflow-verification:1.3']);started=true;
 let port=docker(['port',name,'3000/tcp']).split(':').at(-1),origin=`http://127.0.0.1:${port}`;
 async function ready(){for(let i=0;i<150;i++){try{if((await fetch(origin+'/api/health')).ok)return;}catch{}await new Promise(resolve=>setTimeout(resolve,40));}throw new Error('Container did not become healthy: '+docker(['logs',name],true));}
 await ready();assert.equal((await fetch(origin+'/api/state')).status,401);
 const login=await fetch(origin+'/api/login',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({username,password})});assert.equal(login.status,200);const cookie=login.headers.get('set-cookie').split(';')[0];
 const created=await fetch(origin+'/api/orders',{method:'POST',headers:{Cookie:cookie,Origin:origin,'Content-Type':'application/json'},body:JSON.stringify({id:'CONTAINER-SMOKE',patientId:'PT-CONTAINER',name:'Fictional container verification',age:35,sex:'Male',tests:['TSH'],status:'Registered',results:{},paid:0,notes:''})});assert.equal(created.status,201);
 assert.equal(docker(['exec',name,'id','-u']),'1000');
 assert.equal(docker(['exec',name,'stat','-c','%a','/app/data/labflow.sqlite']),'600');
 docker(['restart',name]);port=docker(['port',name,'3000/tcp']).split(':').at(-1);origin=`http://127.0.0.1:${port}`;await ready();const state=await fetch(origin+'/api/state',{headers:{Cookie:cookie}});assert.equal(state.status,200);const value=await state.json();assert.equal(value.orders.length,1);assert.equal(value.orders[0].id,'CONTAINER-SMOKE');
 console.log(JSON.stringify({ok:true,image:'labflow-verification:1.3',nonRootUid:1000,readOnlyApplication:true,protectedClinicalAPI:true,namedSession:true,registration:true,persistentVolumeSurvivesRestart:true,databaseMode:'0600',scope:'Local isolated container smoke test; no live TLS, analyzer, browser, scanner or clinical acceptance is established.'},null,2));
}finally{if(started)docker(['rm','-f',name],true);docker(['volume','rm',dataVolume,backupVolume],true);}

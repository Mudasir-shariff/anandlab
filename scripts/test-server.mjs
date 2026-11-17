import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import net from 'node:net';
export async function isolatedServer({nodeEnv='test'}={}){
 const directory=await mkdtemp(join(tmpdir(),'labflow-verification-'));
 const reservation=net.createServer();await new Promise((resolve,reject)=>{reservation.once('error',reject);reservation.listen(0,'127.0.0.1',resolve);});
 const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
 const root=fileURLToPath(new URL('..',import.meta.url)),origin=`http://127.0.0.1:${port}`;
 const username='verification.admin',password=randomBytes(24).toString('base64url');
 const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,NODE_ENV:nodeEnv,LAB_HOST:'127.0.0.1',LAB_USER:username,LAB_PASSWORD:password,LAB_DEMO:'0',LAB_ALLOW_BASIC:'0',LAB_REQUIRE_INDEPENDENT_REVIEW:'1',LAB_PUBLIC_ORIGIN:origin,LAB_DATA_DIR:directory,PORT:String(port)},stdio:['ignore','pipe','pipe']});
 let logs='';child.stdout.on('data',bytes=>logs+=bytes);child.stderr.on('data',bytes=>logs+=bytes);
 async function close(){if(child.exitCode==null){const done=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await done;}await rm(directory,{recursive:true,force:true});}
 try{let ready=false;for(let i=0;i<200;i++){if(child.exitCode!=null)throw new Error(`Verification server stopped: ${logs}`);try{if((await fetch(origin+'/api/health')).ok){ready=true;break;}}catch{}await new Promise(resolve=>setTimeout(resolve,20));}if(!ready)throw new Error(`Verification server startup timed out (${origin}/api/health): ${logs}`);}
 catch(error){await close();throw error;}
 async function request(path,{method='GET',body,cookie}={}){const headers={};if(cookie)headers.Cookie=cookie;if(body!==undefined){headers.Origin=origin;headers['Content-Type']='application/json';}const started=performance.now();const response=await fetch(origin+path,{method,headers,body:body===undefined?undefined:JSON.stringify(body)});const value=await response.json();return {status:response.status,body:value,headers:response.headers,milliseconds:performance.now()-started};}
 async function login(user,pass){const value=await request('/api/login',{method:'POST',body:{username:user,password:pass}});if(value.status!==200)throw new Error(`Verification login failed (${value.status}).`);return {...value,cookie:value.headers.get('set-cookie').split(';')[0]};}
 const admin=await login(username,password);
 return {root,directory,origin,child,request,login,admin,close,password};
}

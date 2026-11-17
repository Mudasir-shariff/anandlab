import { DatabaseSync } from 'node:sqlite';
import { stat } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AuthStore } from '../lib/auth.mjs';

const [action,...args]=process.argv.slice(2);
const options={};
for(let i=0;i<args.length;i++){const flag=args[i];if(!flag.startsWith('--'))throw new Error('Use named options.');if(flag==='--password-stdin')options.passwordStdin=true;else{if(!args[i+1]||args[i+1].startsWith('--'))throw new Error(`Missing value for ${flag}.`);options[flag.slice(2)]=args[++i];}}
if(!['list','create','update'].includes(action)){
 console.error('Usage: node scripts/manage-users.mjs list | create --username NAME --role ROLE --display-name NAME --password-stdin | update --id ID [--role ROLE] [--disabled true|false] [--display-name NAME] [--password-stdin]');process.exit(1);
}
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const database=resolve(process.env.LAB_DATA_DIR || resolve(root,'data'),'labflow.sqlite');
await stat(database); // Never create a mistaken empty database at a typoed path.
const db=new DatabaseSync(database);db.exec('PRAGMA busy_timeout=5000;');
try{
 const store=new AuthStore(db);
 if(action==='list'){console.log(JSON.stringify({users:store.listUsers()},null,2));}
 else{
  let password;
  if(options.passwordStdin){let bytes='';for await(const chunk of process.stdin){bytes+=chunk;if(bytes.length>1024)throw new Error('Password input is too long.');}password=bytes.replace(/\r?\n$/,'');if(password.includes('\n'))throw new Error('Supply exactly one password line on stdin.');}
  const actor='offline-user-administrator';let user;
  if(action==='create'){
   if(!options.passwordStdin)throw new Error('User creation requires --password-stdin. Never put passwords in command arguments.');
   user=await store.createUser({username:options.username,displayName:options['display-name'],role:options.role,password},actor);
  }else{
   if(!options.id)throw new Error('Update requires --id.');const update={};
   if(options.role)update.role=options.role;if(options['display-name'])update.displayName=options['display-name'];
   if(Object.hasOwn(options,'disabled')){if(!['true','false'].includes(options.disabled))throw new Error('--disabled must be true or false.');update.disabled=options.disabled==='true';}
   if(options.passwordStdin)update.password=password;user=await store.updateUser(options.id,update,actor);
  }
  console.log(JSON.stringify({user},null,2));
 }
}finally{db.close();}

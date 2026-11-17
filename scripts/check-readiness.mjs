import { DatabaseSync } from 'node:sqlite';
import { stat, statfs, readFile, access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { inspectDatabase } from './restore-check.mjs';
import { sha256File } from './backup.mjs';

const ROOT=dirname(dirname(fileURLToPath(import.meta.url)));
const unsafeMode=mode=>process.platform!=='win32' && (mode&0o077)!==0;
const placeholder=value=>/(?:replace[-_ ]?with|change[-_ ]?me|your[-_ ]?(?:domain|password)|example\.(?:com|org)|localhost|127\.0\.0\.1)/i.test(value||'');
export async function checkReadiness({env=process.env,now=new Date(),root=ROOT}={}){
 const checks=[];
 const check=(id,ok,detail,severity='blocker')=>checks.push({id,status:ok?'pass':severity==='warning'?'warning':'blocked',detail});
 check('node_version',Number(process.versions.node.split('.')[0])>=24,'Node.js 24 or newer is required.');
 check('evaluation_mode',env.LAB_DEMO!=='1','Shared installations must not enable loopback evaluation mode.');
 let originOK=false;try{const origin=new URL(env.LAB_PUBLIC_ORIGIN);originOK=origin.protocol==='https:' && origin.origin===env.LAB_PUBLIC_ORIGIN && !placeholder(origin.hostname);}catch{}
 check('https_origin_configured',originOK,'Configure the exact HTTPS origin. This check does not establish that a live TLS endpoint works.');
 check('basic_auth_disabled',env.LAB_ALLOW_BASIC!=='1','Production access must use named staff sessions; legacy Basic compatibility must be disabled.');
 check('independent_review_enabled',env.LAB_REQUIRE_INDEPENDENT_REVIEW!=='0','Independent review must remain enabled.');
 const dataDir=resolve(env.LAB_DATA_DIR||resolve(root,'data')),dbPath=resolve(dataDir,'labflow.sqlite');let db;
 try{
   const info=await stat(dbPath),directory=await stat(dataDir);
   check('private_database_permissions',!unsafeMode(info.mode)&&!unsafeMode(directory.mode),'Database files and directory must be private to the service account (0600/0700).');
   await access(dataDir,constants.R_OK|constants.W_OK);check('data_directory_writable',true,'The service account can read and write the data directory.');
   const fs=await statfs(dataDir);const freeBytes=Number(fs.bavail)*Number(fs.bsize),minimum=Number(env.LAB_MIN_FREE_BYTES||1073741824);
   check('free_disk_space',Number.isFinite(minimum)&&minimum>=0&&freeBytes>=minimum,`Available bytes: ${freeBytes}; configured minimum: ${minimum}.`);
   inspectDatabase(dbPath);check('database_integrity',true,'SQLite integrity and order identity/version checks passed.');
   db=new DatabaseSync(dbPath,{readOnly:true});const staffTable=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='staff_users'").get();
   if(!staffTable)check('named_staff_roles',false,'Named staff accounts have not been initialized.');
   else{
     const roles=db.prepare('SELECT role,COUNT(*) AS count FROM staff_users WHERE disabled=0 GROUP BY role').all();const counts=Object.fromEntries(roles.map(row=>[row.role,row.count]));
     check('named_staff_roles',(counts.admin||0)>=1&&(counts.pathologist||0)>=1&&(counts.technician||0)>=1,'At least one enabled administrator, technician and pathologist account must exist for separated responsibilities.');
   }
 }catch(error){check('database_available',false,error.code==='ENOENT'?'Initialize the durable database before the readiness check.':`Database inspection failed: ${error.message}`);}
 finally{db?.close();}
 const backupDir=resolve(env.LAB_BACKUP_DIR||resolve(root,'backups')),receiptPath=resolve(env.LAB_RESTORE_RECEIPT||resolve(backupDir,'restore-check.json'));
 try{
   const receiptInfo=await stat(receiptPath);check('private_restore_receipt',!unsafeMode(receiptInfo.mode),'The restore verification receipt must have mode 0600.');
   const receipt=JSON.parse(await readFile(receiptPath,'utf8')),age=now.getTime()-new Date(receipt.checkedAt).getTime(),maxAge=Number(env.LAB_MAX_RESTORE_AGE_HOURS||168)*3600000;
   const valid=receipt.format==='labflow-restore-check-v1'&&receipt.integrity==='ok'&&Number.isFinite(age)&&age>=0&&age<=maxAge&&receipt.backupFile===basename(receipt.backupFile||'')&&/^[a-f0-9]{64}$/.test(receipt.backupSha256||'');
   if(!valid)throw new Error('A successful restore check from the last seven days (or configured interval) is required.');
   const file=resolve(backupDir,receipt.backupFile);if(await sha256File(file)!==receipt.backupSha256)throw new Error('The backup no longer matches its successful restore check.');
   const info=await stat(file);check('verified_encrypted_backup',!unsafeMode(info.mode),'A protected encrypted backup matches a recent successful isolated restore test.');
 }catch(error){check('verified_encrypted_backup',false,error.code==='ENOENT'?'Run an encrypted backup and isolated restore check, then retain both the backup and receipt.':error.message);}
 try{
   if(!env.LAB_CLINICAL_VALIDATION_FILE)throw new Error('Provide the local laboratory’s signed validation record through LAB_CLINICAL_VALIDATION_FILE.');
   const validation=JSON.parse(await readFile(resolve(env.LAB_CLINICAL_VALIDATION_FILE),'utf8'));
   const hash=createHash('sha256').update(await readFile(resolve(root,'dist/catalog.js'))).digest('hex');
   const approvedAt=new Date(validation.approvedAt),valid=validation.format==='labflow-clinical-validation-v1'&&typeof validation.approvedBy==='string'&&validation.approvedBy.trim().length>2&&validation.catalogSha256===hash&&Number.isFinite(approvedAt.getTime())&&approvedAt<=now;
   check('clinical_validation_record',valid,'A named reviewer’s validation record must identify the current catalog hash. This is an operator attestation; it does not prove clinical validity or accreditation.');
 }catch(error){check('clinical_validation_record',false,error.code==='ENOENT'?'The clinical validation record is missing.':error.message);}
 check('physical_print_validation',env.LAB_A4_PRINT_VALIDATED==='1','A lab operator must check actual A4/PDF output and printer margins on the deployed system.');
 const required=String(env.LAB_REQUIRED_INTEGRATIONS||'').split(',').map(value=>value.trim()).filter(Boolean);
 check('integration_validation',required.length===0,required.length?'This package cannot certify analyzer, WhatsApp or email integration. Validate each required model/provider before clearing this release gate.':'No external integration has been declared mandatory. This does not establish connector availability.');
 const ready=checks.every(item=>item.status!=='blocked');
 return {format:'labflow-readiness-v1',checkedAt:now.toISOString(),stage:ready?'technical-checks-pass':'blocked',ready,scope:'Local technical controls and operator attestations only; not clinical certification, legal compliance, security certification or evidence of competitor parity.',checks};
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 try{const report=await checkReadiness();console.log(JSON.stringify(report,null,2));if(!report.ready)process.exitCode=1;}
 catch(error){console.error(JSON.stringify({ready:false,error:error.message}));process.exitCode=1;}
}

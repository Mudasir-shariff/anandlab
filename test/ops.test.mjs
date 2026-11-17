import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import {mkdtemp,chmod,mkdir,writeFile,readFile,rm,stat,access} from 'node:fs/promises';
import {resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {createHash} from 'node:crypto';
import {createEncryptedBackup,decryptBackup,sha256File} from '../scripts/backup.mjs';
import {verifyRestore,inspectDatabase} from '../scripts/restore-check.mjs';
import {checkReadiness} from '../scripts/check-readiness.mjs';

const passphrase='A long unique test-only restore passphrase 2026';
async function fixture(){
 const root=await mkdtemp(resolve(tmpdir(),'labflow-ops-test-')),data=resolve(root,'data'),backups=resolve(root,'backups');await mkdir(data,{mode:0o700});
 const path=resolve(data,'labflow.sqlite'),db=new DatabaseSync(path);await chmod(path,0o600);
 db.exec(`PRAGMA journal_mode=WAL;
 CREATE TABLE orders(id TEXT PRIMARY KEY,payload TEXT NOT NULL,version INTEGER NOT NULL);
 CREATE TABLE settings(id INTEGER PRIMARY KEY,payload TEXT NOT NULL);
 CREATE TABLE audit(id INTEGER PRIMARY KEY AUTOINCREMENT,order_id TEXT,type TEXT NOT NULL,message TEXT NOT NULL,actor TEXT NOT NULL,at TEXT NOT NULL,before_json TEXT,after_json TEXT);
 CREATE TABLE staff_users(id TEXT PRIMARY KEY,username TEXT,role TEXT,disabled INTEGER DEFAULT 0);
 CREATE TABLE staff_sessions(token_hash TEXT PRIMARY KEY,user_id TEXT,created_at TEXT,expires_at TEXT,last_seen_at TEXT);
 CREATE TABLE auth_events(id INTEGER PRIMARY KEY,at TEXT);
 `);
 db.prepare('INSERT INTO orders VALUES(?,?,?)').run('LF-1',JSON.stringify({id:'LF-1',version:1,name:'Fictional test patient',status:'Approved',catalogSnapshot:{parameters:{hb:{name:'Hemoglobin',unit:'g/dL'}}}}),1);
 db.prepare('INSERT INTO settings VALUES(1,?)').run(JSON.stringify({labName:'Test laboratory'}));
 for(const role of ['admin','technician','pathologist'])db.prepare('INSERT INTO staff_users(id,username,role,disabled) VALUES(?,?,?,0)').run(role,role,role);
 db.prepare('INSERT INTO staff_sessions VALUES(?,?,?,?,?)').run('old-session','admin','2026-01-01','2028-01-01','2026-01-01');
 return {root,data,path,db,backups,close:async()=>{db.close();await rm(root,{recursive:true,force:true});}};
}

test('encrypted online backup restores a live WAL database and revokes old sessions',async()=>{
 const f=await fixture();try{
  const result=await createEncryptedBackup({databasePath:f.path,outputDirectory:f.backups,passphrase});
  const bytes=await readFile(result.file);assert(!bytes.includes(Buffer.from('Fictional test patient')));assert.equal((await stat(result.file)).mode&0o777,process.platform==='win32'?0o666:0o600);
  const receipt=resolve(f.backups,'restore-check.json'),verified=await verifyRestore({backupFile:result.file,passphrase,receiptPath:receipt});
  assert.equal(verified.tables.orders,1);assert.equal(verified.tables.staff_users,3);assert.equal(verified.backupSha256,await sha256File(result.file));
  const restored=resolve(f.root,'recovered');const restore=await verifyRestore({backupFile:result.file,passphrase,restoreTo:restored});
  assert.equal(restore.sessionsRevoked,true);const db=new DatabaseSync(restore.restoredDatabase,{readOnly:true});try{assert.equal(db.prepare('SELECT COUNT(*) AS n FROM staff_sessions').get().n,0);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM staff_users').get().n,3);assert.equal(JSON.parse(db.prepare('SELECT payload FROM orders').get().payload).catalogSnapshot.parameters.hb.unit,'g/dL');}finally{db.close();}
  await assert.rejects(verifyRestore({backupFile:result.file,passphrase,restoreTo:restored}),/new directory/);
  assert.equal(inspectDatabase(f.path).tables.staff_sessions,1,'the source must not lose its sessions');
 }finally{await f.close();}
});

test('wrong keys, tampering and overwrite attempts fail without destroying existing files',async()=>{
 const f=await fixture();try{
  const result=await createEncryptedBackup({databasePath:f.path,outputDirectory:f.backups,passphrase});
  const destination=resolve(f.root,'plain.sqlite');
  await assert.rejects(decryptBackup({backupFile:result.file,destination,passphrase:'This is an incorrect but long passphrase'}),/authenticated/);
  await assert.rejects(access(destination));
  const tampered=resolve(f.backups,'tampered.lfbackup'),bytes=await readFile(result.file);bytes[bytes.length-1]^=1;await writeFile(tampered,bytes,{mode:0o600});
  await assert.rejects(decryptBackup({backupFile:tampered,destination,passphrase}),/authenticated/);await assert.rejects(access(destination));
  await writeFile(destination,'KEEP THIS FILE',{mode:0o600});await assert.rejects(decryptBackup({backupFile:result.file,destination,passphrase}),/already exists/);assert.equal(await readFile(destination,'utf8'),'KEEP THIS FILE');
 }finally{await f.close();}
});

test('readiness fails closed until backups, named roles and lab-specific validation are evidenced',async()=>{
 const f=await fixture();try{
  const root=resolve(f.root,'app');await mkdir(resolve(root,'dist'),{recursive:true});const catalog='export const TESTS = {};\n';await writeFile(resolve(root,'dist/catalog.js'),catalog);
  const env={LAB_DATA_DIR:f.data,LAB_BACKUP_DIR:f.backups,LAB_PUBLIC_ORIGIN:'https://lab.clinic.in',LAB_MIN_FREE_BYTES:'0'};
  const blocked=await checkReadiness({env,root});assert.equal(blocked.ready,false);assert(blocked.checks.some(c=>c.id==='verified_encrypted_backup'&&c.status==='blocked'));assert(blocked.checks.some(c=>c.id==='clinical_validation_record'&&c.status==='blocked'));
  const result=await createEncryptedBackup({databasePath:f.path,outputDirectory:f.backups,passphrase});await verifyRestore({backupFile:result.file,passphrase,receiptPath:resolve(f.backups,'restore-check.json')});
  const validation=resolve(f.root,'validation.json');await writeFile(validation,JSON.stringify({format:'labflow-clinical-validation-v1',approvedBy:'Local qualified reviewer',approvedAt:new Date().toISOString(),catalogSha256:createHash('sha256').update(catalog).digest('hex')}),{mode:0o600});
  const passing=await checkReadiness({env:{...env,LAB_CLINICAL_VALIDATION_FILE:validation,LAB_A4_PRINT_VALIDATED:'1'},root});assert.equal(passing.ready,true,JSON.stringify(passing.checks));
  const bypass=await checkReadiness({env:{...env,LAB_CLINICAL_VALIDATION_FILE:validation,LAB_A4_PRINT_VALIDATED:'1',LAB_ALLOW_BASIC:'1',LAB_REQUIRE_INDEPENDENT_REVIEW:'0',LAB_REQUIRED_INTEGRATIONS:'all-analyzers'},root});assert.equal(bypass.ready,false);assert(bypass.checks.some(c=>c.id==='integration_validation'&&c.status==='blocked'));
 }finally{await f.close();}
});

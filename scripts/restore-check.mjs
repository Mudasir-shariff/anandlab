import { constants } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, mkdtemp, chmod, rm, open, rename, stat, copyFile } from 'node:fs/promises';
import { dirname, resolve, basename } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { decryptBackup, sha256File } from './backup.mjs';

const ROOT=dirname(dirname(fileURLToPath(import.meta.url)));
const exists=async path=>stat(path).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;});
export function inspectDatabase(path){
  const db=new DatabaseSync(path,{readOnly:true});
  try{
    const checks=db.prepare('PRAGMA integrity_check').all();
    if(checks.some(row=>Object.values(row)[0]!=='ok'))throw new Error('SQLite integrity check failed.');
    const tables=new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(row=>row.name));
    if(!['orders','settings','audit'].every(table=>tables.has(table)))throw new Error('Required Labflow tables are missing.');
    const counts={};for(const table of ['orders','settings','audit','staff_users','staff_sessions','auth_events'])if(tables.has(table))counts[table]=db.prepare(`SELECT COUNT(*) AS count FROM ${table}`).get().count;
    for(const row of db.prepare('SELECT id,payload,version FROM orders').iterate()){
      let payload;try{payload=JSON.parse(row.payload);}catch{throw new Error('An order payload is not valid JSON.');}
      if(payload.id!==row.id || payload.version!==row.version || !Number.isSafeInteger(row.version) || row.version<1)throw new Error('An order identity/version failed restoration validation.');
    }
    return {integrity:'ok',tables:counts};
  }finally{db.close();}
}

export async function verifyRestore({backupFile,passphrase,receiptPath,restoreTo,now=new Date()}){
  const backup=resolve(backupFile),scratch=await mkdtemp(resolve(tmpdir(),'labflow-restore-check-'));await chmod(scratch,0o700);
  const decrypted=resolve(scratch,'labflow.sqlite');let reservedDir=null;
  try{
    await decryptBackup({backupFile:backup,destination:decrypted,passphrase});
    const inspection=inspectDatabase(decrypted);
    let restoredPath=null;
    if(restoreTo){
      const directory=resolve(restoreTo);
      if(await exists(directory))throw new Error('Restore requires a new directory; existing data is never overwritten.');
      await mkdir(directory,{mode:0o700});reservedDir=directory;
      // A recovered database must require new logins; a captured old session is not a new authorization.
      const db=new DatabaseSync(decrypted);try{
        const sessionTable=db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='staff_sessions'").get();
        if(sessionTable)db.exec('DELETE FROM staff_sessions');
        db.prepare('INSERT INTO audit (order_id,type,message,actor,at) VALUES (NULL,?,?,?,?)').run('restore','Encrypted SQLite backup restored into a new directory','offline-restore',now.toISOString());
        db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
      }finally{db.close();}
      restoredPath=resolve(directory,'labflow.sqlite');await copyFile(decrypted,restoredPath,constants.COPYFILE_EXCL);await chmod(restoredPath,0o600);const restoredFile=await open(restoredPath,'r+');try{await restoredFile.sync();}finally{await restoredFile.close();}inspectDatabase(restoredPath);reservedDir=null;
    }
    const receipt={format:'labflow-restore-check-v1',checkedAt:now.toISOString(),backupFile:basename(backup),backupSha256:await sha256File(backup),...inspection,...(restoredPath?{restoredDatabase:restoredPath,sessionsRevoked:true}:{})};
    if(receiptPath){
      const final=resolve(receiptPath),directory=dirname(final);await mkdir(directory,{recursive:true,mode:0o700});
      const temporary=final+'.'+process.pid+'.partial',file=await open(temporary,'wx',0o600);
      try{await file.writeFile(JSON.stringify(receipt,null,2)+'\n');await file.sync();}finally{await file.close();}
      await rename(temporary,final);
    }
    return receipt;
  }finally{if(reservedDir)await rm(reservedDir,{recursive:true,force:true});await rm(scratch,{recursive:true,force:true});}
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const [backupFile,...args]=process.argv.slice(2);let restoreTo;
    if(args.length){if(args.length!==2 || args[0]!=='--restore-to')throw new Error('Usage: node scripts/restore-check.mjs /path/backup.lfbackup [--restore-to /new/data-directory]');restoreTo=args[1];}
    if(!backupFile)throw new Error('Provide the encrypted backup path. Keep the passphrase in LAB_BACKUP_PASSPHRASE.');
    const receipt=await verifyRestore({backupFile,passphrase:process.env.LAB_BACKUP_PASSPHRASE,restoreTo,receiptPath:process.env.LAB_RESTORE_RECEIPT||resolve(process.env.LAB_BACKUP_DIR||resolve(ROOT,'backups'),'restore-check.json')});
    console.log(JSON.stringify({ok:true,...receipt}));
  }catch(error){console.error(JSON.stringify({ok:false,error:error.message}));process.exitCode=1;}
}

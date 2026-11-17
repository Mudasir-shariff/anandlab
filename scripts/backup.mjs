import { DatabaseSync, backup as sqliteBackup } from 'node:sqlite';
import { createCipheriv, createDecipheriv, randomBytes, scryptSync, createHash } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, mkdtemp, chmod, open, readFile, rename, rm, stat } from 'node:fs/promises';
import { pipeline, finished } from 'node:stream/promises';
import { resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const MAGIC = Buffer.from('LABFLOW-BACKUP-1\n');
const FORMAT = 'labflow-encrypted-sqlite-v1';
const TAG_BYTES = 16;
const keyFor = (passphrase,salt) => {
  if(typeof passphrase!=='string' || passphrase.length<20 || passphrase.length>1024) throw new Error('Set LAB_BACKUP_PASSPHRASE to a unique passphrase of 20–1024 characters.');
  return scryptSync(passphrase,salt,32,{N:32768,r:8,p:1,maxmem:64*1024*1024});
};
const secretBytes = (value,length,name) => {
  if(typeof value!=='string') throw new Error(`Invalid backup ${name}.`);
  const bytes=Buffer.from(value,'base64');
  if(bytes.length!==length || bytes.toString('base64')!==value) throw new Error(`Invalid backup ${name}.`);
  return bytes;
};
export async function sha256File(path){ const hash=createHash('sha256');for await(const chunk of createReadStream(path))hash.update(chunk);return hash.digest('hex'); }

/** Back up a live SQLite database using SQLite's consistent online backup API. */
export async function createEncryptedBackup({databasePath,outputDirectory,passphrase,now=new Date()}){
  const sourcePath=resolve(databasePath),directory=resolve(outputDirectory);
  if(!(await stat(sourcePath)).isFile()) throw new Error('Database path is not a regular file.');
  await mkdir(directory,{recursive:true,mode:0o700});await chmod(directory,0o700);
  const scratch=await mkdtemp(resolve(directory,'.snapshot-'));await chmod(scratch,0o700);
  const snapshot=resolve(scratch,'snapshot.sqlite'),temporary=resolve(scratch,'backup.partial');
  const finalPath=resolve(directory,`labflow-${now.toISOString().replace(/[:.]/g,'-')}-${randomBytes(4).toString('hex')}.lfbackup`);
  let source,output;
  try{
    source=new DatabaseSync(sourcePath,{readOnly:true});
    // Yield to the event loop before calling the sqlite async backup API.
    // On Node 24 on Windows, calling backup() directly inside certain async
    // callback chains triggers an internal assertion (env_->execution_async_id()==0).
    // A setImmediate yield ensures the call begins from a clean async context.
    await new Promise(resolve=>setImmediate(resolve));
    await sqliteBackup(source,snapshot);source.close();source=null;await chmod(snapshot,0o600);
    const salt=randomBytes(32),iv=randomBytes(12),key=keyFor(passphrase,salt);
    const header=Buffer.from(JSON.stringify({format:FORMAT,cipher:'aes-256-gcm',kdf:'scrypt-N32768-r8-p1',salt:salt.toString('base64'),iv:iv.toString('base64'),createdAt:now.toISOString()}));
    const length=Buffer.alloc(4);length.writeUInt32BE(header.length);
    const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(header);key.fill(0);
    output=createWriteStream(temporary,{flags:'wx',mode:0o600});
    await new Promise((accept,reject)=>output.write(Buffer.concat([MAGIC,length,header]),error=>error?reject(error):accept()));
    await pipeline(createReadStream(snapshot),cipher,output,{end:false});
    output.end(cipher.getAuthTag());await finished(output);output=null;
    const handle=await open(temporary,'r+');try{await handle.sync();}finally{await handle.close();}
    await rename(temporary,finalPath);
    const result={format:FORMAT,file:finalPath,createdAt:now.toISOString(),sha256:await sha256File(finalPath),sizeBytes:(await stat(finalPath)).size};
    return result;
  }finally{try{source?.close();}catch{}output?.destroy();await rm(scratch,{recursive:true,force:true});}
}

/** Decrypt only into a new destination file; authenticated failure removes output. */
export async function decryptBackup({backupFile,destination,passphrase}){
  const file=resolve(backupFile),target=resolve(destination),handle=await open(file,'r');let output,targetHandle,owned=false;
  try{
    const info=await handle.stat(),prefix=Buffer.alloc(MAGIC.length+4);
    if((await handle.read(prefix,0,prefix.length,0)).bytesRead!==prefix.length || !prefix.subarray(0,MAGIC.length).equals(MAGIC))throw new Error('Unsupported or truncated Labflow backup.');
    const headerLength=prefix.readUInt32BE(MAGIC.length);
    if(headerLength<30 || headerLength>4096 || info.size<=prefix.length+headerLength+TAG_BYTES)throw new Error('Invalid backup header or ciphertext length.');
    const headerBytes=Buffer.alloc(headerLength);await handle.read(headerBytes,0,headerLength,prefix.length);
    let header;try{header=JSON.parse(headerBytes.toString());}catch{throw new Error('Invalid backup header.');}
    if(header.format!==FORMAT || header.cipher!=='aes-256-gcm' || header.kdf!=='scrypt-N32768-r8-p1')throw new Error('Unsupported backup encryption format.');
    const key=keyFor(passphrase,secretBytes(header.salt,32,'salt'));
    const decipher=createDecipheriv('aes-256-gcm',key,secretBytes(header.iv,12,'IV'));key.fill(0);decipher.setAAD(headerBytes);
    const tag=Buffer.alloc(TAG_BYTES);await handle.read(tag,0,TAG_BYTES,info.size-TAG_BYTES);decipher.setAuthTag(tag);
    targetHandle=await open(target,'wx',0o600);owned=true;output=createWriteStream(target,{fd:targetHandle.fd,autoClose:false});
    await pipeline(createReadStream(file,{start:prefix.length+headerLength,end:info.size-TAG_BYTES-1}),decipher,output);output=null;
    return {format:header.format,createdAt:header.createdAt,destination:target};
  }catch(error){output?.destroy();await targetHandle?.close().catch(()=>{});targetHandle=null;if(owned)await rm(target,{force:true}).catch(()=>{});if(error.code==='EEXIST')throw new Error('Restore destination already exists; no file was overwritten.');throw new Error('Backup could not be authenticated or restored. Check its format and passphrase.');}
  finally{await targetHandle?.close().catch(()=>{});await handle.close();}
}

if(process.argv[1] && resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    if(process.argv.length>2)throw new Error('This command takes no arguments. Configure LAB_DATA_DIR, LAB_BACKUP_DIR and LAB_BACKUP_PASSPHRASE through protected environment settings.');
    const result=await createEncryptedBackup({databasePath:resolve(process.env.LAB_DATA_DIR||resolve(ROOT,'data'),'labflow.sqlite'),outputDirectory:process.env.LAB_BACKUP_DIR||resolve(ROOT,'backups'),passphrase:process.env.LAB_BACKUP_PASSPHRASE});
    console.log(JSON.stringify({ok:true,backup:basename(result.file),...result}));
  }catch(error){console.error(JSON.stringify({ok:false,error:error.message}));process.exitCode=1;}
}

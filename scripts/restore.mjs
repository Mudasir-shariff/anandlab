// Offline restore into a new data directory. Never overwrites an existing database.
import { DatabaseSync } from 'node:sqlite';
import { readFile, mkdir, open, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';

const [source,directory] = process.argv.slice(2);
if(!source || !directory) {
  console.error('Usage: node scripts/restore.mjs /secure/backup.json /new/empty-data-directory');
  process.exit(1);
}
const backup = JSON.parse(await readFile(resolve(source),'utf8'));
if(backup.format !== 'labflow-backup-v1' || !Array.isArray(backup.orders) || !Array.isArray(backup.audit) || !backup.settings || typeof backup.settings !== 'object') throw new Error('Invalid Labflow backup format.');
const ids=new Set();
for(const order of backup.orders) {
  if(!order || typeof order.id !== 'string' || !Number.isSafeInteger(order.version) || order.version < 1 || ids.has(order.id)) throw new Error('Invalid or duplicate order in backup.');
  ids.add(order.id);
}
for(const row of backup.audit) {
  if(!Number.isSafeInteger(row.id) || row.id < 1 || !['type','message','actor','at'].every(key=>typeof row[key] === 'string')) throw new Error('Invalid audit row.');
}
const targetDir=resolve(directory);
await mkdir(targetDir,{recursive:true,mode:0o700});
const target=resolve(targetDir,'labflow.sqlite');
const reserved=await open(target,'wx',0o600); await reserved.close();
let db;
try {
  db=new DatabaseSync(target);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL;
CREATE TABLE orders (id TEXT PRIMARY KEY, payload TEXT NOT NULL, version INTEGER NOT NULL);
CREATE TABLE settings (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL);
CREATE TABLE audit (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT, type TEXT NOT NULL, message TEXT NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL, before_json TEXT, after_json TEXT);
PRAGMA user_version=1; BEGIN IMMEDIATE;`);
  const insertOrder=db.prepare('INSERT INTO orders (id,payload,version) VALUES (?,?,?)');
  for(const order of backup.orders) insertOrder.run(order.id,JSON.stringify(order),order.version);
  db.prepare('INSERT INTO settings (id,payload) VALUES (1,?)').run(JSON.stringify(backup.settings));
  const insertAudit=db.prepare('INSERT INTO audit (id,order_id,type,message,actor,at,before_json,after_json) VALUES (?,?,?,?,?,?,?,?)');
  for(const row of backup.audit) insertAudit.run(row.id,row.order_id || null,row.type,row.message,row.actor,row.at,row.before_json || null,row.after_json || null);
  db.prepare('INSERT INTO audit (order_id,type,message,actor,at) VALUES (NULL,?,?,?,?)').run('restore','Backup restored into a new database','offline-restore',new Date().toISOString());
  db.exec('COMMIT; PRAGMA wal_checkpoint(TRUNCATE);');
  db.close();
  console.log(`Restored ${backup.orders.length} orders and ${backup.audit.length} audit entries into ${target}. Configure LAB_DATA_DIR to this directory before starting the server.`);
} catch(error) {
  try {db?.close();} catch{}
  await unlink(target).catch(()=>{});
  await unlink(target+'-wal').catch(()=>{}); await unlink(target+'-shm').catch(()=>{});
  throw error;
}

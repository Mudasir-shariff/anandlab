import {readdir} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {resolve,extname} from 'node:path';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('..',import.meta.url));
let checked=0;
async function scan(dir){for(const entry of await readdir(dir,{withFileTypes:true})){const path=resolve(dir,entry.name);if(entry.isDirectory())await scan(path);else if(['.js','.mjs'].includes(extname(path))){const result=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});if(result.status){process.stderr.write(result.stderr);process.exitCode=1;}checked++;}}}
for(const name of ['dist','lib','scripts'])await scan(resolve(root,name));
const result=spawnSync(process.execPath,['--check',resolve(root,'server.mjs')],{encoding:'utf8'});if(result.status){process.stderr.write(result.stderr);process.exitCode=1;}
console.log(`Syntax checked ${checked+1} application files.`);

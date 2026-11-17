import { randomBytes, randomUUID, scrypt, createHash, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const SCRYPT = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export const ROLES = ['admin','reception','technician','pathologist','billing','auditor'];
const PERMISSIONS = {
  admin: ['orders:read','orders:create','orders:update','samples:write','workflow:process','results:write','reports:approve','billing:write','settings:write','users:manage','audit:read','backup:read','integrations:manage','quality:manage'],
  reception: ['orders:read','orders:create','orders:update','samples:write'],
  technician: ['orders:read','samples:write','workflow:process','results:write','quality:manage'],
  pathologist: ['orders:read','samples:write','workflow:process','results:write','reports:approve','quality:manage'],
  billing: ['orders:read','billing:write'],
  auditor: ['orders:read','audit:read']
};
export class AuthError extends Error { constructor(status,message) { super(message); this.status=status; } }
export const permissionsFor = user => [...(PERMISSIONS[user?.role] || [])];
export const hasPermission = (user, permission) => permissionsFor(user).includes(permission);
export function requirePermission(user, permission) { if(!hasPermission(user,permission)) throw new AuthError(403,`Permission required: ${permission}.`); }
export function safeUser(row) {
  if(!row) return null;
  return {id:row.id,username:row.username,displayName:row.display_name,role:row.role,disabled:!!row.disabled,createdAt:row.created_at,updatedAt:row.updated_at};
}
function usernameValue(value) {
  if(typeof value!=='string' || !/^[A-Za-z0-9][A-Za-z0-9_.@-]{1,63}$/.test(value)) throw new AuthError(422,'Username must contain 2–64 letters, numbers, dots, underscores, @ signs, or hyphens.');
  return value.toLowerCase();
}
function displayValue(value,username) {
  if(value == null) return username;
  if(typeof value!=='string' || !value.trim() || value.length>100 || /[\x00-\x1f\x7f]/.test(value)) throw new AuthError(422,'Display name must contain 1–100 characters without control characters.');
  return value.trim();
}
function roleValue(value) { if(!ROLES.includes(value)) throw new AuthError(422,'Unknown staff role.'); return value; }
function passwordValue(value) { if(typeof value!=='string' || value.length<16 || value.length>256) throw new AuthError(422,'Password must contain 16–256 characters.'); return value; }
export async function passwordDigest(password) {
  passwordValue(password);
  const salt=randomBytes(16).toString('base64url');
  const digest=await derive(password,salt,64,SCRYPT);
  return {password_hash:`scrypt-v1$${digest.toString('base64url')}`,password_salt:salt};
}
async function verifyPassword(password,row) {
  // The same expensive derivation runs for unknown users to reduce timing leaks.
  const salt=row?.password_salt || 'labflow-unknown-account-salt';
  const actual=await derive(typeof password==='string' ? password : '',salt,64,SCRYPT);
  const encoded=row?.password_hash?.startsWith('scrypt-v1$') ? row.password_hash.slice(10) : '';
  const expected=encoded ? Buffer.from(encoded,'base64url') : Buffer.alloc(64);
  return !!row && expected.length===actual.length && timingSafeEqual(actual,expected);
}
const tokenHash = token => createHash('sha256').update(token).digest('hex');

export class AuthStore {
  constructor(db,{secureCookie=false,sessionSeconds=8*60*60,allowBasic=false}={}) {
    this.db=db; this.secureCookie=secureCookie; this.sessionSeconds=sessionSeconds; this.allowBasic=allowBasic;
    this.verifiedCredentials=new WeakMap();
    db.exec(`CREATE TABLE IF NOT EXISTS staff_users (
      id TEXT PRIMARY KEY, username TEXT UNIQUE COLLATE NOCASE NOT NULL,
      display_name TEXT NOT NULL, role TEXT NOT NULL, password_hash TEXT NOT NULL,
      password_salt TEXT NOT NULL, disabled INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL, updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS staff_sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, created_at TEXT NOT NULL,
      expires_at TEXT NOT NULL, last_seen_at TEXT NOT NULL,
      FOREIGN KEY(user_id) REFERENCES staff_users(id)
    );
    CREATE INDEX IF NOT EXISTS staff_sessions_user ON staff_sessions(user_id);
    CREATE INDEX IF NOT EXISTS staff_sessions_expiry ON staff_sessions(expires_at);
    CREATE TABLE IF NOT EXISTS auth_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, at TEXT NOT NULL, actor_id TEXT,
      action TEXT NOT NULL, target_id TEXT, metadata TEXT NOT NULL
    );`);
  }
  atomic(fn) { this.db.exec('BEGIN IMMEDIATE'); try {const value=fn();this.db.exec('COMMIT');return value;} catch(error) {this.db.exec('ROLLBACK');throw error;} }
  event(action,actorId=null,targetId=null,metadata={}) {this.db.prepare('INSERT INTO auth_events (at,actor_id,action,target_id,metadata) VALUES (?,?,?,?,?)').run(new Date().toISOString(),actorId,action,targetId,JSON.stringify(metadata));}
  count() {return this.db.prepare('SELECT COUNT(*) AS n FROM staff_users').get().n;}
  listUsers() {return this.db.prepare('SELECT * FROM staff_users ORDER BY username').all().map(safeUser);}
  find(id) {return this.db.prepare('SELECT * FROM staff_users WHERE id=?').get(id);}
  findUsername(username) {return this.db.prepare('SELECT * FROM staff_users WHERE username=? COLLATE NOCASE').get(username);}
  assertAdministrator(actorId) {
    if(!actorId?.startsWith('usr-')) return; // Explicit offline/bootstrap system actors.
    const actor=this.find(actorId);if(!actor || actor.disabled || actor.role!=='admin')throw new AuthError(403,'An active administrator must manage staff accounts.');
  }
  async bootstrap({username,password,displayName='Lab administrator'}={}) {
    if(this.count()) return null;
    const normalized=usernameValue(username); const digest=await passwordDigest(password);
    return this.atomic(()=>{
      if(this.count()) return null;
      return this.insertUser({username:normalized,displayName:displayValue(displayName,normalized),role:'admin',...digest},'bootstrap');
    });
  }
  insertUser(input,actorId) {
    if(this.findUsername(input.username)) throw new AuthError(409,'Username already exists.');
    const now=new Date().toISOString(),id=`usr-${randomUUID()}`;
    this.db.prepare('INSERT INTO staff_users (id,username,display_name,role,password_hash,password_salt,disabled,created_at,updated_at) VALUES (?,?,?,?,?,?,0,?,?)').run(id,input.username,input.displayName,input.role,input.password_hash,input.password_salt,now,now);
    this.event('user.created',actorId,id,{username:input.username,role:input.role});
    return safeUser(this.find(id));
  }
  async createUser(input,actorId) {
    if(!input || typeof input!=='object' || Array.isArray(input)) throw new AuthError(422,'Expected a staff user object.');
    for(const key of Object.keys(input)) if(!['username','displayName','role','password'].includes(key)) throw new AuthError(422,`Unknown user field: ${key}.`);
    const username=usernameValue(input.username),displayName=displayValue(input.displayName,username),role=roleValue(input.role);
    const digest=await passwordDigest(input.password);
    return this.atomic(()=>{this.assertAdministrator(actorId);return this.insertUser({username,displayName,role,...digest},actorId);});
  }
  async updateUser(id,input,actorId) {
    if(!input || typeof input!=='object' || Array.isArray(input)) throw new AuthError(422,'Expected a staff update object.');
    for(const key of Object.keys(input)) if(!['displayName','role','disabled','password'].includes(key)) throw new AuthError(422,`Unknown user field: ${key}.`);
    if(!Object.keys(input).length) throw new AuthError(422,'Provide a staff update.');
    const digest=Object.hasOwn(input,'password') ? await passwordDigest(input.password) : null;
    return this.atomic(()=>{
      this.assertAdministrator(actorId);
      const old=this.find(id); if(!old) throw new AuthError(404,'Staff user not found.');
      const role=Object.hasOwn(input,'role') ? roleValue(input.role) : old.role;
      const displayName=Object.hasOwn(input,'displayName') ? displayValue(input.displayName,old.username) : old.display_name;
      if(Object.hasOwn(input,'disabled') && typeof input.disabled!=='boolean') throw new AuthError(422,'Disabled must be a boolean.');
      const disabled=Object.hasOwn(input,'disabled') ? Number(input.disabled) : old.disabled;
      if(old.role==='admin' && !old.disabled && (role!=='admin' || disabled)) {
        if(this.db.prepare("SELECT COUNT(*) AS n FROM staff_users WHERE role='admin' AND disabled=0").get().n<=1) throw new AuthError(409,'The last active administrator cannot be disabled or demoted.');
      }
      this.db.prepare('UPDATE staff_users SET display_name=?,role=?,disabled=?,password_hash=?,password_salt=?,updated_at=? WHERE id=?').run(displayName,role,disabled,digest?.password_hash||old.password_hash,digest?.password_salt||old.password_salt,new Date().toISOString(),id);
      if(digest || disabled || role!==old.role) this.db.prepare('DELETE FROM staff_sessions WHERE user_id=?').run(id);
      const user=safeUser(this.find(id));
      this.event('user.updated',actorId,id,{before:safeUser(old),after:user,passwordReset:!!digest});
      return user;
    });
  }
  async credentials(username,password) {
    const validUsername=typeof username==='string' && /^[A-Za-z0-9][A-Za-z0-9_.@-]{1,63}$/.test(username);
    const row=validUsername ? this.findUsername(username.toLowerCase()) : null;
    if(typeof password!=='string' || password.length>256) throw new AuthError(401,'Invalid username or password.');
    const matches=await verifyPassword(password,row);
    const current=row ? this.find(row.id) : null;
    if(!matches || !current || current.disabled || current.password_hash!==row.password_hash || current.password_salt!==row.password_salt) {this.event('login.failed',null,row?.id||null,{username:validUsername?username.toLowerCase():'invalid-format'});throw new AuthError(401,'Invalid username or password.');}
    const user=safeUser(current);this.verifiedCredentials.set(user,`${current.password_hash}:${current.password_salt}`);return user;
  }
  async login(username,password) {
    const user=await this.credentials(username,password);
    return this.atomic(()=>{
      const current=this.find(user.id); if(!current || current.disabled || this.verifiedCredentials.get(user)!==`${current.password_hash}:${current.password_salt}`) throw new AuthError(401,'Invalid username or password.');
      const token=randomBytes(32).toString('base64url'),now=new Date(),expiry=new Date(now.getTime()+this.sessionSeconds*1000);
      this.db.prepare('DELETE FROM staff_sessions WHERE expires_at<=?').run(now.toISOString());
      this.db.prepare('INSERT INTO staff_sessions (token_hash,user_id,created_at,expires_at,last_seen_at) VALUES (?,?,?,?,?)').run(tokenHash(token),user.id,now.toISOString(),expiry.toISOString(),now.toISOString());
      this.event('login.succeeded',user.id,user.id);
      return {user:safeUser(current),token};
    });
  }
  cookieToken(req) {
    const cookies=req.headers.cookie || '';
    const item=cookies.split(';').map(value=>value.trim()).find(value=>value.startsWith('labflow_session='));
    const token=item?.slice('labflow_session='.length);
    return token && /^[A-Za-z0-9_-]{43}$/.test(token) ? token : null;
  }
  async authenticate(req) {
    const token=this.cookieToken(req);
    if(token) {
      const row=this.db.prepare('SELECT u.*,s.last_seen_at,s.expires_at FROM staff_sessions s JOIN staff_users u ON u.id=s.user_id WHERE s.token_hash=?').get(tokenHash(token));
      if(row && !row.disabled && row.expires_at>new Date().toISOString()) {
        if(Date.now()-Date.parse(row.last_seen_at)>60_000) this.db.prepare('UPDATE staff_sessions SET last_seen_at=? WHERE token_hash=?').run(new Date().toISOString(),tokenHash(token));
        return safeUser(row);
      }
    }
    if(this.allowBasic && req.headers.authorization?.startsWith('Basic ')) {
      let decoded='';try {decoded=Buffer.from(req.headers.authorization.slice(6),'base64').toString('utf8');}catch{}
      const colon=decoded.indexOf(':'); if(colon>=0) return this.credentials(decoded.slice(0,colon),decoded.slice(colon+1));
    }
    throw new AuthError(401,'Sign in to your laboratory workspace.');
  }
  assertCurrent(req,user) {
    const current=this.find(user.id);
    if(!current || current.disabled || current.role!==user.role)throw new AuthError(401,'Your account changed. Sign in again.');
    const token=this.cookieToken(req);
    if(token){const session=this.db.prepare('SELECT user_id,expires_at FROM staff_sessions WHERE token_hash=?').get(tokenHash(token));if(session && session.user_id===user.id && session.expires_at>new Date().toISOString())return;}
    if(this.allowBasic && this.verifiedCredentials.get(user)===`${current.password_hash}:${current.password_salt}`)return;
    throw new AuthError(401,'Your session expired or was revoked. Sign in again.');
  }
  logout(req,user) {const token=this.cookieToken(req);if(token)this.db.prepare('DELETE FROM staff_sessions WHERE token_hash=?').run(tokenHash(token));this.event('logout',user.id,user.id);}
  cookie(token) {return `labflow_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${this.sessionSeconds}${this.secureCookie?'; Secure':''}`;}
  clearCookie() {return `labflow_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${this.secureCookie?'; Secure':''}`;}
  authEvents(limit=100) {return this.db.prepare('SELECT * FROM auth_events ORDER BY id DESC LIMIT ?').all(limit).map(row=>({...row,metadata:JSON.parse(row.metadata)}));}
}

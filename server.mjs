import http from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import { readFile, mkdir, chmod, stat } from 'node:fs/promises';
import { resolve, dirname, extname, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { TESTS, PARAMETERS, reportNotes } from './dist/catalog.js';
import { AuthStore, ROLES, permissionsFor, hasPermission, requirePermission as requireRolePermission, safeUser } from './lib/auth.mjs';
import { createPlatformRoutes } from './lib/platform.mjs';
import { createSpecimens, applyWorkflowSpecimens, validateSpecimenAction, acknowledgeCritical, assessRelease } from './lib/quality.mjs';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DEMO = process.env.LAB_DEMO === '1';
const USER = process.env.LAB_USER || '';
const PASSWORD = process.env.LAB_PASSWORD || '';
const REQUIRE_INDEPENDENT_REVIEW = !DEMO && process.env.LAB_REQUIRE_INDEPENDENT_REVIEW !== '0';
const HOST = DEMO ? '127.0.0.1' : (process.env.LAB_HOST || '127.0.0.1');
const PORT = Number(process.env.PORT || 3000);
const DATA_DIR = resolve(process.env.LAB_DATA_DIR || resolve(ROOT, 'data'));
await mkdir(DATA_DIR, { recursive: true, mode: 0o700 });
await chmod(DATA_DIR, 0o700);
const DATABASE_PATH = resolve(DATA_DIR, 'labflow.sqlite');
const db = new DatabaseSync(DATABASE_PATH);
await chmod(DATABASE_PATH, 0o600);
db.exec(`PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA busy_timeout=5000;
CREATE TABLE IF NOT EXISTS orders (id TEXT PRIMARY KEY, payload TEXT NOT NULL, version INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS settings (id INTEGER PRIMARY KEY CHECK(id=1), payload TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit (id INTEGER PRIMARY KEY AUTOINCREMENT, order_id TEXT, type TEXT NOT NULL, message TEXT NOT NULL, actor TEXT NOT NULL, at TEXT NOT NULL, before_json TEXT, after_json TEXT);
CREATE TABLE IF NOT EXISTS quality_controls (test_code TEXT PRIMARY KEY, payload TEXT NOT NULL, version INTEGER NOT NULL);
PRAGMA user_version=1;`);
const auth = new AuthStore(db, {
  secureCookie: process.env.LAB_PUBLIC_ORIGIN?.startsWith('https://') || false,
  allowBasic: process.env.LAB_ALLOW_BASIC === '1'
});
try {
  await auth.bootstrap({username:DEMO?'local-demo':USER,password:DEMO?`${randomUUID()}-${randomUUID()}`:PASSWORD});
} catch(error) {
  console.error(`Staff initialization failed: ${error.message} Configure LAB_USER and LAB_PASSWORD for the first administrator.`);
  db.close(); process.exit(1);
}
const DEFAULT_SETTINGS = {
  labName: 'Labflow Diagnostics', address: '', phone: '', email: '', registration: '',
  pathologist: '', reportTemplate: 'classic', website: '', labIncharge: '',
  labInchargeQualification: '', pathologistQualification: '', reportFooter: '', workingHours: ''
};
const SETTINGS_LIMITS = {
  labName: 200, address: 500, phone: 200, email: 200, registration: 200,
  pathologist: 200, reportTemplate: 20, website: 500, labIncharge: 200,
  labInchargeQualification: 200, pathologistQualification: 200,
  reportFooter: 1500, workingHours: 300
};
const statusFlow = ['Registered', 'Collected', 'Processing', 'Review', 'Approved'];
const clinicalFields = ['patientId','name','age','sex','phone','email','category','referrer','tests','priority','status','results','notes'];
const enforceClinicalValidation=!DEMO&&process.env.NODE_ENV==='production';
let clinicalValidation={valid:false,detail:'No laboratory catalog validation record is configured.'};
if(process.env.LAB_CLINICAL_VALIDATION_FILE){try{const record=JSON.parse(await readFile(resolve(process.env.LAB_CLINICAL_VALIDATION_FILE),'utf8'));const hash=createHash('sha256').update(await readFile(resolve(ROOT,'dist/catalog.js'))).digest('hex');const time=new Date(record.approvedAt);const valid=record.format==='labflow-clinical-validation-v1'&&typeof record.approvedBy==='string'&&record.approvedBy.trim().length>2&&record.catalogSha256===hash&&Number.isFinite(time.getTime())&&time.getTime()<=Date.now();clinicalValidation={valid,detail:valid?'The operator validation record matches this catalog revision.':'The laboratory validation record is invalid or does not match the catalog revision.'};}catch{clinicalValidation={valid:false,detail:'The laboratory catalog validation record could not be read.'};}}
const failures = new Map();
const stringify = value => JSON.stringify(value);
const allOrders = () => db.prepare('SELECT payload FROM orders ORDER BY rowid DESC').all().map(row => JSON.parse(row.payload));
const recentOrders=()=>db.prepare('SELECT payload FROM orders ORDER BY rowid DESC LIMIT 250').all().map(row=>JSON.parse(row.payload));
const workspaceStats=()=>{const row=db.prepare(`SELECT COUNT(*) AS totalOrders,COUNT(DISTINCT json_extract(payload,'$.patientId')) AS totalPatients,COALESCE(SUM(json_extract(payload,'$.amount')),0) AS totalInvoiced,COALESCE(SUM(json_extract(payload,'$.paid')),0) AS totalPaid,COALESCE(SUM(json_extract(payload,'$.paid')<json_extract(payload,'$.amount')),0) AS unpaid FROM orders`).get();const counts=Object.fromEntries(db.prepare("SELECT json_extract(payload,'$.status') AS status,COUNT(*) AS n FROM orders GROUP BY status").all().map(r=>[r.status,r.n]));return {...row,statusCounts:counts};};
const getOrder = id => { const row = db.prepare('SELECT payload FROM orders WHERE id=?').get(id); return row ? JSON.parse(row.payload) : null; };
const getSettings = () => { const row = db.prepare('SELECT payload FROM settings WHERE id=1').get(); return row ? { ...DEFAULT_SETTINGS, ...JSON.parse(row.payload) } : { ...DEFAULT_SETTINGS }; };
const getQualityControls = () => Object.fromEntries(db.prepare('SELECT test_code,payload FROM quality_controls').all().map(row=>[row.test_code,JSON.parse(row.payload)]));
const qualityContext = () => ({catalog:TESTS,parameters:PARAMETERS,qcStatus:Object.fromEntries(Object.entries(getQualityControls()).map(([code,control])=>[code,{required:true,status:control.status==='accepted'?'passed':'failed',recordedAt:control.acceptedAt || control.recordedAt,expiresAt:control.expiresAt}]))});
const audit = (orderId, type, message, actor, before, after) => db.prepare('INSERT INTO audit (order_id,type,message,actor,at,before_json,after_json) VALUES (?,?,?,?,?,?,?)').run(orderId || null,type,message,actor,new Date().toISOString(),before ? stringify(before) : null,after ? stringify(after) : null);
const transaction = fn => { db.exec('BEGIN IMMEDIATE'); try { const value = fn(); db.exec('COMMIT'); return value; } catch(error) { db.exec('ROLLBACK'); throw error; } };
class ApiError extends Error { constructor(status, message, details) { super(message); this.status = status; this.details = details; } }
const problem = (message, details) => { throw new ApiError(422, message, details); };
const textValue = (value, name, max=200, required=false) => {
  if (value == null) value = '';
  if (typeof value !== 'string' || value.length > max || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) problem(`Invalid ${name}.`);
  value = value.trim(); if(required && !value) problem(`${name} is required.`); return value;
};
const numberValue = (value, name, min, max) => {
  if ((typeof value !== 'number' && typeof value !== 'string') ||
      (typeof value === 'string' && !/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()))) problem(`${name} must be a number.`);
  const number = Number(value); if(!Number.isFinite(number) || number < min || number > max) problem(`${name} must be between ${min} and ${max}.`); return number;
};
const paymentValue = (value, amount) => {
  const paid = numberValue(value, 'Amount paid', 0, amount);
  if(Math.abs(Math.round(paid * 100) - paid * 100) > 1e-7) problem('Amount paid must use at most two decimal places.');
  return Math.round(paid * 100) / 100;
};
const hasClinicalChanges = (input, old) => clinicalFields.some(key => Object.hasOwn(input,key) && !isDeepStrictEqual(input[key],old[key]));
function catalogSnapshot(tests) {
  const snapshot = { tests: {}, parameters: {} };
  for(const code of tests) {
    snapshot.tests[code] = { ...structuredClone(TESTS[code]), notes: reportNotes[code] || '' };
    for(const key of TESTS[code].parameters) snapshot.parameters[key] = structuredClone(PARAMETERS[key]);
  }
  return snapshot;
}
function normalize(input, old) {
  if(!input || typeof input !== 'object' || Array.isArray(input)) problem('Expected an order object.');
  if(old && !hasClinicalChanges(input,old)) {
    // Billing must remain possible for existing orders after catalog changes,
    // without repricing, revalidating, or rewriting stored clinical records.
    const paid = paymentValue(input.paid ?? old.paid, old.amount);
    if(paid < old.paid) problem('Refunds require a separate accounting process; amount paid cannot be reduced.');
    return { ...old, paid,
      paymentMethod: textValue(input.paymentMethod ?? old.paymentMethod ?? 'Cash', 'Payment method', 50),
      updatedAt: new Date().toISOString(), version: old.version+1
    };
  }
  if(old?.status === 'Approved') problem('Approved reports are locked. Create a new order to amend clinical information.');
  const id = textValue(old?.id || input.id || `LF-${randomUUID()}`, 'Order ID', 80, true);
  if(!/^[A-Za-z0-9_-]+$/.test(id)) problem('Order ID may contain only letters, numbers, underscores, and hyphens.');
  const patientId = textValue(old?.patientId || input.patientId || `PT-${randomUUID().slice(0,8)}`, 'Patient ID', 80, true);
  const name = textValue(input.name, 'Patient name', 150, true);
  const age = numberValue(input.age, 'Age', 0, 120);
  const sex = ({ M: 'Male', F: 'Female' })[input.sex] || input.sex;
  if(!['Male','Female','Other'].includes(sex)) problem('Sex must be Male, Female, or Other.');
  const phone = textValue(input.phone, 'Phone', 30);
  if(phone && !/^[+()\d\s.-]{6,30}$/.test(phone)) problem('Enter a valid phone number.');
  const email = textValue(input.email, 'Email', 200);
  if(email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) problem('Enter a valid email address.');
  if(!Array.isArray(input.tests) || !input.tests.length || input.tests.length > Object.keys(TESTS).length) problem('Choose at least one test panel from the catalog.');
  const requestedTests = [...new Set(input.tests)];
  if(requestedTests.some(code => typeof code !== 'string' || !Object.hasOwn(TESTS, code))) problem('Unknown test panel.');
  const samePanels = old && requestedTests.length === old.tests.length && requestedTests.every(code => old.tests.includes(code));
  const tests = samePanels ? [...old.tests] : requestedTests;
  const amount = old && isDeepStrictEqual(tests,old.tests) ? old.amount : tests.reduce((sum, code) => sum + TESTS[code].price, 0);
  const paid = paymentValue(input.paid ?? 0, amount);
  const status = input.status ?? old?.status ?? 'Registered';
  if(!statusFlow.includes(status)) problem('Unknown sample status.');
  if(!old && status !== 'Registered') problem('New orders must start as Registered.');
  if(old) {
    const current = statusFlow.indexOf(old.status);
    const next = statusFlow.indexOf(status);
    const correction = old.status === 'Review' && status === 'Processing';
    if(next !== current && next !== current+1 && !correction) problem('Advance the sample one step at a time, or return a reviewed draft to processing for correction.');
    if(old.status !== 'Registered' && stringify(tests) !== stringify(old.tests)) problem('Test panels cannot change after sample collection.');
    if(paid < old.paid) problem('Refunds require a separate accounting process; amount paid cannot be reduced.');
  }
  const allowedKeys = new Set(tests.flatMap(code => TESTS[code].parameters));
  if(input.results != null && (typeof input.results !== 'object' || Array.isArray(input.results))) problem('Results must be an object.');
  const results = {};
  for(const [key, value] of Object.entries(input.results || {})) {
    if(!allowedKeys.has(key) || !Object.hasOwn(PARAMETERS, key)) problem(`Result ${key} is not part of this order.`);
    if(value === '' || value == null) continue;
    results[key] = numberValue(value, `Result ${PARAMETERS[key].name || key}`, 0, 1e9);
  }
  if(status === 'Review' || status === 'Approved') {
    const missing = [...allowedKeys].filter(key => results[key] == null);
    if(missing.length) problem('Complete all ordered results before submitting for review.', { missing });
  }
  const priority = input.priority ?? 'Routine';
  if(!['Routine','Urgent'].includes(priority)) problem('Priority must be Routine or Urgent.');
  const now = new Date().toISOString();
  const normalized = { id, patientId, name, age, sex, phone, email,
    category: textValue(input.category ?? 'Walk-in', 'Patient category', 60),
    referrer: textValue(input.referrer, 'Referrer', 150), tests, priority, status,
    createdAt: old?.createdAt || now, updatedAt: now, amount, paid,
    paymentMethod: textValue(input.paymentMethod ?? 'Cash', 'Payment method', 50),
    results, notes: textValue(input.notes, 'Notes', 4000), version: (old?.version || 0)+1,
    collectedAt: old?.collectedAt || (old?.status === 'Registered' && status === 'Collected' ? now : null),
    processingAt: old?.processingAt || (old?.status === 'Collected' && status === 'Processing' ? now : null),
    receivedAt: old?.receivedAt || (old?.status === 'Collected' && status === 'Processing' ? now : null),
    approvedAt: old?.approvedAt || (status === 'Approved' ? now : null),
    approvedBy: old?.approvedBy || null,
    reportSnapshot: old?.reportSnapshot || null,
    catalogSnapshot: old?.catalogSnapshot || null,
    registeredBy: old?.registeredBy || null, registeredByName: old?.registeredByName || null,
    resultEnteredBy: old?.resultEnteredBy || null, resultEnteredByName: old?.resultEnteredByName || null,
    resultEnteredAt: old?.resultEnteredAt || null, approvedByName: old?.approvedByName || null,
    specimen: old?.specimen || null, specimens: old?.specimens || [],
    criticalAcknowledgments: old?.criticalAcknowledgments || [], resultsRevision: old?.resultsRevision || 0
  };
  return normalized;
}
function throttleAuthentication(req) {
  const address = req.socket.remoteAddress || 'unknown';
  const entry = failures.get(address);
  if(entry && entry.count >= 10 && Date.now() - entry.at < 60_000) throw new ApiError(429,'Too many authentication attempts. Try again in a minute.');
  if(failures.size > 1000) failures.clear();
  failures.set(address,{count:entry && Date.now()-entry.at<60_000 ? entry.count+1 : 1,at:Date.now()});
}
async function authorize(req) {
  if(DEMO) return auth.listUsers().find(user=>user.username==='local-demo' && !user.disabled) || Promise.reject(new ApiError(401,'Evaluation user is unavailable.'));
  if(req.headers.authorization?.startsWith('Basic ')) throttleAuthentication(req);
  const user=await auth.authenticate(req);
  if(req.headers.authorization?.startsWith('Basic ')) failures.delete(req.socket.remoteAddress || 'unknown');
  return user;
}
function sessionPayload(user) { return {user,permissions:permissionsFor(user),independentReviewRequired:REQUIRE_INDEPENDENT_REVIEW}; }
function requirePermission(user,permission) {
  const current=user && auth.find(user.id);
  if(!current || current.disabled || current.role!==user.role)throw new ApiError(401,'Your account changed. Sign in again.');
  requireRolePermission(safeUser(current),permission);
}
function guardOrderUpdate(user,input,old) {
  const differs=key=>Object.hasOwn(input,key) && !isDeepStrictEqual(input[key],old[key]);
  if(['patientId','name','age','sex','phone','email','category','referrer','tests','priority'].some(differs)) requirePermission(user,'orders:update');
  if(['results','notes'].some(differs)) requirePermission(user,'results:write');
  if(['paid','paymentMethod'].some(differs)) requirePermission(user,'billing:write');
  if(differs('status')) {
    const permission=input.status==='Approved' ? 'reports:approve' : input.status==='Collected' ? 'samples:write' : input.status==='Processing' && old.status==='Collected' ? 'workflow:process' : 'results:write';
    requirePermission(user,permission);
  }
  if(!clinicalFields.some(differs) && !['paid','paymentMethod'].some(differs) && !['orders:update','results:write','billing:write','samples:write'].some(permission=>hasPermission(user,permission))) requirePermission(user,'orders:update');
}
function releaseCheck(order,user) {
  const assessment=assessRelease(order,qualityContext());if(enforceClinicalValidation&&!clinicalValidation.valid)assessment.blockers.push({code:'clinical-validation-required',message:clinicalValidation.detail+' Clinical release is disabled in production until the qualified laboratory records its validation.'});
  if(!hasPermission(user,'reports:approve')) assessment.blockers.push({code:'reviewer-not-authorized',message:'An authorized pathologist or administrator must release this report.'});
  if(REQUIRE_INDEPENDENT_REVIEW && (!order.resultEnteredBy || order.resultEnteredBy===user.id)) assessment.blockers.push({code:'independent-review-required',message:'An independent authorized reviewer must approve results entered by another identified staff member.'});
  return {...assessment,canRelease:assessment.blockers.length===0,independentReviewRequired:REQUIRE_INDEPENDENT_REVIEW};
}
function assertOrigin(req) {
  const origin = req.headers.origin;
  const expected = process.env.LAB_PUBLIC_ORIGIN || `http://${req.headers.host}`;
  if(!origin || origin !== expected || req.headers['sec-fetch-site'] === 'cross-site') throw new ApiError(403,'Write requests require a matching Origin header. Configure LAB_PUBLIC_ORIGIN behind HTTPS.');
  const contentType = req.headers['content-type'] || '';
  if(!contentType.startsWith('application/json')) throw new ApiError(415,'Use application/json.');
}
async function body(req,user) {
  const chunks = []; let length = 0;
  for await(const chunk of req) { length += chunk.length; if(length > 1024*1024) throw new ApiError(413,'Request is too large.'); chunks.push(chunk); }
  let parsed;try { parsed=JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new ApiError(400,'Invalid JSON.'); }
  if(user && !DEMO)auth.assertCurrent(req,user);
  return parsed;
}
function send(res, status, data) { res.writeHead(status, {'Content-Type':'application/json; charset=utf-8'}); res.end(stringify(data)); }
const contentTypes = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.svg':'image/svg+xml', '.png':'image/png', '.ico':'image/x-icon', '.json':'application/json', '.zip':'application/zip' };
const platformRoute=createPlatformRoutes({db,transaction,audit,getOrder,allOrders,normalize,requirePermission,assertOrigin,body,ApiError,root:ROOT,dataDir:DATA_DIR});
const server = http.createServer(async (req,res) => {
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','SAMEORIGIN');
  res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
  try {
    const url = new URL(req.url, 'http://localhost');
    const path = url.pathname;
    if(path === '/api/health' && req.method === 'GET') return send(res,200,{ok:true,storage:'sqlite',mode:DEMO?'evaluation':'self-hosted',version:'1.3.0'});
    if(path === '/api/login' && req.method === 'POST') {
      assertOrigin(req); throttleAuthentication(req); const input=await body(req);
      if(!input || typeof input!=='object' || Array.isArray(input)) problem('Expected username and password.');
      const session=await auth.login(input.username,input.password);
      failures.delete(req.socket.remoteAddress || 'unknown');
      res.setHeader('Set-Cookie',auth.cookie(session.token));
      return send(res,200,sessionPayload(session.user));
    }
    const user = path.startsWith('/api/') ? await authorize(req) : null;
    const actor = user?.id;
    if(path === '/api/session' && req.method === 'GET') return send(res,200,sessionPayload(user));
    if(path === '/api/logout' && req.method === 'POST') {
      assertOrigin(req); await body(req,user); auth.logout(req,user); res.setHeader('Set-Cookie',auth.clearCookie()); return send(res,200,{ok:true});
    }
    if(path === '/api/users' && req.method === 'GET') {requirePermission(user,'users:manage');return send(res,200,{users:auth.listUsers(),roles:ROLES});}
    if(path === '/api/users' && req.method === 'POST') {
      requirePermission(user,'users:manage');assertOrigin(req);const input=await body(req,user);return send(res,201,{user:await auth.createUser(input,actor)});
    }
    if(path.startsWith('/api/users/') && req.method === 'PATCH') {
      requirePermission(user,'users:manage');assertOrigin(req);let id;try{id=decodeURIComponent(path.slice('/api/users/'.length));}catch{throw new ApiError(400,'Invalid staff path.');}
      return send(res,200,{user:await auth.updateUser(id,await body(req,user),actor)});
    }
    if(path === '/api/audit' && req.method === 'GET') {
      requirePermission(user,'audit:read');
      const limit=Math.max(1,Math.min(500,Number.parseInt(url.searchParams.get('limit') || '100',10) || 100));
      const events=db.prepare('SELECT *,order_id AS orderId FROM audit ORDER BY id DESC LIMIT ?').all(limit);
      return send(res,200,{events,authEvents:auth.authEvents(limit)});
    }
    if(path === '/api/quality-controls' && req.method === 'GET') {requirePermission(user,'quality:manage');return send(res,200,{controls:getQualityControls()});}
    if(path.startsWith('/api/quality-controls/') && req.method === 'PUT') {
      requirePermission(user,'quality:manage');assertOrigin(req);let code;try{code=decodeURIComponent(path.slice('/api/quality-controls/'.length));}catch{throw new ApiError(400,'Invalid panel path.');}
      if(!Object.hasOwn(TESTS,code))problem('Unknown test panel.');const input=await body(req,user);
      if(!input || typeof input!=='object' || Array.isArray(input))problem('Expected QC evidence.');
      for(const key of Object.keys(input))if(!['expectedVersion','status','runId','evidence','acceptedAt','expiresAt','reason'].includes(key))problem(`Unknown QC field: ${key}.`);
      if(!['accepted','rejected'].includes(input.status))problem('QC status must be accepted or rejected.');
      const runId=textValue(input.runId,'QC run ID',100,true),evidence=textValue(input.evidence,'QC evidence',2000,true),reason=textValue(input.reason,'QC decision reason',1000,true);
      let acceptedAt=null,expiresAt=null;
      if(input.status==='accepted') {
        if(typeof input.acceptedAt!=='string' || typeof input.expiresAt!=='string')problem('Accepted QC requires recorded and expiry times.');
        const recorded=Date.parse(input.acceptedAt),expires=Date.parse(input.expiresAt);
        if(!Number.isFinite(recorded) || !Number.isFinite(expires) || recorded>Date.now()+60_000 || expires<=recorded)problem('QC requires a valid acceptance time and a later expiry time.');
        acceptedAt=new Date(recorded).toISOString();expiresAt=new Date(expires).toISOString();
      }
      const control=transaction(()=>{
        const row=db.prepare('SELECT payload,version FROM quality_controls WHERE test_code=?').get(code),old=row?JSON.parse(row.payload):null;
        if(input.expectedVersion!==(old?.version||0))throw new ApiError(409,'QC evidence changed. Refresh and try again.');
        const next={testCode:code,status:input.status,runId,evidence,reason,acceptedAt,expiresAt,recordedAt:new Date().toISOString(),recordedBy:actor,recordedByName:user.displayName,version:(old?.version||0)+1};
        db.prepare('INSERT INTO quality_controls (test_code,payload,version) VALUES (?,?,?) ON CONFLICT(test_code) DO UPDATE SET payload=excluded.payload,version=excluded.version').run(code,stringify(next),next.version);
        audit(null,'quality-control',`${code}: QC evidence recorded as ${next.status}`,actor,old,next);return next;
      });
      return send(res,200,{control});
    }
    if(path === '/api/state' && req.method === 'GET') {
      requirePermission(user,'orders:read');
      const activity = db.prepare('SELECT id, order_id AS orderId, type, message, actor, at FROM audit ORDER BY id DESC LIMIT 100').all().map(item => ({...item,timestamp:item.at}));
      return send(res,200,{orders:recentOrders(),stats:workspaceStats(),windowLimit:250,activity,settings:getSettings(),revision:activity[0]?.id || 0,...sessionPayload(user)});
    }
    if(path === '/api/backup' && req.method === 'GET') {
      requirePermission(user,'backup:read');
      const exported = transaction(() => {
        const data = { format:'labflow-backup-v1',exportedAt:new Date().toISOString(),orders:allOrders(),settings:getSettings(),audit:db.prepare('SELECT * FROM audit ORDER BY id').all() };
        audit(null,'backup','Workspace backup exported',actor,null,{recordCount:data.orders.length});
        return data;
      });
      res.setHeader('Content-Disposition',`attachment; filename="labflow-backup-${new Date().toISOString().slice(0,10)}.json"`);
      return send(res,200,exported);
    }
    if(path === '/api/orders' && req.method === 'GET') {
      requirePermission(user,'orders:read');const q=(url.searchParams.get('q')||'').trim();if(q.length<2||q.length>150)throw new ApiError(422,'Search with 2–150 characters.');
      const limit=100,pattern='%'+q.replace(/[\\%_]/g,'\\$&')+'%';const rows=db.prepare("SELECT payload FROM orders WHERE json_extract(payload,'$.name') LIKE ? ESCAPE '\\' OR json_extract(payload,'$.id') LIKE ? ESCAPE '\\' OR json_extract(payload,'$.patientId') LIKE ? ESCAPE '\\' OR json_extract(payload,'$.phone') LIKE ? ESCAPE '\\' OR json_extract(payload,'$.specimens') LIKE ? ESCAPE '\\' ORDER BY rowid DESC LIMIT ?").all(pattern,pattern,pattern,pattern,pattern,limit+1);return send(res,200,{orders:rows.slice(0,limit).map(r=>JSON.parse(r.payload)),hasMore:rows.length>limit,limit});
    }
    if(path === '/api/orders' && req.method === 'POST') {
      requirePermission(user,'orders:create');
      assertOrigin(req); const input = await body(req,user);
      const order = transaction(() => {
        const fresh = normalize(input,null);
        if(Object.keys(fresh.results).length || fresh.notes) requirePermission(user,'results:write');
        if(fresh.paid>0) requirePermission(user,'billing:write');
        fresh.registeredBy=actor; fresh.registeredByName=user.displayName;
        fresh.specimens=createSpecimens(fresh,{catalog:TESTS});
        if(Object.keys(fresh.results).length || fresh.notes) {fresh.resultEnteredBy=actor;fresh.resultEnteredByName=user.displayName;fresh.resultEnteredAt=new Date().toISOString();fresh.resultsRevision=1;}
        if(getOrder(fresh.id)) throw new ApiError(409,'An order with this ID already exists.');
        db.prepare('INSERT INTO orders (id,payload,version) VALUES (?,?,?)').run(fresh.id,stringify(fresh),fresh.version);
        audit(fresh.id,'registration',`${fresh.name} registered · ${fresh.id}`,actor,null,fresh);
        return fresh;
      });
      return send(res,201,{order});
    }
    if(path.startsWith('/api/orders/') && req.method === 'PUT') {
      assertOrigin(req); const input = await body(req,user);
      if(!input || typeof input !== 'object' || Array.isArray(input)) problem('Expected an order object.');
      let id;
      try { id = decodeURIComponent(path.slice('/api/orders/'.length)); } catch { throw new ApiError(400,'Invalid order path.'); }
      const order = transaction(() => {
        const old = getOrder(id); if(!old) throw new ApiError(404,'Order not found.');
        if(typeof input.expectedVersion !== 'number' || input.expectedVersion !== old.version) throw new ApiError(409,'This order changed on another device. Refresh and try again.',{currentVersion:old.version});
        guardOrderUpdate(user,input,old);
        let next = normalize(input,old);
        guardOrderUpdate(user,next,old);
        if(old.status==='Registered' && !isDeepStrictEqual(next.tests,old.tests)) {next.specimens=createSpecimens(next,{catalog:TESTS});next.specimen=null;}
        if(next.status!==old.status && ((old.status==='Registered' && next.status==='Collected') || (old.status==='Collected' && next.status==='Processing'))) {
          const target=next.status;
          next=applyWorkflowSpecimens({...next,status:old.status},target,{catalog:TESTS,actor:user,now:new Date()});
          next.status=target;
        }
        const resultsChanged=!isDeepStrictEqual(next.results,old.results);
        if(resultsChanged) next.resultsRevision=(old.resultsRevision || 0)+1;
        if(resultsChanged || next.notes!==old.notes || (next.status==='Review' && old.status!=='Review' && !next.resultEnteredBy)) {
          next.resultEnteredBy=actor;next.resultEnteredByName=user.displayName;next.resultEnteredAt=new Date().toISOString();
        }
        if(next.status === 'Approved' && old.status !== 'Approved') {
          const assessment=releaseCheck({...next,status:'Review'},user);
          if(!assessment.canRelease) throw new ApiError(assessment.blockers.some(item=>item.code==='independent-review-required')?403:422,'Report release checks have not passed.',assessment);
          next.approvedBy = actor;
          next.approvedByName = user.displayName;
          next.reportSnapshot = getSettings();
          next.catalogSnapshot = catalogSnapshot(next.tests);
          next.releaseAssessment={checkedAt:new Date().toISOString(),checkedBy:actor,warnings:assessment.warnings};
        }
        const changed = db.prepare('UPDATE orders SET payload=?,version=? WHERE id=? AND version=?').run(stringify(next),next.version,id,old.version);
        if(changed.changes !== 1) throw new ApiError(409,'This order changed on another device. Refresh and try again.');
        const correction = old.status === 'Review' && next.status === 'Processing';
        const type = correction ? 'review' : next.status !== old.status ? 'sample' : next.paid !== old.paid ? 'billing' : 'results';
        const message = correction ? `${next.id} returned to processing for correction` : next.status !== old.status ? `${next.id} moved to ${next.status.toLowerCase()}` : next.paid !== old.paid ? `Payment recorded · ${next.id}` : `Record updated · ${next.id}`;
        audit(id,type,message,actor,old,next);
        return next;
      });
      return send(res,200,{order});
    }
    const qualityMatch=path.match(/^\/api\/orders\/([^/]+)\/(release-check|specimen|critical-acknowledgments|amend)$/);
    if(qualityMatch) {
      let id;try{id=decodeURIComponent(qualityMatch[1]);}catch{throw new ApiError(400,'Invalid order path.');}
      const operation=qualityMatch[2];
      if(operation==='amend') {
        if(req.method!=='POST') throw new ApiError(405,'Method not allowed.');
        assertOrigin(req); const input=await body(req,user);
        requirePermission(user,'results:write');
        if(!input || typeof input!=='object' || Array.isArray(input)) problem('Expected amendment data.');
        const reason=textValue(input.reason,'Amendment reason',1000,true);
        const amendedOrder=transaction(()=>{
          const old=getOrder(id);if(!old) throw new ApiError(404,'Order not found.');
          if(old.status!=='Approved') problem('Only approved reports can be amended.');
          if(typeof input.expectedVersion==='number' && input.expectedVersion!==old.version){
            throw new ApiError(409,'This order changed on another device. Refresh and try again.',{currentVersion:old.version});
          }
          const count=(old.amendmentCount||0)+1;
          const amendId=`${old.id}-CORR${count}`;
          const now=new Date().toISOString();
          const nextOrder={
            ...structuredClone(old),
            id:amendId,
            originalOrderId:old.id,
            amendmentReason:reason,
            amendedAt:now,
            amendedBy:actor,
            amendedByName:user.displayName,
            status:'Processing',
            approvedAt:null,
            approvedBy:null,
            approvedByName:null,
            reportSnapshot:null,
            catalogSnapshot:null,
            releaseAssessment:null,
            resultsRevision:(old.resultsRevision||1)+1,
            version:1,
            createdAt:old.createdAt,
            updatedAt:now,
            resultEnteredBy:actor,
            resultEnteredByName:user.displayName,
            resultEnteredAt:now
          };
          const updatedOld={
            ...old,
            amendedByOrder:amendId,
            amendmentCount:count,
            version:old.version+1,
            updatedAt:now
          };
          db.prepare('UPDATE orders SET payload=?,version=? WHERE id=? AND version=?').run(stringify(updatedOld),updatedOld.version,old.id,old.version);
          db.prepare('INSERT INTO orders (id,payload,version) VALUES (?,?,?)').run(amendId,stringify(nextOrder),nextOrder.version);
          audit(old.id,'amendment',`Report amended: created ${amendId} (${reason})`,actor,old,updatedOld);
          audit(amendId,'amendment',`Amended report initialized from ${old.id} (${reason})`,actor,null,nextOrder);
          return nextOrder;
        });
        return send(res,201,{order:amendedOrder});
      }
      if(operation==='release-check' && req.method==='GET') {
        requirePermission(user,'orders:read');const order=getOrder(id);if(!order)throw new ApiError(404,'Order not found.');
        return send(res,200,{orderId:id,...releaseCheck(order,user)});
      }
      if(req.method==='POST' && operation!=='release-check') {
        assertOrigin(req);const input=await body(req,user);if(!input || typeof input!=='object' || Array.isArray(input))problem('Expected a quality action object.');
        requirePermission(user,operation==='specimen'?'samples:write':'reports:approve');
        if(operation==='specimen' && input.action==='receive')requirePermission(user,'workflow:process');
        const order=transaction(()=>{
          const old=getOrder(id);if(!old)throw new ApiError(404,'Order not found.');
          if(input.expectedVersion!==old.version)throw new ApiError(409,'This order changed on another device. Refresh and try again.',{currentVersion:old.version});
          const next=operation==='specimen'?validateSpecimenAction(old,input.action,input,user,{catalog:TESTS,parameters:PARAMETERS}):acknowledgeCritical(old,input,user,{catalog:TESTS,parameters:PARAMETERS});
          next.version=old.version+1;next.updatedAt=new Date().toISOString();
          if(operation==='specimen' && input.action==='recollect'){next.resultEnteredBy=null;next.resultEnteredByName=null;next.resultEnteredAt=null;}
          const changed=db.prepare('UPDATE orders SET payload=?,version=? WHERE id=? AND version=?').run(stringify(next),next.version,id,old.version);
          if(changed.changes!==1)throw new ApiError(409,'This order changed on another device. Refresh and try again.');
          audit(id,operation==='specimen'?'specimen':'critical-notification',operation==='specimen'?`${id}: specimen ${input.action} recorded`:`${id}: critical notification recorded`,actor,old,next);
          return next;
        });
        return send(res,200,{order});
      }
      throw new ApiError(405,'Method not allowed.');
    }
    if(path === '/api/settings' && req.method === 'PUT') {
      requirePermission(user,'settings:write');
      assertOrigin(req); const input = await body(req,user);
      if(!input || typeof input !== 'object' || Array.isArray(input)) problem('Expected settings.');
      for(const key of Object.keys(input)) if(!Object.hasOwn(DEFAULT_SETTINGS,key)) problem(`Unknown laboratory setting: ${key}.`);
      const settings = transaction(() => {
        const old=getSettings(), next={...old};
        for(const key of Object.keys(DEFAULT_SETTINGS)) {
          if(Object.hasOwn(input,key)) {
            if(typeof input[key] !== 'string') problem(`${key} must be text.`);
            next[key] = textValue(input[key],key,SETTINGS_LIMITS[key],key==='labName');
          }
        }
        if(!['classic','sahara','minimal'].includes(next.reportTemplate)) problem('Report template must be classic, sahara, or minimal.');
        db.prepare('INSERT INTO settings (id,payload) VALUES (1,?) ON CONFLICT(id) DO UPDATE SET payload=excluded.payload').run(stringify(next));
        audit(null,'settings','Laboratory settings updated',actor,old,next);
        return next;
      });
      return send(res,200,{settings});
    }
    if(path.startsWith('/api/')){const extra=await platformRoute(req,url,user);if(extra)return send(res,extra.status,extra.data);throw new ApiError(404,'API route not found.');}
    if(!['GET','HEAD'].includes(req.method)) throw new ApiError(405,'Method not allowed.');
    let requested;
    try { requested = decodeURIComponent(path); } catch { throw new ApiError(400,'Invalid path.'); }
    const dist = resolve(ROOT,'dist');
    const file = resolve(dist,`.${requested === '/' ? '/index.html' : requested}`);
    if(!file.startsWith(dist+sep)) throw new ApiError(403,'Forbidden path.');
    let metadata;
    try { metadata = await stat(file); } catch { throw new ApiError(404,'File not found.'); }
    if(!metadata.isFile()) throw new ApiError(404,'File not found.');
    const bytes = await readFile(file);
    res.writeHead(200,{'Content-Type':contentTypes[extname(file)] || 'application/octet-stream','Content-Length':bytes.length});
    res.end(req.method==='HEAD'?undefined:bytes);
  } catch(error) {
    if(res.headersSent) { res.end(); return; }
    if(!error.status) console.error('Request failed:',error.message);
    send(res,error.status || 500,{error:error.status?error.message:'Internal server error.',...(error.details?{details:error.details}:{})});
  }
});
server.listen(PORT, HOST, () => console.log(`Labflow ${DEMO?'local evaluation':'self-hosted'} listening on http://${HOST}:${PORT}`));
function shutdown() { server.close(() => { db.close(); process.exit(0); }); setTimeout(()=>process.exit(1),5000).unref(); }
process.on('SIGTERM',shutdown); process.on('SIGINT',shutdown);

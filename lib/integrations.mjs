import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

const HEADERS = ['order_id','test_code','parameter_code','value','unit','instrument_id','run_id'];
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 20_000;
const own = (object,key) => object != null && Object.hasOwn(object,key);
const sha256 = value => createHash('sha256').update(value,'utf8').digest('hex');
const plainObject = value => value && typeof value === 'object' && !Array.isArray(value);

export class IntegrationError extends Error {
  constructor(code,message,errors=[]) {
    super(message); this.name='IntegrationError'; this.code=code; this.errors=errors; this.status=422;
  }
}
function fail(code,message,errors=[]) { throw new IntegrationError(code,message,errors); }
function parserError(code,message,lineNumber) { fail(code,message,[{lineNumber,code,message}]); }
function identifier(value,label,max=128) {
  if(typeof value!=='string'||!value.trim()||value.length>max||/[\u0000-\u001f\u007f]/.test(value)) fail('CONFIG_INVALID',`${label} must be a nonempty identifier of at most ${max} characters.`);
  return value.trim();
}
function numeric(value) {
  if((typeof value!=='string'&&typeof value!=='number')||(typeof value==='string'&&!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim()))) return null;
  const result=Number(value);
  return Number.isFinite(result)&&Math.abs(result)<=1e9?result:null;
}
function stable(value) {
  if(value===null||typeof value!=='object') return JSON.stringify(value);
  if(Array.isArray(value)) return `[${value.map(item=>stable(item)??'null').join(',')}]`;
  return `{${Object.keys(value).filter(key=>value[key]!==undefined).sort().map(key=>`${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`;
}

/** Parse RFC4180-style CSV without doing any patient-record mutation. */
export function parseAnalyzerCSV(csv) {
  if(typeof csv!=='string') fail('CSV_TYPE','Analyzer CSV must be UTF-8 text.');
  if(Buffer.byteLength(csv,'utf8')>MAX_BYTES) fail('CSV_TOO_LARGE','Analyzer CSV exceeds the 5 MiB limit.');
  if(csv.includes('\0')) fail('CSV_CONTROL','Analyzer CSV contains a null byte.');
  const input=csv.charCodeAt(0)===0xfeff?csv.slice(1):csv;
  const records=[];
  let fields=[],field='',mode='start',line=1,rowLine=1,active=false;
  const endField=()=>{fields.push(field);field='';mode='start';};
  const endRow=()=>{
    endField();
    if(!(fields.length===1&&fields[0]==='')) records.push({lineNumber:rowLine,fields});
    if(records.length>MAX_ROWS+1) parserError('CSV_TOO_MANY_ROWS','Analyzer CSV exceeds 20,000 data rows.',rowLine);
    fields=[];active=false;
  };
  for(let index=0;index<input.length;index++) {
    const character=input[index];
    if(mode==='quoted') {
      if(character==='"') {
        if(input[index+1]==='"'){field+='"';index++;}else mode='closed';
      } else {
        field+=character;
        if(character==='\r'){if(input[index+1]==='\n'){field+='\n';index++;}line++;}
        else if(character==='\n')line++;
      }
      if(field.length>65_536)parserError('CSV_FIELD_TOO_LARGE','A CSV field exceeds 65,536 characters.',line);
      continue;
    }
    if(character===','){endField();active=true;continue;}
    if(character==='\r'||character==='\n') {
      endRow();if(character==='\r'&&input[index+1]==='\n')index++;line++;rowLine=line;continue;
    }
    if(mode==='closed') {
      if(character===' '||character==='\t')continue;
      parserError('CSV_AFTER_QUOTE','Only a delimiter or newline may follow a quoted CSV field.',line);
    }
    if(character==='"') {
      if(mode!=='start')parserError('CSV_QUOTE','A quote appeared inside an unquoted CSV field.',line);
      mode='quoted';active=true;
    } else {field+=character;mode='unquoted';active=true;}
    if(field.length>65_536)parserError('CSV_FIELD_TOO_LARGE','A CSV field exceeds 65,536 characters.',line);
  }
  if(mode==='quoted')parserError('CSV_UNTERMINATED','A quoted CSV field was not closed.',rowLine);
  if(active||fields.length||field)endRow();
  if(!records.length)fail('CSV_EMPTY','Analyzer CSV has no header or data.');
  const headerRecord=records.shift();
  const headers=headerRecord.fields.map(value=>value.trim().toLowerCase());
  if(headers.length!==HEADERS.length||new Set(headers).size!==HEADERS.length||HEADERS.some(key=>!headers.includes(key))) {
    parserError('CSV_HEADER',`Use exactly these CSV columns: ${HEADERS.join(',')}.`,headerRecord.lineNumber);
  }
  if(!records.length)fail('CSV_EMPTY','Analyzer CSV has no measurement rows.');
  return records.map(record=>{
    if(record.fields.length!==headers.length)parserError('CSV_COLUMNS',`Expected${headers.length} fields but found${record.fields.length}.`,record.lineNumber);
    return Object.fromEntries([['lineNumber',record.lineNumber],...headers.map((header,index)=>[header,record.fields[index]])]);
  });
}

function orderMap(orders) {
  if(orders instanceof Map)return new Map(orders);
  if(Array.isArray(orders)) {
    const mapped=new Map();
    for(const order of orders) {
      if(!plainObject(order)||typeof order.id!=='string'||mapped.has(order.id))fail('CONFIG_INVALID','Order lookup has malformed or duplicate order IDs.');
      mapped.set(order.id,order);
    }
    return mapped;
  }
  if(plainObject(orders))return new Map(Object.entries(orders));
  fail('CONFIG_INVALID','Pass the current server-owned order records.');
}
function seenEntry(seenImports,key) {
  if(seenImports==null)return null;
  if(seenImports instanceof Map)return seenImports.get(key)||null;
  if(Array.isArray(seenImports))return seenImports.find(entry=>entry?.idempotencyKey===key)||null;
  if(plainObject(seenImports))return own(seenImports,key)?seenImports[key]:null;
  fail('CONFIG_INVALID','seenImports must contain persisted import keys and checksums.');
}
function validateInstrument(instrument,catalog,parameters) {
  if(!plainObject(instrument)||instrument.enabled!==true)fail('INSTRUMENT_DISABLED','The server must enable and configure this instrument before import.');
  const id=identifier(instrument.id,'Instrument ID');
  if(!plainObject(catalog)||!plainObject(parameters)||!plainObject(instrument.mappings)||!Object.keys(instrument.mappings).length)fail('CONFIG_INVALID','A server-owned catalog and explicit instrument mappings are required.');
  for(const [externalTest,mapping] of Object.entries(instrument.mappings)) {
    identifier(externalTest,'External test code');
    if(!plainObject(mapping)||!own(catalog,mapping.testCode)||!Array.isArray(catalog[mapping.testCode]?.parameters)||!plainObject(mapping.parameters))fail('CONFIG_INVALID',`Invalid instrument test mapping: ${externalTest}.`);
    for(const [externalParameter,parameter]of Object.entries(mapping.parameters)) {
      identifier(externalParameter,'External parameter code');
      if(!plainObject(parameter)||!own(parameters,parameter.parameterCode)||!catalog[mapping.testCode].parameters.includes(parameter.parameterCode)||parameter.unit!==parameters[parameter.parameterCode].unit)fail('CONFIG_INVALID',`Invalid instrument analyte mapping: ${externalTest}/${externalParameter}.`);
      if(parameter.conversion!=null) {
        const conversion=parameter.conversion;
        if(!plainObject(conversion)||typeof conversion.fromUnit!=='string'||!conversion.fromUnit||conversion.toUnit!==parameter.unit||typeof conversion.factor!=='number'||!Number.isFinite(conversion.factor)||conversion.factor<=0||(conversion.offset!=null&&(typeof conversion.offset!=='number'||!Number.isFinite(conversion.offset))))fail('CONFIG_INVALID',`Invalid unit conversion: ${externalTest}/${externalParameter}.`);
      }
    }
  }
  return id;
}

/**
 * Validate one instrument/run atomically and return draft proposals only.
 * The caller must commit changes, audit/provenance, and seenImports in one DB transaction.
 */
export function validateAnalyzerImport({csv,instrument,orders,catalog,parameters,seenImports}={}) {
  const instrumentId=validateInstrument(instrument,catalog,parameters);
  const rows=parseAnalyzerCSV(csv);
  const checksum=sha256(csv);
  const errors=[];
  const error=(row,code,message)=>errors.push({lineNumber:row.lineNumber,code,message,orderId:row.order_id.trim()});
  const runId=rows[0].run_id.trim();
  if(!runId||runId.length>128||/[\u0000-\u001f\u007f]/.test(runId))fail('RUN_ID_INVALID','A valid run_id of at most 128 characters is required.');
  for(const row of rows) {
    if(row.instrument_id.trim()!==instrumentId)error(row,'INSTRUMENT_MISMATCH','The CSV instrument ID does not match the configured instrument.');
    if(row.run_id.trim()!==runId)error(row,'MIXED_RUNS','Import one run_id per batch.');
  }
  if(errors.length)fail('ANALYZER_IMPORT_INVALID','No results imported: the batch identity is invalid.',errors);
  const idempotencyKey=`analyzer:${sha256(JSON.stringify([instrumentId,runId]))}`;
  const seen=seenEntry(seenImports,idempotencyKey);
  if(seen) {
    const priorChecksum=typeof seen==='string'?seen:seen.checksum;
    if(typeof priorChecksum!=='string'||!/^[a-f0-9]{64}$/.test(priorChecksum))fail('CONFIG_INVALID','Stored import identity has no valid checksum.');
    if(priorChecksum!==checksum)fail('IMPORT_REPLAY_CONFLICT','This instrument/run was already imported with a different payload.');
    return {idempotencyKey,checksum,changes:[],errors:[],duplicate:true,instrumentId,runId};
  }
  const lookup=orderMap(orders),changes=new Map(),measurements=new Map();
  for(const row of rows) {
    const orderId=row.order_id.trim(),externalTest=row.test_code.trim(),externalParameter=row.parameter_code.trim(),rawValue=row.value.trim(),rawUnit=row.unit.trim();
    if(!/^[A-Za-z0-9_-]{1,80}$/.test(orderId)){error(row,'ORDER_ID_INVALID','The order/sample ID is invalid.');continue;}
    const order=lookup.get(orderId);
    if(!order||order.id!==orderId){error(row,'ORDER_NOT_FOUND','No current patient order/sample matches this order_id.');continue;}
    if(order.status!=='Processing'){error(row,'ORDER_STATE','Analyzer results can only be proposed for an order in Processing.');continue;}
    if(!Number.isInteger(order.version)||order.version<1){error(row,'ORDER_VERSION','The current order has no valid version.');continue;}
    const mapping=own(instrument.mappings,externalTest)?instrument.mappings[externalTest]:null;
    if(!mapping){error(row,'TEST_UNMAPPED','This instrument test_code has no configured mapping.');continue;}
    const parameterMapping=own(mapping.parameters,externalParameter)?mapping.parameters[externalParameter]:null;
    if(!parameterMapping){error(row,'PARAMETER_UNMAPPED','This instrument parameter_code has no configured mapping.');continue;}
    const testCode=mapping.testCode,parameterCode=parameterMapping.parameterCode;
    if(!Array.isArray(order.tests)||!order.tests.includes(testCode)){error(row,'TEST_NOT_ORDERED','The mapped panel is not ordered for this patient/sample.');continue;}
    let value=numeric(rawValue),conversion=null;
    if(value===null){error(row,'VALUE_INVALID','The result must be a finite decimal number between −1e9 and 1e9.');continue;}
    if(rawUnit!==parameterMapping.unit) {
      const allowed=parameterMapping.conversion;
      if(!allowed||allowed.fromUnit!==rawUnit){error(row,'UNIT_MISMATCH','The result unit is not an exact configured unit or conversion.');continue;}
      conversion={fromUnit:allowed.fromUnit,toUnit:allowed.toUnit,factor:allowed.factor,offset:allowed.offset??0};
      value=value*conversion.factor+conversion.offset;
      if(!Number.isFinite(value)||Math.abs(value)>1e9){error(row,'CONVERSION_INVALID','The configured conversion produces an invalid result.');continue;}
    }
    const target=JSON.stringify([orderId,parameterCode]);
    const prior=measurements.get(target);
    if(prior!=null&&prior!==value){error(row,'DUPLICATE_CONFLICT','Two rows propose different values for the same order/analyte.');continue;}
    measurements.set(target,value);
    if(own(order.results,parameterCode)&&order.results[parameterCode]!==''&&order.results[parameterCode]!=null&&numeric(order.results[parameterCode])!==value){error(row,'RESULT_CONFLICT','A different draft result already exists; resolve it through an audited review.');continue;}
    if(!changes.has(orderId))changes.set(orderId,{orderId,expectedVersion:order.version,status:'Processing',requiresReview:true,results:{...(order.results||{})},provenance:{source:'analyzer_csv',instrumentId,runId,checksum,measurements:[]}});
    const change=changes.get(orderId);
    change.results[parameterCode]=value;
    change.provenance.measurements.push({lineNumber:row.lineNumber,sourceTestCode:externalTest,sourceParameterCode:externalParameter,testCode,parameterCode,rawValue:row.value,rawUnit:row.unit,sourceInstrumentId:row.instrument_id,sourceRunId:row.run_id,value,unit:parameterMapping.unit,conversion});
  }
  if(errors.length)fail('ANALYZER_IMPORT_INVALID','No results imported: the entire batch failed validation.',errors);
  return {idempotencyKey,checksum,changes:[...changes.values()],errors:[],duplicate:false,instrumentId,runId};
}

function utcDate(value) {
  if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(value))return null;
  const parsed=new Date(value);
  return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,19)===value.slice(0,19)?parsed:null;
}

function recipient(channel,destination) {
  if(typeof destination!=='string'||destination.length>254||/[\r\n\0]/.test(destination))fail('RECIPIENT_INVALID','Use a single valid recipient address.');
  const value=destination.trim();
  if(channel==='whatsapp') {
    if(!/^\+[1-9]\d{7,14}$/.test(value))fail('RECIPIENT_INVALID','WhatsApp recipients must use E.164 format, for example +919876543210.');
    return value;
  }
  if(channel==='email') {
    if(!/^[A-Z0-9.!#$%&'*+/=?^_`{|}~-]+@(?:[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?\.)+[A-Z]{2,63}$/i.test(value))fail('RECIPIENT_INVALID','Use one plain email address.');
    const [local,domain]=value.split('@');
    if(local.length>64||local.startsWith('.')||local.endsWith('.')||local.includes('..'))fail('RECIPIENT_INVALID','The email recipient is invalid.');
    return `${local}@${domain.toLowerCase()}`;
  }
  fail('CHANNEL_INVALID','Report delivery supports email or whatsapp intents only.');
}

/** Return an unsent delivery proposal. No API call, email or WhatsApp message occurs. */
export function createDeliveryIntent(order,channel,destination,consent) {
  if(!plainObject(order)||order.status!=='Approved'||typeof order.id!=='string'||!order.id||typeof order.patientId!=='string'||!order.patientId)fail('REPORT_NOT_APPROVED','Only an approved patient report can be queued.');
  const approvedAt=utcDate(order.approvedAt);
  if(!approvedAt)fail('REPORT_APPROVAL_INVALID','The report approval timestamp must be recorded before delivery.');
  const normalized=recipient(channel,destination);
  if(!plainObject(consent)||consent.granted!==true||consent.scope!=='report_delivery'||consent.channel!==channel||consent.patientId!==order.patientId||typeof consent.recordedBy!=='string'||!consent.recordedBy.trim())fail('CONSENT_REQUIRED','Auditable consent for this patient, channel and report-delivery purpose is required.');
  if(recipient(channel,consent.destination)!==normalized)fail('CONSENT_RECIPIENT_MISMATCH','Consent does not authorize this recipient.');
  const recordedAt=utcDate(consent.recordedAt),now=Date.now();
  if(!recordedAt||recordedAt.getTime()>now+300_000)fail('CONSENT_TIMESTAMP_INVALID','Consent needs a valid recorded timestamp that is not in the future.');
  if(consent.revokedAt)fail('CONSENT_REVOKED','This report-delivery consent has been revoked.');
  if(consent.expiresAt&&(!utcDate(consent.expiresAt)||utcDate(consent.expiresAt).getTime()<=now))fail('CONSENT_EXPIRED','This report-delivery consent has expired.');
  const report={id:order.id,patientId:order.patientId,name:order.name,age:order.age,sex:order.sex,referrer:order.referrer,createdAt:order.createdAt,collectedAt:order.collectedAt,receivedAt:order.receivedAt,tests:order.tests,results:order.results,notes:order.notes,approvedAt:order.approvedAt,approvedBy:order.approvedBy,reportRevision:order.reportRevision,reportSnapshot:order.reportSnapshot,catalogSnapshot:order.catalogSnapshot};
  const reportChecksum=sha256(stable(report));
  const idempotencyKey=`delivery:${sha256(stable({reportChecksum,channel,destination:normalized}))}`;
  return {id:idempotencyKey,idempotencyKey,orderId:order.id,patientId:order.patientId,channel,destination:normalized,status:'queued',attempts:0,providerMessageId:null,reportChecksum,approvedAt:order.approvedAt,createdAt:new Date(now).toISOString(),consent:{granted:true,scope:'report_delivery',channel,destination:normalized,patientId:order.patientId,recordedAt:recordedAt.toISOString(),recordedBy:consent.recordedBy.trim(),...(consent.expiresAt?{expiresAt:new Date(consent.expiresAt).toISOString()}: {})}};
}

/** Generate an HMAC-SHA256 signed, expiring report access token for secure patient delivery links. */
export function generateReportAccessToken(orderId, secret, expiresInSeconds = 72 * 3600, now = Date.now()) {
  if (!orderId || typeof orderId !== 'string') fail('CONFIG_INVALID', 'A valid orderId is required for report link generation.');
  if (!secret || typeof secret !== 'string' || secret.length < 16) fail('CONFIG_INVALID', 'A secret of at least 16 characters is required to sign report links.');
  const expiresAt = now + expiresInSeconds * 1000;
  const payload = Buffer.from(JSON.stringify({ orderId, exp: expiresAt })).toString('base64url');
  const sig = createHmac('sha256', secret).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

/** Verify signature and expiry of a report access token. Returns payload or null. */
export function verifyReportAccessToken(token, secret, now = Date.now()) {
  if (typeof token !== 'string' || !token.includes('.') || !secret || typeof secret !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [payloadStr, sig] = parts;
  const expectedSig = createHmac('sha256', secret).update(payloadStr).digest('base64url');
  if (sig.length !== expectedSig.length) return null;
  const match = timingSafeEqual(Buffer.from(sig, 'utf8'), Buffer.from(expectedSig, 'utf8'));
  if (!match) return null;
  try {
    const payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
    if (!payload.orderId || typeof payload.exp !== 'number' || payload.exp < now) return null;
    return payload;
  } catch {
    return null;
  }
}

/**
 * Configurable delivery provider transport.
 * Supports sandbox mode (explicit mock receipt) and live provider configs.
 * Never marks delivered without evidence; returns status 'blocked' when unconfigured.
 */
export async function dispatchDeliveryIntent(intent, { providerConfig = {}, reportLink = '' } = {}) {
  if (!plainObject(intent) || intent.status !== 'queued') {
    fail('DELIVERY_STATE', 'Only queued delivery intents can be dispatched.');
  }
  const channel = intent.channel;
  const provider = channel === 'whatsapp' ? providerConfig.whatsappProvider : providerConfig.emailProvider;
  
  if (!provider || provider === 'none' || provider === 'unconfigured') {
    return {
      ...intent,
      status: 'blocked',
      blockReason: 'Provider not configured; no message sent',
      attempts: (intent.attempts || 0) + 1,
      lastAttemptAt: new Date().toISOString()
    };
  }

  if (provider === 'sandbox' || provider === 'mock') {
    const mockId = channel === 'whatsapp' ? `mock-wa-${createHash('sha256').update(intent.id + Date.now()).digest('hex').slice(0, 16)}` : `mock-em-${createHash('sha256').update(intent.id + Date.now()).digest('hex').slice(0, 16)}`;
    return {
      ...intent,
      status: 'sent',
      provider: `${channel}-sandbox`,
      providerMessageId: mockId,
      dispatchedAt: new Date().toISOString(),
      reportLink: reportLink || null,
      attempts: (intent.attempts || 0) + 1
    };
  }

  return {
    ...intent,
    status: 'blocked',
    blockReason: `Live provider '${provider}' transport is not yet connected to external gateway.`,
    attempts: (intent.attempts || 0) + 1,
    lastAttemptAt: new Date().toISOString()
  };
}

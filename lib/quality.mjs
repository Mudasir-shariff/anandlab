import { createHash, randomUUID } from 'node:crypto';

/** Quality rules are supplied by the laboratory's validated catalog, never guessed. */
export class QualityError extends Error {
  constructor(code, message, details) {
    super(message);
    this.name = 'QualityError';
    this.status = 422;
    this.code = code;
    this.details = { code, ...details };
  }
}

const fail = (code, message, details) => { throw new QualityError(code, message, details); };
const numericPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;
const clone = value => structuredClone(value);
const own = (object, key) => object != null && Object.hasOwn(object, key);
const issue = (code, message, details = {}) => ({ code, message, ...details });

function instant(value = new Date()) {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  if (!Number.isFinite(date.getTime())) fail('invalid-time', 'A valid quality-event time is required.');
  return date;
}
function actorIdentity(actor) {
  if (typeof actor === 'string' && actor.trim()) return { id: actor.trim() };
  if (!actor || typeof actor !== 'object' || typeof actor.id !== 'string' || !actor.id.trim()) {
    fail('actor-required', 'A durable authenticated staff identity is required.');
  }
  return Object.fromEntries(['id', 'username', 'displayName', 'role']
    .filter(key => typeof actor[key] === 'string' && actor[key].trim())
    .map(key => [key, actor[key].trim()]));
}
function requiredText(value, label, min = 1, max = 500) {
  if (typeof value !== 'string' || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(value)) fail('invalid-text', `${label} must be text.`);
  const text = value.trim();
  if (text.length < min || text.length > max) fail('invalid-text', `${label} must contain ${min}–${max} characters.`);
  return text;
}
function numeric(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !numericPattern.test(value.trim())) return null;
  const result = Number(value);
  return Number.isFinite(result) ? result : null;
}
function definitions(order, options = {}) {
  // Released definitions take precedence so later catalog edits cannot rewrite history.
  const snapshot = order?.status === 'Approved' && order.catalogSnapshot;
  return {
    catalog: snapshot?.tests || options.catalog?.tests || options.catalog || {},
    parameters: snapshot?.parameters || options.parameters || options.catalog?.parameters || {}
  };
}
function orderedKeys(order, catalog) {
  const keys = [];
  for (const code of Array.isArray(order.tests) ? [...new Set(order.tests)] : []) {
    const parameters = catalog[code]?.parameters;
    if (Array.isArray(parameters)) for (const key of parameters) if (!keys.includes(key)) keys.push(key);
  }
  return keys;
}

/** A result version independent of billing/version increments, bound to this order and specimen cycle. */
export function resultFingerprint(order = {}) {
  const measured = Object.entries(order.results || {}).sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => [key, numeric(value) ?? { invalid: typeof value, value: String(value) }]);
  const record = {
    id: order.id || '', patientId: order.patientId || '',
    tests: [...new Set(Array.isArray(order.tests) ? order.tests : [])].sort(),
    resultsRevision: Number.isSafeInteger(order.resultsRevision) ? order.resultsRevision : 0,
    specimenCycle: Array.isArray(order.specimens) ? order.specimens.map(item=>[item.id,item.cycle||0]).sort(([a],[b])=>String(a).localeCompare(String(b))) : Number.isSafeInteger(order.specimen?.cycle) ? order.specimen.cycle : 0,
    measured
  };
  return createHash('sha256').update(JSON.stringify(record)).digest('hex');
}

/** Identify critical measurements only from explicitly configured, numeric laboratory thresholds. */
export function findCriticalResults(order = {}, options = {}) {
  const { catalog, parameters } = definitions(order, options);
  const findings = [];
  for (const key of orderedKeys(order, catalog)) {
    const parameter = parameters[key];
    if (!parameter) continue;
    const value = numeric(order.results?.[key]);
    if (value == null) continue;
    const hasMin = parameter.criticalMin !== undefined && parameter.criticalMin !== null;
    const hasMax = parameter.criticalMax !== undefined && parameter.criticalMax !== null;
    // Invalid configuration is a release blocker in assessRelease, never a manufactured threshold.
    const min = typeof parameter.criticalMin === 'number' && Number.isFinite(parameter.criticalMin) ? parameter.criticalMin : null;
    const max = typeof parameter.criticalMax === 'number' && Number.isFinite(parameter.criticalMax) ? parameter.criticalMax : null;
    const direction = hasMin && min != null && value < min ? 'low' : hasMax && max != null && value > max ? 'high' : null;
    if (direction) findings.push({ parameterKey: key, parameterName: parameter.name || key,
      measuredValue: value, unit: parameter.unit || '', direction,
      threshold: direction === 'low' ? min : max, resultFingerprint: resultFingerprint(order) });
  }
  return findings;
}

function acknowledgmentMatches(acknowledgment, finding, now) {
  if (!acknowledgment || acknowledgment.parameterKey !== finding.parameterKey ||
      acknowledgment.resultFingerprint !== finding.resultFingerprint ||
      numeric(acknowledgment.measuredValue) !== finding.measuredValue) return false;
  if (![acknowledgment.notifiedPerson, acknowledgment.contact, acknowledgment.reason].every(value => typeof value === 'string' && value.trim())) return false;
  if (!acknowledgment.recordedBy?.id || acknowledgment.readBackConfirmed !== true) return false;
  const notified = Date.parse(acknowledgment.notifiedAt), recorded = Date.parse(acknowledgment.recordedAt);
  return Number.isFinite(notified) && Number.isFinite(recorded) && notified <= now.getTime() + 60_000 && recorded <= now.getTime() + 60_000;
}

/** Side-effect-free release assessment. Warnings are visible gaps, never implicit clinical validation. */
export function assessRelease(order = {}, options = {}) {
  if (!order || typeof order !== 'object' || Array.isArray(order)) order = {};
  const now = instant(options.now);
  const { catalog, parameters } = definitions(order, options);
  const blockers = [], warnings = [];
  const tests = Array.isArray(order.tests) ? [...new Set(order.tests)] : [];
  if (!['Review', 'Approved'].includes(order.status)) blockers.push(issue('not-ready-for-review', 'Complete result entry and submit this order for review before release.'));
  if (!tests.length) blockers.push(issue('no-tests', 'At least one test panel is required.'));
  if (order.specimen?.state === 'rejected') blockers.push(issue('specimen-rejected', 'This specimen was rejected. Record a recollection and enter results for the replacement specimen.'));
  if (order.specimen?.state && !['accepted', 'rejected', 'recollected'].includes(order.specimen.state)) blockers.push(issue('invalid-specimen-state', 'The specimen state is not recognized.'));
  if (Array.isArray(order.specimens)) {
    if (!order.specimens.length) blockers.push(issue('specimen-plan-empty','A specimen collection plan is required.'));
    const ids=new Set();
    for (const item of order.specimens) {
      if (!item?.id || ids.has(item.id)) { blockers.push(issue('invalid-specimen-id','Each specimen needs a unique identifier.')); continue; }
      ids.add(item.id);
      if (!['Registered','Collected','Received','Rejected','Recollected'].includes(item.status)) blockers.push(issue('invalid-specimen-state',`Specimen ${item.id} has an invalid state.`,{specimenId:item.id}));
      else if (item.status === 'Rejected') blockers.push(issue('specimen-rejected',`Specimen ${item.id} was rejected; recollect it before release.`,{specimenId:item.id}));
      else if (item.status !== 'Received') blockers.push(issue('specimen-not-received',`Specimen ${item.id} must be collected and received before release.`,{specimenId:item.id}));
    }
  }
  if (!order.specimen && !Array.isArray(order.specimens)) warnings.push(issue('specimen-history-not-recorded', 'No specimen acceptance/rejection history was recorded for this order.'));

  let configuredThresholds = 0;
  for (const code of tests) {
    const test = catalog[code];
    if (!test || !Array.isArray(test.parameters) || !test.parameters.length) {
      blockers.push(issue('missing-panel-definition', `The laboratory definition for ${code} is missing.`, { testCode: code }));
      continue;
    }
    const qc = options.qcStatus?.[code];
    const qcRequired = test.qcRequired === true || qc?.required === true || (qc && !['not-configured', 'not-required'].includes(qc.status));
    if (qcRequired) {
      if (!qc || qc.status !== 'passed') blockers.push(issue('qc-not-passed', `Required QC for ${test.name || code} has not passed.`, { testCode: code, qcStatus: qc?.status || 'not-recorded' }));
      else {
        const recorded = Date.parse(qc.recordedAt), expires = Date.parse(qc.expiresAt);
        if (!Number.isFinite(recorded) || !Number.isFinite(expires) || expires <= recorded || recorded > now.getTime() + 60_000) {
          blockers.push(issue('qc-evidence-invalid', `QC for ${test.name || code} needs valid recorded and expiry times.`, { testCode: code }));
        } else if (expires <= now.getTime()) blockers.push(issue('qc-expired', `QC for ${test.name || code} has expired.`, { testCode: code }));
      }
    } else warnings.push(issue('qc-not-configured', `No release-blocking QC policy is configured for ${test.name || code}.`, { testCode: code }));
  }
  for (const key of orderedKeys(order, catalog)) {
    const parameter = parameters[key];
    if (!parameter) { blockers.push(issue('missing-parameter-definition', `The laboratory definition for ${key} is missing.`, { parameterKey: key })); continue; }
    const value = numeric(order.results?.[key]);
    if (value == null || value < 0) blockers.push(issue('missing-or-invalid-result', `Enter a valid numeric result for ${parameter.name || key}.`, { parameterKey: key }));
    const minSet = parameter.criticalMin !== undefined && parameter.criticalMin !== null;
    const maxSet = parameter.criticalMax !== undefined && parameter.criticalMax !== null;
    if (minSet || maxSet) {
      configuredThresholds++;
      const minValid = !minSet || (typeof parameter.criticalMin === 'number' && Number.isFinite(parameter.criticalMin));
      const maxValid = !maxSet || (typeof parameter.criticalMax === 'number' && Number.isFinite(parameter.criticalMax));
      if (!minValid || !maxValid || (minSet && maxSet && parameter.criticalMin >= parameter.criticalMax)) {
        blockers.push(issue('critical-rule-invalid', `Critical thresholds for ${parameter.name || key} are not valid.`, { parameterKey: key }));
      }
    }
  }
  if (!configuredThresholds) warnings.push(issue('critical-rules-not-configured', 'No critical-value notification thresholds are configured for these tests. Reference-range H/L flags are not critical-value rules.'));
  const criticalFindings = findCriticalResults(order, options).map(finding => ({ ...finding,
    acknowledged: Array.isArray(order.criticalAcknowledgments) && order.criticalAcknowledgments.some(ack => acknowledgmentMatches(ack, finding, now)) }));
  for (const finding of criticalFindings) if (!finding.acknowledged) blockers.push(issue('critical-notification-required', `Record notification and read-back for critical ${finding.parameterName} before release.`, { parameterKey: finding.parameterKey, measuredValue: finding.measuredValue }));
  return { canRelease: blockers.length === 0, blockers, warnings, criticalFindings, resultFingerprint: resultFingerprint(order) };
}

/** Reject or recollect one specimen. Persistence/version checks and audit commit belong to the server. */
function aggregateSpecimenAction(order, action, body = {}, actor, options = {}) {
  if (!order || typeof order !== 'object' || Array.isArray(order)) fail('order-required', 'An order is required.');
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('invalid-body', 'A quality action object is required.');
  if (order.status === 'Approved') fail('released-order-locked', 'Released reports are locked. Use the report amendment process for clinical changes.');
  if (!['reject', 'recollect'].includes(action)) fail('invalid-specimen-action', 'Choose reject or recollect.');
  const person = actorIdentity(actor);
  const reason = requiredText(body.reason, action === 'reject' ? 'Rejection reason' : 'Recollection reason', 3, 1000);
  const at = instant(options.now).toISOString();
  const next = clone(order);
  const previous = order.specimen || {};
  const cycle = Number.isSafeInteger(previous.cycle) && previous.cycle >= 0 ? previous.cycle : 0;
  const events = Array.isArray(previous.events) ? clone(previous.events) : [];
  if (action === 'reject') {
    if (!['Collected', 'Processing', 'Review'].includes(order.status)) fail('specimen-not-collected', 'A specimen must be collected before it can be rejected.');
    if (previous.state === 'rejected') fail('specimen-already-rejected', 'This specimen has already been rejected. Record a recollection to continue.');
    events.push({ action: 'rejected', at, reason, actor: person, cycle });
    next.specimen = { ...clone(previous), state: 'rejected', cycle, reason, rejectedAt: at, events };
  } else {
    if (previous.state !== 'rejected') fail('specimen-not-rejected', 'Recollection can only replace a specimen recorded as rejected.');
    events.push({ action: 'recollected', at, reason, actor: person, cycle: cycle + 1 });
    next.specimen = { ...clone(previous), state: 'recollected', cycle: cycle + 1, reason, recollectedAt: at, collectedAt: at, events };
    next.status = 'Collected';
    next.collectedAt = at;
    next.processingAt = null;
    next.receivedAt = null;
    next.results = {};
    next.notes = '';
    next.criticalAcknowledgments = [];
    next.resultsRevision=(Number.isSafeInteger(next.resultsRevision)?next.resultsRevision:0)+1;
  }
  return next;
}

/** A critical notification records human communication; it does not send a message. */
export function acknowledgeCritical(order, body = {}, actor, options = {}) {
  if (!order || typeof order !== 'object' || Array.isArray(order)) fail('order-required', 'An order is required.');
  if (!body || typeof body !== 'object' || Array.isArray(body)) fail('invalid-body', 'A quality action object is required.');
  if (order.status === 'Approved') fail('released-order-locked', 'Released reports are locked.');
  if (order.specimen?.state === 'rejected') fail('specimen-rejected', 'Critical release acknowledgments cannot approve a rejected specimen.');
  const person = actorIdentity(actor), now = instant(options.now);
  const key = requiredText(body.parameterKey, 'Parameter key', 1, 100);
  const fingerprint = resultFingerprint(order);
  if (body.resultFingerprint !== fingerprint) fail('result-version-mismatch', 'The measured results changed. Refresh the critical-value assessment before recording notification.');
  const finding = findCriticalResults(order, options).find(item => item.parameterKey === key);
  if (!finding) fail('not-critical', 'This parameter is not currently critical under the configured laboratory rules.');
  const notifiedPerson = requiredText(body.notifiedPerson, 'Notified person', 2, 200);
  const contact = requiredText(body.contact, 'Notification contact', 3, 200);
  const reason = requiredText(body.reason, 'Notification and read-back note', 3, 1000);
  if (body.readBackConfirmed !== true) fail('read-back-required', 'Confirm that the recipient read back the critical result.');
  const notifiedAt = instant(body.notifiedAt).toISOString();
  if (!body.notifiedAt) fail('notification-time-required', 'The actual notification time is required.');
  if (Date.parse(notifiedAt) > now.getTime() + 60_000) fail('notification-in-future', 'Notification time cannot be in the future.');
  const created = Date.parse(order.createdAt);
  if (Number.isFinite(created) && Date.parse(notifiedAt) < created - 60_000) fail('notification-before-order', 'Notification cannot precede this order.');
  const record = { id: randomUUID(), parameterKey: key, measuredValue: finding.measuredValue,
    resultFingerprint: fingerprint, notifiedPerson, contact, notifiedAt, reason, readBackConfirmed: true,
    recordedAt: now.toISOString(), recordedBy: person };
  const next = clone(order);
  next.criticalAcknowledgments = [...(Array.isArray(order.criticalAcknowledgments) ? clone(order.criticalAcknowledgments) : []), record];
  return next;
}

/** Plan individually identifiable specimens without inventing collection events. */
export function createSpecimens(order = {}, options = {}) {
  const { catalog } = definitions(order, options);
  if (!order.id || !Array.isArray(order.tests)) fail('order-required', 'An identified order with test panels is required.');
  const groups = new Map();
  for (const code of [...new Set(order.tests)]) {
    const test = catalog[code];
    if (!test || !Array.isArray(test.parameters)) fail('missing-panel-definition', `The laboratory definition for ${code} is missing.`);
    // A panel may define explicit, validated specimen requirements. The glucose
    // starter panel requires two separately timed/identified specimens.
    const requirements = Array.isArray(test.specimens) && test.specimens.length ? test.specimens :
      code === 'GLUCOSE' ? [
        { key: 'fluoride-plasma-fasting', kind: 'Fluoride plasma · fasting', parameterKeys: ['glucose_fasting'] },
        { key: 'fluoride-plasma-postprandial', kind: 'Fluoride plasma · 2-hour postprandial', parameterKeys: ['glucose_postprandial'] }
      ] : [{ key: String(test.sample || code).trim().toLowerCase().replace(/\s+/g, ' '), kind: test.sample || `Specimen for ${code}`, parameterKeys: test.parameters }];
    for (const requirement of requirements) {
      const groupKey = String(requirement.key || requirement.kind || code);
      if (!groups.has(groupKey)) groups.set(groupKey, { key: groupKey, kind: String(requirement.kind || test.sample || code), testCodes: [], parameterKeys: [] });
      const group = groups.get(groupKey);
      if (!group.testCodes.includes(code)) group.testCodes.push(code);
      for (const key of requirement.parameterKeys || test.parameters) if (!group.parameterKeys.includes(key)) group.parameterKeys.push(key);
    }
  }
  return [...groups.values()].map((group,index)=>({ id: `${order.id}-S${String(index+1).padStart(2,'0')}`, accessionRoot: `${order.id}-S${String(index+1).padStart(2,'0')}`, previousIds: [],
    ...group, status:'Registered', cycle:0, collectedAt:null, receivedAt:null, events:[] }));
}

function aggregateSpecimens(next, at, event) {
  const specimens=next.specimens;
  const rejected=specimens.find(item=>item.status==='Rejected');
  const cycle=Math.max(0,...specimens.map(item=>item.cycle||0));
  const previous=next.specimen||{};
  next.specimen={...previous,state:rejected?'rejected':cycle>0?'recollected':'accepted',cycle,
    events:event?[...(Array.isArray(previous.events)?previous.events:[]),event]:previous.events||[]};
  if(rejected){next.specimen.reason=rejected.reason;next.specimen.rejectedAt=rejected.rejectedAt;}
  if(event?.action==='recollected'){next.specimen.reason=event.reason;next.specimen.recollectedAt=at;}
  return next;
}

/** Mirror an explicit whole-order workflow confirmation onto its specimen IDs. */
export function applyWorkflowSpecimens(order, status, options = {}) {
  const next=clone(order),at=instant(options.now).toISOString(),person=actorIdentity(options.actor);
  next.specimens=Array.isArray(order.specimens)&&order.specimens.length?clone(order.specimens):createSpecimens(order,options);
  if(next.specimens.some(item=>item.status==='Rejected')) {
    fail('specimen-rejected','A rejected specimen must be recollected before editing or advancing the order.');
  }
  for(const item of next.specimens){
    if(status==='Collected'&&item.status==='Registered'){
      item.status='Collected';item.collectedAt=at;
      item.events.push({action:'collected',at,actor:person,cycle:item.cycle,reason:'Whole-order collection confirmed'});
    }
    if(['Processing','Review','Approved'].includes(status)&&['Registered','Collected','Recollected'].includes(item.status)){
      if(item.status==='Registered'&&order.collectedAt)item.collectedAt=order.collectedAt;
      item.status='Received';item.receivedAt=at;
      item.events.push({action:'received',at,actor:person,cycle:item.cycle,reason:'Whole-order processing/receipt confirmed'});
    }
  }
  return aggregateSpecimens(next,at);
}

/** Apply a recorded action to one specimen; old orders without IDs use the legacy aggregate flow. */
export function validateSpecimenAction(order, action, body = {}, actor, options = {}) {
  if(!order||typeof order!=='object'||Array.isArray(order))fail('order-required','An order is required.');
  if(!body||typeof body!=='object'||Array.isArray(body))fail('invalid-body','A quality action object is required.');
  if(!Array.isArray(order.specimens)||!order.specimens.length){
    if(body.specimenId)fail('specimen-not-found','This order has no matching specimen identifier.');
    return aggregateSpecimenAction(order,action,body,actor,options);
  }
  if(order.status==='Approved')fail('released-order-locked','Released reports are locked. Use the report amendment process for clinical changes.');
  if(!['collect','receive','reject','recollect'].includes(action))fail('invalid-specimen-action','Choose collect, receive, reject or recollect.');
  const selected=body.specimenId|| (order.specimens.length===1?order.specimens[0].id:null);
  if(!selected)fail('specimen-id-required','Choose the individual specimen to update.');
  const index=order.specimens.findIndex(item=>item.id===selected);
  if(index<0)fail('specimen-not-found','Specimen not found on this order.');
  const next=clone(order),item=next.specimens[index],person=actorIdentity(actor),at=instant(options.now).toISOString();
  const reason=['reject','recollect'].includes(action)?requiredText(body.reason,action==='reject'?'Rejection reason':'Recollection reason',3,1000):
    body.reason?requiredText(body.reason,'Specimen action note',1,1000):action==='collect'?'Collection confirmed':'Receipt confirmed';
  if(action==='collect'){
    if(item.status!=='Registered')fail('specimen-already-collected','Only a registered specimen can be collected.');
    item.status='Collected';item.collectedAt=at;
  }
  if(action==='receive'){
    if(!['Collected','Recollected'].includes(item.status))fail('specimen-not-collected','Collect the specimen before recording receipt.');
    item.status='Received';item.receivedAt=at;
  }
  if(action==='reject'){
    if(!['Collected','Received','Recollected'].includes(item.status))fail('specimen-not-collected','Only a collected or received specimen can be rejected.');
    item.status='Rejected';item.rejectedAt=at;item.reason=reason;
  }
  if(action==='recollect'){
    if(item.status!=='Rejected')fail('specimen-not-rejected','Recollection can only replace a rejected specimen.');
    const replacedId=item.id;
    item.cycle=(item.cycle||0)+1;item.accessionRoot=item.accessionRoot||item.id.replace(/-R\d+$/,'');
    item.previousIds=[...(Array.isArray(item.previousIds)?item.previousIds:[]),replacedId];
    item.id=`${item.accessionRoot}-R${String(item.cycle).padStart(2,'0')}`;item.replacesSpecimenId=replacedId;
    item.status='Recollected';item.collectedAt=at;item.recollectedAt=at;item.receivedAt=null;item.reason=reason;
    next.status='Collected';next.collectedAt=at;next.processingAt=null;next.receivedAt=null;
    for(const key of item.parameterKeys||[])delete next.results?.[key];
    next.notes='';next.criticalAcknowledgments=[];
    next.resultsRevision=(Number.isSafeInteger(next.resultsRevision)?next.resultsRevision:0)+1;
  }
  const event={action:action==='reject'?'rejected':action==='recollect'?'recollected':action==='collect'?'collected':'received',specimenId:item.id,...(action==='recollect'?{replacesSpecimenId:item.replacesSpecimenId}:{}),at,reason,actor:person,cycle:item.cycle||0};
  item.events=[...(Array.isArray(item.events)?item.events:[]),event];
  aggregateSpecimens(next,at,event);
  if(next.status==='Registered'&&next.specimens.every(value=>['Collected','Received','Recollected'].includes(value.status))){next.status='Collected';next.collectedAt=at;}
  if(next.status==='Collected'&&next.specimens.every(value=>value.status==='Received')){next.status='Processing';next.processingAt=at;next.receivedAt=at;}
  return next;
}

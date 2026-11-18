import { TESTS, PARAMETERS } from './catalog.js';

export const REPORT_TEMPLATES = [
  { id: 'classic', name: 'Classic blue', description: 'A blue letterhead with a compact clinical results table.', color: '#07557a' },
  { id: 'sahara', name: 'Modern orange', description: 'A bold orange letterhead and a clear, spacious report.', color: '#e98b39' },
  { id: 'minimal', name: 'Minimal teal', description: 'A clean hospital-style layout with restrained teal accents.', color: '#218b8b' }
];

const escape = value => String(value ?? '').replace(/[&<>"']/g, character => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[character]));
const text = value => value === '' || value == null ? '—' : escape(value);
const own = (object,key) => object != null && Object.hasOwn(object,key);
const numericValue = value => {
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (typeof value === 'string' && !/^[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?$/.test(value.trim())) return null;
  return Number.isFinite(Number(value)) ? Number(value) : null;
};
const displayDate = value => {
  if (!value) return 'Not recorded';
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? escape(date.toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', hour12:true, timeZone:'Asia/Kolkata' })) : 'Not recorded';
};
const brandIcon = '<svg viewBox="0 0 48 48" aria-hidden="true"><path d="M19 5h10m-8 0v15L10 37a4 4 0 0 0 3 6h22a4 4 0 0 0 3-6L27 20V5M16 29h16"/><circle cx="22" cy="34" r="1.5"/><circle cx="28" cy="38" r="1"/></svg>';
const lineCount = (value,width) => String(value ?? '').split(/\r?\n/).reduce((sum,line)=>sum+Math.max(1,Math.ceil(Array.from(line).length/width)),0);

function reportDefinitions(order) {
  const frozen = order.status === 'Approved' && order.catalogSnapshot && typeof order.catalogSnapshot === 'object';
  const tests = frozen ? order.catalogSnapshot.tests || {} : TESTS;
  const parameters = frozen ? order.catalogSnapshot.parameters || {} : PARAMETERS;
  const assigned = new Set();
  const codes = [...new Set(Array.isArray(order.tests) ? order.tests : [])];
  const sections = codes.map(code=>{
    const definition = own(tests,code) && tests[code] && typeof tests[code] === 'object' ? tests[code] : null;
    const keys = [...new Set(Array.isArray(definition?.parameters) ? definition.parameters : [])];
    const rows = keys.map(key=>{
      assigned.add(key);
      const parameter = own(parameters,key) && parameters[key] && typeof parameters[key] === 'object' ? parameters[key] : null;
      return {key,parameter,value:order.results?.[key],unknown:!parameter};
    });
    if (!definition || !rows.length) rows.push({key:`unavailable-${code}`,notice:'The test definition was not captured. Contact the laboratory to verify this report.'});
    return {code,test:definition || {name:`${String(code)} · definition unavailable`,department:'Recorded test',sample:'Not recorded'},rows};
  });
  // Never silently drop a historical result when a catalog panel or parameter was removed.
  const unmatched = Object.keys(order.results || {}).filter(key=>!assigned.has(key));
  if (unmatched.length) sections.push({code:'UNMAPPED',test:{name:'Additional recorded results',department:'Definition unavailable',sample:'Not recorded'},rows:unmatched.map(key=>({key,parameter:own(parameters,key)?parameters[key]:null,value:order.results[key],unknown:true}))});
  return {sections,frozen:Boolean(frozen),hasUnknown:sections.some(section=>section.rows.some(row=>row.unknown || row.notice))};
}

function rowHeight(row) {
  if (row.notice) return 11;
  const parameter = row.parameter || {};
  const reference = parameter.reference || (Number.isFinite(parameter.min) && Number.isFinite(parameter.max) ? `${parameter.min} – ${parameter.max}` : 'Not recorded');
  const lines = Math.max(lineCount(parameter.name || row.key,44),lineCount(row.value,14),lineCount(parameter.unit || '—',15),lineCount(reference,22));
  return 2.4 + lines * 3.6 + (row.unknown?3.5:0);
}

function frameHeight(order,profile,template,hasRibbon,hasWarning) {
  const nameLines = lineCount(profile.labName || 'Laboratory report',template==='sahara'?23:29);
  const addressLines = profile.address ? lineCount(profile.address,50) : 0;
  const contactLines = [profile.registration,profile.phone,profile.email,profile.website].filter(Boolean).reduce((sum,value)=>sum+lineCount(value,29),0);
  const brand = Math.max(template==='sahara'?32:30,12 + nameLines*6.4 + addressLines*3.4,10+contactLines*3.6);
  const left = lineCount(order.name,38)*4.8 + 3 + lineCount(`${order.age} years / ${order.sex}`,48)*3.6 + lineCount(order.patientId,47)*3.6 + lineCount(order.referrer || 'Self',47)*3.6;
  const patient = Math.max(29,left+7);
  const footer = 10+(profile.reportFooter?lineCount(profile.reportFooter,105)*3.1:4)+(profile.workingHours?lineCount(profile.workingHours,100)*3.1:0);
  return brand+patient+footer+12+(hasRibbon?7:0)+(hasWarning?9:0);
}

function splitNoteLines(value) {
  const lines = [];
  for (const line of String(value || '').replace(/\r\n?/g,'\n').split('\n')) {
    const characters = Array.from(line);
    if (!characters.length) lines.push('');
    for (let index=0;index<characters.length;index+=85) lines.push(characters.slice(index,index+85).join(''));
  }
  return lines;
}

function paginate(order,profile,template,definitions,hasRibbon,warning) {
  // Dimensions include conservative wrapping and a20mm safety allowance within printable A4.
  const bodyBudget = Math.max(35,277-frameHeight(order,profile,template,hasRibbon,Boolean(warning))-20);
  const pages = [{sections:[],used:0,notes:null}];
  let current = pages[0];
  for (const section of definitions.sections) {
    let offset = 0;
    while (offset<section.rows.length) {
      const heading = 22 + Math.max(0,lineCount(section.test.name,55)-1)*4.2;
      let room = bodyBudget-current.used-heading;
      if (room<rowHeight(section.rows[offset]) && current.sections.length) {
        current={sections:[],used:0,notes:null};pages.push(current);room=bodyBudget-heading;
      }
      const rows=[];
      let used=heading;
      while(offset<section.rows.length) {
        const height=rowHeight(section.rows[offset]);
        if(rows.length && used+height>bodyBudget-current.used) break;
        rows.push(section.rows[offset++]);used+=height;
        if(used>=bodyBudget-current.used)break;
      }
      current.sections.push({...section,rows,continued:offset>rows.length});
      current.used+=used;
      if(offset<section.rows.length){current={sections:[],used:0,notes:null};pages.push(current);}
    }
  }
  const notes = splitNoteLines(order.notes || 'No additional clinical notes.');
  const authorHeight = 16 + Math.max(lineCount(profile.labIncharge || 'Checked by',42)+lineCount(profile.labInchargeQualification,48),lineCount(profile.pathologist || order.approvedByName || order.approvedBy || 'Reviewer details not configured',42)+lineCount(profile.pathologistQualification,48))*3.6;
  const noteHeight = 13+notes.length*3.8;
  if(current.used+noteHeight+authorHeight<=bodyBudget) {
    current.notes=notes.join('\n');current.signatures=true;
  } else {
    let offset=0;
    while(offset<notes.length) {
      const room=Math.max(1,Math.floor((bodyBudget-13)/3.8));
      const lines=notes.slice(offset,offset+Math.min(24,room));
      current={sections:[],used:13+lines.length*3.8,notes:lines.join('\n'),noteOnly:true,notesContinued:offset>0};
      pages.push(current);offset+=lines.length;
    }
    if(current.used+authorHeight>bodyBudget) pages.push({sections:[],used:authorHeight,notes:null,noteOnly:true,signatures:true});
    else current.signatures=true;
  }
  return pages;
}

function resultRow(row,code,sex) {
  if (row.notice) return `<tr class="report-definition-notice"><td colspan="4">${escape(row.notice)}</td></tr>`;
  const parameter=row.parameter || {name:row.key,unit:'Not recorded',reference:'Not recorded'};
  const numeric=numericValue(row.value),available=numeric!==null;
  const recordedText=row.unknown&&typeof row.value==='string'&&row.value.trim()?row.value:null;
  const flag=!row.unknown && available && Number.isFinite(parameter.min) && numeric<parameter.min?'L':!row.unknown && available && Number.isFinite(parameter.max) && numeric>parameter.max?'H':'';
  // Use sex-specific reference interval string when available (display only; min/max thresholds are unchanged),
  // unless an archived or custom reference was explicitly specified for this parameter.
  const isCustomRef = parameter.reference && (!PARAMETERS[row.key] || parameter.reference !== PARAMETERS[row.key].reference);
  const sexRef = !isCustomRef && (sex==='Male' && parameter.referenceM ? parameter.referenceM : sex==='Female' && parameter.referenceF ? parameter.referenceF : null);
  const reference=row.unknown?'Not captured':sexRef||parameter.reference || (Number.isFinite(parameter.min)&&Number.isFinite(parameter.max)?`${parameter.min} – ${parameter.max}`:'Not captured');
  return `<tr class="report-result-row ${flag?'report-abnormal':''}" data-test="${escape(code)}" data-parameter="${escape(row.key)}"><td>${text(parameter.name || row.key)}${row.unknown?'<small class="report-definition-label">Definition not captured</small>':''}</td><td class="report-result-value">${available?escape(row.value):recordedText?escape(recordedText):'—'}${flag?`<span class="report-result-flag" aria-label="${flag==='H'?'Above reference range':'Below reference range'}">${flag}</span>`:''}</td><td>${row.unknown?'Not captured':text(parameter.unit)}</td><td>${escape(reference)}</td></tr>`;
}

function letterhead(profile) {
  const contact=[profile.phone,profile.email,profile.website].filter(Boolean);
  const symbol = profile.logoUrl ? `<img src="${escape(profile.logoUrl)}" class="report-brand-logo" alt="Logo" style="max-height:48px;max-width:140px;object-fit:contain;" />` : brandIcon;
  return `<header class="report-brand"><div class="report-brand-symbol">${symbol}</div><div class="report-brand-main"><div class="report-brand-kicker">DIAGNOSTIC LABORATORY</div><h2>${text(profile.labName || 'Laboratory report')}</h2>${profile.address?`<p class="report-brand-address">${escape(profile.address)}</p>`:''}</div><div class="report-brand-contact">${profile.registration?`<div class="report-registration">Reg. no. ${escape(profile.registration)}</div>`:''}${contact.map(value=>`<div>${escape(value)}</div>`).join('')}</div></header>`;
}
function patientDetails(order) {
  return `<section class="report-patient-block" aria-label="Patient and sample details"><div class="report-patient-identity"><h3>${text(order.name)}</h3><dl><div><dt>Age / Sex</dt><dd>${text(order.age)} years / ${text(order.sex)}</dd></div><div><dt>Patient ID</dt><dd>${text(order.patientId)}</dd></div><div><dt>Referred by</dt><dd>${text(order.referrer || 'Self')}</dd></div></dl></div><div class="report-sample-details"><dl><div><dt>Order no.</dt><dd class="report-order-number">${text(order.id)}</dd></div><div><dt>Registered</dt><dd>${displayDate(order.createdAt)}</dd></div><div><dt>Collected</dt><dd>${displayDate(order.collectedAt)}</dd></div><div><dt>Received</dt><dd>${displayDate(order.receivedAt)}</dd></div><div><dt>Reported</dt><dd>${order.status==='Approved'?displayDate(order.approvedAt):'Pending approval'}</dd></div></dl><p class="report-timezone">All report times: IST (UTC+05:30)</p></div></section>`;
}
function signatures(order,profile) {
  const approved=order.status==='Approved';
  // Prefer display name over UUID; show 'Staff ID: ...' only as last resort.
  const approvedDisplayName=order.approvedByName || (order.approvedBy && !order.approvedBy.startsWith('usr-') ? order.approvedBy : null);
  const authorizedName=profile.pathologist || approvedDisplayName;
  const approvedByLabel=approved && order.approvedByName ? order.approvedByName : approved && order.approvedBy ? (order.approvedBy.startsWith('usr-') ? 'Authorized reviewer' : order.approvedBy) : null;
  // Show corrected report notice only when this is an explicit amendment (linked to an original order).
  // resultsRevision > 1 alone is not sufficient: it also increments on analyst re-entry without amendment.
  const corrected=Boolean(order.originalOrderId);
  return `${corrected?`<div class="report-correction-notice">Corrected report · Revision ${order.resultsRevision}</div>`:''}` +
    `<section class="report-reviewers"><div class="report-reviewer"><div class="report-reviewer-line"></div><strong>${text(profile.labIncharge || 'Checked by')}</strong>${profile.labInchargeQualification?`<span>${escape(profile.labInchargeQualification)}</span>`:''}<span>Laboratory in-charge</span></div><div class="report-reviewer report-reviewer-authorizer"><div class="report-reviewer-line"></div><strong>${approved?text(authorizedName || 'Reviewer details not configured'):'Awaiting authorization'}</strong>${approved&&profile.pathologistQualification?`<span>${escape(profile.pathologistQualification)}</span>`:''}<span>${approved?'Authorized reviewer':'Draft · not authorized'}</span>${approved&&approvedByLabel?`<small>Approved by ${escape(approvedByLabel)}</small>`:''}</div></section>`;
}

/** Render a complete escaped report. Approved reports prefer their captured definitions. */
export function renderReport(order={},settings={},options={}) {
  const profile=order.reportSnapshot?{...order.reportSnapshot}:{...settings};
  const candidate=options.template || profile.reportTemplate || 'classic';
  const template=REPORT_TEMPLATES.some(item=>item.id===candidate)?candidate:'classic';
  const definitions=reportDefinitions(order);
  const demo=options.demo===true || order.demo===true;
  const sample=options.preview===true || order.sampleReport===true;
  const draft=order.status!=='Approved';
  const status=[];
  if(sample) status.push('SAMPLE REPORT · FICTIONAL DATA · NOT FOR CLINICAL USE');
  else if(demo) status.push('DEMONSTRATION REPORT · FICTIONAL PATIENT · NOT FOR CLINICAL USE');
  if(order.originalOrderId) status.push(`AMENDED REPORT · REPLACES ${order.originalOrderId}`);
  if(draft) status.push('DRAFT REPORT · AWAITING REVIEW AND APPROVAL');
  const mode=status.join(' · ');
  const historical=order.status==='Approved'&&!definitions.frozen&&!sample;
  const warnings=[];
  if(order.amendmentReason)warnings.push(`Amended report: ${order.amendmentReason} (Replaces ${order.originalOrderId||'previous release'}).`);
  if(historical)warnings.push('Historical report: original test definitions were not captured. Reference details use the current catalog.');
  if(definitions.hasUnknown)warnings.push('Some recorded test definitions are unavailable. Verify this report with the laboratory.');
  const warning=warnings.join(' ');
  const pages=paginate(order,profile,template,definitions,Boolean(mode),warning);
  return `<div class="report report-document report-theme-${template}" data-report-template="${template}">${pages.map((page,index)=>`<article class="report-page" aria-label="Report page ${index+1} of ${pages.length}">${mode?`<div class="report-status-ribbon ${draft?'report-status-draft':''}">${escape(mode)}</div>`:''}${letterhead(profile)}${patientDetails(order)}${warning?`<p class="report-data-warning">${escape(warning)}</p>`:''}<div class="report-document-title"><span>LABORATORY REPORT</span><b>${draft?'DRAFT':'RESULTS'}</b></div><main class="report-results-content">${page.sections.length?page.sections.map(section=>`<section class="report-test-section"><div class="report-test-heading"><span>${text(section.test.department)}</span><h3>${text(section.test.name)}${section.continued?' <small>(continued)</small>':''}</h3><div>Specimen: ${text(section.test.sample)}</div></div><table class="report-results-table"><colgroup><col style="width:43%"><col style="width:16%"><col style="width:17%"><col style="width:24%"></colgroup><thead><tr><th>TEST DESCRIPTION</th><th>RESULT</th><th>UNITS</th><th>BIOLOGICAL REFERENCE</th></tr></thead><tbody>${section.rows.map(row=>resultRow(row,section.code,order.sex)).join('')}</tbody></table></section>`).join(''):page.noteOnly?'':'<p class="report-no-results">No test results are available for this order.</p>'}</main>${page.notes!==null?`<section class="report-clinical-notes"><h4>Clinical notes${page.notesContinued?' · continued':''}</h4><p>${escape(page.notes)}</p><small>H = above reference interval · L = below reference interval. Interpret results with clinical findings. Reference intervals require laboratory validation.</small></section>`:''}${page.signatures?signatures(order,profile):'<p class="report-continued-note">Report continued on the next page.</p>'}<footer class="report-page-footer"><div class="report-footer-rule"></div><div class="report-footer-row"><span>${text(order.id)}</span><strong>Page ${index+1} of ${pages.length}</strong><span>${index===pages.length-1?'End of report':'Continued'}</span></div>${profile.reportFooter?`<p>${escape(profile.reportFooter)}</p>`:'<p>Results relate only to the sample tested. Please correlate with clinical findings.</p>'}${profile.workingHours?`<p>Working hours: ${escape(profile.workingHours)}</p>`:''}</footer></article>`).join('')}</div>`;
}

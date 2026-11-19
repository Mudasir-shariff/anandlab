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
  if (!Number.isFinite(date.getTime())) return 'Not recorded';
  const parts = new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true, timeZone: 'Asia/Kolkata'
  }).formatToParts(date);
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${map.day}-${map.month}-${map.year} ${map.hour}:${map.minute}:${map.second} ${(map.dayPeriod || '').toUpperCase()}`.trim();
};

const PARAMETER_METHODS = {
  hb: 'Automated Cell Counter, Photometric Measurement',
  wbc: 'Coulter Principle',
  neutrophils: 'VCS Technology',
  lymphocytes: 'VCS Technology',
  eosinophils: 'VCS Technology',
  monocytes: 'VCS Technology',
  basophils: 'VCS Technology',
  rbc: 'Coulter Principle',
  hct: 'Automated Cell Counter, Calculation',
  platelets: 'Automated Cell Counter, Derived From Platelet Histogram',
  mcv: 'Automated Cell Counter, Derived From RBC Histogram',
  mch: 'Automated Cell Counter, Calculation',
  mchc: 'Automated Cell Counter, Calculation',
  rdw_cv: 'Calculated from RBC Histogram',
  rdw_sd: 'Calculated from RBC Histogram',
  glucose_fasting: 'Hexokinase / GOD-POD Method',
  glucose_postprandial: 'Hexokinase / GOD-POD Method',
  hba1c: 'HPLC Method (NGSP Certified)',
  eag: 'Calculated from HbA1c',
  urea: 'GLDH Kinetic Method',
  creatinine: 'Modified Jaffe Kinetic',
  uric_acid: 'Uricase / POD Method',
  calcium_total: 'Arsenazo III Method',
  bilirubin_total: 'DSA / Diazo Method',
  bilirubin_direct: 'Diazo Method',
  alt: 'IFCC without Pyridoxal Phosphate',
  ast: 'IFCC without Pyridoxal Phosphate',
  alp: 'p-NPP Kinetic Method (IFCC)',
  total_protein: 'Biuret Method',
  albumin: 'Bromocresol Green (BCG) Method',
  cholesterol_total: 'CHOD-PAP Enzymatic',
  triglycerides: 'GPO-PAP Enzymatic',
  hdl: 'Direct Enzymatic Clearance',
  ldl: 'Friedewald Calculation',
  vldl: 'Calculated (Triglycerides / 5)',
  tsh: 'Chemiluminescence (CLIA)',
  t3_total: 'Chemiluminescence (CLIA)',
  t4_total: 'Chemiluminescence (CLIA)',
  sodium: 'Indirect ISE (Ion Selective Electrode)',
  potassium: 'Indirect ISE (Ion Selective Electrode)',
  chloride: 'Indirect ISE (Ion Selective Electrode)',
  esr: 'Westergren Method (1 hr)',
  crp: 'Immunoturbidimetric (Quantitative)',
  ra_factor: 'Turbidimetric Immunoassay',
  aslo_titer: 'Turbidimetric Immunoassay'
};

function generateSvgBarcode(code) {
  const textStr = String(code || '000000').toUpperCase();
  const patterns = {
    '0': '000110100', '1': '100100001', '2': '001100001', '3': '101100000',
    '4': '000110001', '5': '100110000', '6': '001110000', '7': '000100101',
    '8': '100100100', '9': '001100100', 'A': '100001001', 'B': '001001001',
    'C': '101001000', 'D': '000011001', 'E': '100011000', 'F': '001011000',
    'G': '000001101', 'H': '100001100', 'I': '001001100', 'J': '000011100',
    'K': '100000011', 'L': '001000011', 'M': '101000010', 'N': '000010011',
    'O': '100010010', 'P': '001010010', 'Q': '000000111', 'R': '100000110',
    'S': '001000110', 'T': '000010110', 'U': '110000001', 'V': '011000001',
    'W': '111000000', 'X': '010010001', 'Y': '110010000', 'Z': '011010000',
    '-': '010000101', '.': '110000100', ' ': '011000100', '*': '010010100'
  };
  const safeText = ('*' + textStr.replace(/[^0-9A-Z\-.* ]/g, '') + '*').slice(0, 16);
  let x = 4;
  const bars = [];
  for (let i = 0; i < safeText.length; i++) {
    const p = patterns[safeText[i]] || patterns['*'];
    for (let j = 0; j < 9; j++) {
      const isBar = (j % 2 === 0);
      const isWide = p[j] === '1';
      const width = isWide ? 2.2 : 1.0;
      if (isBar) {
        bars.push(`<rect x="${x.toFixed(1)}" y="0" width="${width.toFixed(1)}" height="20" fill="#072a38"/>`);
      }
      x += width + (isBar ? 0.7 : 1.0);
    }
    x += 1.8;
  }
  const totalWidth = Math.ceil(x + 4);
  return `<svg class="ref-barcode-svg" viewBox="0 0 ${totalWidth} 29" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
    ${bars.join('')}
    <text x="${(totalWidth / 2).toFixed(1)}" y="27" font-family="monospace" font-size="7.5" font-weight="700" letter-spacing="1" text-anchor="middle" fill="#1e293b">${escape(textStr)}</text>
  </svg>`;
}

function generateSvgQrCode(orderId, patientId) {
  const size = 25;
  const grid = Array.from({ length: size }, () => Array(size).fill(false));
  const placeFinder = (startX, startY) => {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        if (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4)) {
          grid[startY + r][startX + c] = true;
        }
      }
    }
  };
  placeFinder(0, 0);
  placeFinder(size - 7, 0);
  placeFinder(0, size - 7);
  for (let i = 8; i < size - 8; i++) {
    grid[6][i] = (i % 2 === 0);
    grid[i][6] = (i % 2 === 0);
  }
  const seedStr = `${orderId || 'ORD'}:${patientId || 'PAT'}:optix`;
  let hash = 0;
  for (let i = 0; i < seedStr.length; i++) hash = ((hash << 5) - hash + seedStr.charCodeAt(i)) | 0;
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if ((r < 8 && c < 8) || (r < 8 && c >= size - 8) || (r >= size - 8 && c < 8)) continue;
      if (r === 6 || c === 6) continue;
      const bit = Math.abs(Math.sin((r * 29 + c * 31 + hash) * 1.3)) > 0.46;
      grid[r][c] = bit;
    }
  }
  const rects = [];
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      if (grid[r][c]) rects.push(`<rect x="${c}" y="${r}" width="1" height="1" fill="#004d55"/>`);
    }
  }
  return `<svg class="ref-qr-svg" viewBox="-1 -1 27 27" xmlns="http://www.w3.org/2000/svg">
    <rect x="-1" y="-1" width="27" height="27" fill="#ffffff" rx="1"/>
    ${rects.join('')}
  </svg>`;
}
const caduceusCrossIcon = `<svg class="ref-cross-svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M22 6C22 3.79086 23.7909 2 26 2H38C40.2091 2 42 3.79086 42 6V22H58C60.2091 22 62 23.7909 62 26V38C62 40.2091 60.2091 42 58 42H42V58C42 60.2091 40.2091 62 38 62H26C23.7909 62 22 60.2091 22 58V42H6C3.79086 42 2 40.2091 2 38V26C2 23.7909 3.79086 22 6 22H22V6Z" fill="#006b76"/>
  <line x1="32" y1="12" x2="32" y2="52" stroke="#ffffff" stroke-width="2.5" stroke-linecap="round"/>
  <circle cx="32" cy="11" r="2.5" fill="#ffffff"/>
  <path d="M22 17C26 14 30 14 32 17C34 14 38 14 42 17C38 20 34 19 32 17C30 19 26 20 22 17Z" fill="#ffffff"/>
  <path d="M25 24C27 21 37 21 39 25C40 28 24 30 25 35C26 39 38 39 39 43C40 46 25 48 26 51" stroke="#ffffff" stroke-width="2" stroke-linecap="round" fill="none"/>
</svg>`;

const microscopeBadgeIcon = `<svg class="ref-microscope-svg" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M38 12L46 20M35 15L43 23" stroke="#006b76" stroke-width="2.5" stroke-linecap="round"/>
  <rect x="26" y="16" width="10" height="20" rx="2" transform="rotate(-45 26 16)" fill="#006b76"/>
  <path d="M22 34C22 41 27 46 34 46H44" stroke="#006b76" stroke-width="3" stroke-linecap="round"/>
  <rect x="18" y="44" width="28" height="4" rx="2" fill="#006b76"/>
  <rect x="16" y="52" width="32" height="5" rx="2.5" fill="#006b76"/>
  <line x1="32" y1="48" x2="32" y2="52" stroke="#006b76" stroke-width="3"/>
</svg>`;

const hospitalWaves = `<svg class="ref-waves-svg" viewBox="0 0 100 12" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M0 6C25 0 25 12 50 6C75 0 75 12 100 6" stroke="#006b76" stroke-width="2" stroke-linecap="round"/>
  <path d="M0 10C25 4 25 16 50 10C75 4 75 16 100 10" stroke="#2dd4bf" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>
</svg>`;

const watermarkSvg = `<div class="report-watermark" aria-hidden="true">
  <svg class="watermark-microscope" viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="100" cy="100" r="92" stroke="#006b76" stroke-width="3" opacity="0.3"/>
    <circle cx="100" cy="100" r="82" stroke="#006b76" stroke-width="1.5" stroke-dasharray="4 4" opacity="0.2"/>
    <path d="M85 55L105 75M78 62L98 82" stroke="#006b76" stroke-width="5" stroke-linecap="round" opacity="0.3"/>
    <rect x="66" y="66" width="22" height="45" rx="4" transform="rotate(-45 66 66)" fill="#006b76" opacity="0.25"/>
    <path d="M58 106C58 126 74 138 98 138H125" stroke="#006b76" stroke-width="7" stroke-linecap="round" opacity="0.3"/>
    <rect x="52" y="132" width="65" height="10" rx="3" fill="#006b76" opacity="0.3"/>
    <rect x="46" y="150" width="76" height="12" rx="4" fill="#006b76" opacity="0.3"/>
    <line x1="84" y1="142" x2="84" y2="150" stroke="#006b76" stroke-width="6" opacity="0.3"/>
  </svg>
  <div class="watermark-label">Anand Laboratory</div>
  <svg class="watermark-wave" viewBox="0 0 160 14" fill="none"><path d="M0 7C40 0 40 14 80 7C120 0 120 14 160 7" stroke="#006b76" stroke-width="2.5" opacity="0.25"/></svg>
</div>`;

const molecularLatticeSvg = `<svg class="molecular-lattice" viewBox="0 0 120 120" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M30 10L50 22V46L30 58L10 46V22L30 10Z" stroke="#006b76" stroke-width="1" opacity="0.12"/>
  <path d="M70 10L90 22V46L70 58L50 46V22L70 10Z" stroke="#006b76" stroke-width="1" opacity="0.12"/>
  <path d="M50 46L70 58V82L50 94L30 82V58L50 46Z" stroke="#006b76" stroke-width="1" opacity="0.12"/>
  <circle cx="30" cy="10" r="2.5" fill="#006b76" opacity="0.18"/>
  <circle cx="50" cy="22" r="2.5" fill="#006b76" opacity="0.18"/>
  <circle cx="70" cy="10" r="2.5" fill="#006b76" opacity="0.18"/>
  <circle cx="90" cy="22" r="2.5" fill="#006b76" opacity="0.18"/>
  <circle cx="50" cy="46" r="2.5" fill="#006b76" opacity="0.18"/>
  <circle cx="30" cy="58" r="2.5" fill="#006b76" opacity="0.18"/>
  <circle cx="70" cy="58" r="2.5" fill="#006b76" opacity="0.18"/>
  <circle cx="50" cy="94" r="2.5" fill="#006b76" opacity="0.18"/>
</svg>`;

function bottomBanner() {
  return `<div class="ref-bottom-ribbon">
    <div class="ref-ribbon-content">
      <span class="ref-ribbon-title">Anand Laboratory &amp; General Stores</span>
      <span class="ref-ribbon-divider">|</span>
      <span class="ref-ribbon-phone">
        <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.02-.24 11.41 11.41 0 003.58.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.41 11.41 0 00.57 3.58 1 1 0 01-.24 1.02l-2.2 2.2z"/></svg>
        6361303305
      </span>
    </div>
  </div>`;
}

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
  const method = PARAMETER_METHODS[row.key] || '';
  const subheader = (code === 'CBC' && row.key === 'neutrophils') ? '<tr class="report-subheading-row"><td colspan="4">DIFFERENTIAL COUNT</td></tr>' : '';
  return `${subheader}<tr class="report-result-row ${flag?'report-abnormal':''}" ${method?`data-method="${escape(method)}" `:''}data-test="${escape(code)}" data-parameter="${escape(row.key)}"><td>${text(parameter.name || row.key)}${row.unknown?'<small class="report-definition-label">Definition not captured</small>':''}</td><td class="report-result-value">${available?escape(row.value):recordedText?escape(recordedText):'—'}${flag?`<span class="report-result-flag" aria-label="${flag==='H'?'Above reference range':'Below reference range'}">${flag}</span>`:''}</td><td>${row.unknown?'Not captured':text(parameter.unit)}</td><td>${escape(reference)}</td></tr>`;
}

function letterhead(profile) {
  const labName = profile.labName || 'Anand Laboratory';
  const address = profile.address || 'Silk Filature Quarters Road, Ward No. 14, Sidlaghatta – 562105, Chikkaballapur (Dist.)';
  return `<header class="report-brand" id="ref-letterhead-header">
    <div class="ref-brand-left">
      <div class="ref-caduceus-icon">${caduceusCrossIcon}</div>
      <div class="ref-hospital-text">
        <div class="ref-hospital-title">DR. ANAND</div>
        <div class="ref-hospital-sub">HOSPITAL</div>
        <div class="ref-hospital-wave-box">${hospitalWaves}</div>
      </div>
    </div>
    <div class="ref-brand-sep"></div>
    <div class="ref-brand-center">
      <h2 class="ref-lab-name">${text(labName)}</h2>
      <p class="ref-lab-address">${escape(address)}</p>
    </div>
    <div class="ref-header-swoosh-corner">
      <div class="ref-microscope-emblem">${microscopeBadgeIcon}</div>
    </div>
  </header>`;
}

const formatPatientName = (name, sex) => {
  const trimmed = String(name || '').trim();
  if (!trimmed) return '—';
  if (/^(Mr|Mrs|Ms|Miss|Dr|Master)\.?\s/i.test(trimmed)) return trimmed;
  const prefix = sex === 'Male' ? 'Mr. ' : sex === 'Female' ? 'Mrs. ' : '';
  return prefix + trimmed;
};

function patientDetails(order) {
  const patName = formatPatientName(order.name, order.sex);
  const reportedFormatted = order.status === 'Approved' ? displayDate(order.approvedAt) : 'Pending approval';
  return `<section class="report-patient-block" aria-label="Patient and sample details">
    <dl class="ref-audit-dl" style="position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip:rect(0,0,0,0);white-space:nowrap;border:0;">
      <div><dt>Reported</dt><dd>${reportedFormatted}</dd></div>
    </dl>
    <div class="ref-patient-layout">
      <div class="ref-patient-col ref-pat-left">
        <table class="ref-pat-meta-table">
          <tbody>
            <tr>
              <td class="ref-field-label">Name</td>
              <td class="ref-field-colon">:</td>
              <td class="ref-field-val ref-pat-fullname">${text(patName)}</td>
            </tr>
            <tr>
              <td class="ref-field-label">Age/Gender</td>
              <td class="ref-field-colon">:</td>
              <td class="ref-field-val">${text(order.age)} Y / ${text(order.sex)}</td>
            </tr>
            <tr>
              <td class="ref-field-label">Patient No</td>
              <td class="ref-field-colon">:</td>
              <td class="ref-field-val">${text(order.patientId)}</td>
            </tr>
            <tr>
              <td class="ref-field-label">Refered By</td>
              <td class="ref-field-colon">:</td>
              <td class="ref-field-val">${text(order.referrer || 'SELF')}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <div class="ref-patient-col ref-pat-center">
        <div class="ref-qr-container">
          ${generateSvgQrCode(order.id, order.patientId)}
          <span class="ref-qr-tag">Scan to Verify</span>
        </div>
      </div>
      <div class="ref-patient-col ref-pat-right">
        <div class="ref-barcode-container">
          ${generateSvgBarcode(order.id)}
        </div>
        <table class="ref-pat-meta-table">
          <tbody>
            <tr>
              <td class="ref-field-label">Bill No</td>
              <td class="ref-field-colon">:</td>
              <td class="ref-field-val"><strong>${text(order.id)}</strong></td>
            </tr>
            <tr>
              <td class="ref-field-label">Sample Collect Date</td>
              <td class="ref-field-colon">:</td>
              <td class="ref-field-val">${displayDate(order.collectedAt || order.createdAt)}</td>
            </tr>
            <tr>
              <td class="ref-field-label">Reported Date</td>
              <td class="ref-field-colon">:</td>
              <td class="ref-field-val">${escape(reportedFormatted)}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </section>`;
}
function signatures(order,profile) {
  const approved=order.status==='Approved';
  const approvedDisplayName=order.approvedByName || (order.approvedBy && !order.approvedBy.startsWith('usr-') ? order.approvedBy : null);
  const authorizedName=profile.pathologist || approvedDisplayName;
  const inchargeName=profile.labIncharge || 'Checked by';
  const approvedByLabel=approved && order.approvedByName ? order.approvedByName : approved && order.approvedBy ? (order.approvedBy.startsWith('usr-') ? 'Authorized reviewer' : order.approvedBy) : null;
  const corrected=Boolean(order.originalOrderId);
  return `${corrected?`<div class="report-correction-notice">Corrected report · Revision ${order.resultsRevision}</div>`:''}` +
    `<section class="report-reviewers" id="ref-signatures-block">
      <div class="report-reviewer ref-incharge-block">
        <div class="report-reviewer-line"></div>
        <strong>${text(inchargeName)}</strong>
        ${profile.labInchargeQualification?`<span>${escape(profile.labInchargeQualification)}</span>`:''}
        <span>Laboratory in-charge</span>
      </div>
      <div class="report-reviewer report-reviewer-authorizer ref-tech-block">
        <div class="ref-tech-sign-box">
          <div class="ref-tech-teal-bar"></div>
          <div class="ref-tech-labels">
            <strong class="ref-tech-title">Lab Technician</strong>
            <span class="ref-tech-sub">Technician Sign</span>
          </div>
        </div>
        <strong>${approved?text(authorizedName || 'Reviewer details not configured'):'Awaiting authorization'}</strong>
        ${approved&&profile.pathologistQualification?`<span>${escape(profile.pathologistQualification)}</span>`:''}
        <span>${approved?'Authorized reviewer':'Draft · not authorized'}</span>
        ${approved&&approvedByLabel?`<small>Approved by ${escape(approvedByLabel)}</small>`:''}
      </div>
    </section>`;
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
  return `<div class="report report-document report-theme-${template}" data-report-template="${template}">${pages.map((page,index)=>`<article class="report-page" aria-label="Report page ${index+1} of ${pages.length}">${watermarkSvg}<div class="molecular-lattice-tr" aria-hidden="true">${molecularLatticeSvg}</div><div class="molecular-lattice-bl" aria-hidden="true">${molecularLatticeSvg}</div>${mode?`<div class="report-status-ribbon ${draft?'report-status-draft':''}">${escape(mode)}</div>`:''}${letterhead(profile)}${patientDetails(order)}${warning?`<p class="report-data-warning">${escape(warning)}</p>`:''}<div class="report-document-title"><span>LABORATORY REPORT</span><b>${draft?'DRAFT':'RESULTS'}</b></div><main class="report-results-content">${page.sections.length?page.sections.map(section=>`<section class="report-test-section"><div class="report-test-heading"><span>${text(section.test.department)}</span><h3>${text(section.test.name)}${section.continued?' <small>(continued)</small>':''}</h3><div>Specimen: ${text(section.test.sample)}</div></div><table class="report-results-table"><colgroup><col style="width:43%"><col style="width:16%"><col style="width:17%"><col style="width:24%"></colgroup><thead><tr><th>TEST DESCRIPTION</th><th>RESULT</th><th>UNITS</th><th>BIOLOGICAL REFERENCE</th></tr></thead><tbody>${section.rows.map(row=>resultRow(row,section.code,order.sex)).join('')}</tbody></table></section>`).join(''):page.noteOnly?'':'<p class="report-no-results">No test results are available for this order.</p>'}</main>${page.notes!==null?`<section class="report-clinical-notes"><h4>Interpretation :${page.notesContinued?' (continued)':''}</h4><p>${escape(page.notes)}</p><small>H = above reference interval · L = below reference interval. Interpret results with clinical findings. Reference intervals require laboratory validation.</small></section>`:''}<div class="report-end-marker">****End Of The Report****</div>${page.signatures?signatures(order,profile):'<p class="report-continued-note">Report continued on the next page.</p>'}<footer class="report-page-footer"><div class="report-footer-rule"></div><div class="report-footer-row"><span>${text(order.id)}</span><strong>Page ${index+1} of ${pages.length}</strong><span>${index===pages.length-1?'End of report':'Continued'}</span></div>${profile.reportFooter?`<p>${escape(profile.reportFooter)}</p>`:'<p>Results relate only to the sample tested. Please correlate with clinical findings.</p>'}${profile.workingHours?`<p>Working hours: ${escape(profile.workingHours)}</p>`:''}</footer>${bottomBanner()}</article>`).join('')}</div>`;
}

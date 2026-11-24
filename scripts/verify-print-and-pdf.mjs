import { writeFile, mkdir, stat, readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { TESTS, PARAMETERS } from '../dist/catalog.js';
import { renderReport, REPORT_TEMPLATES } from '../dist/report.js';

const mockValues = {
  hb: 14.2, wbc: 7200, neutrophils: 62, lymphocytes: 28, eosinophils: 4,
  monocytes: 5, basophils: 1, platelets: 2.8, rbc: 4.6, hct: 42,
  mcv: 91.3, mch: 30.9, mchc: 33.8, rdw_cv: 13.1, rdw_sd: 42, bilirubin_total: 0.7,
  bilirubin_direct: 0.2, alt: 24, ast: 22, alp: 86, total_protein: 7.1,
  albumin: 4.2, urea: 28, creatinine: 0.9, uric_acid: 4.6,
  sodium: 139, potassium: 4.2, hba1c: 5.3, tsh: 2.1,
  cholesterol_total: 178, triglycerides: 118, hdl: 52, ldl: 92, vldl: 24,
  glucose_fasting: 92, glucose_postprandial: 124, t3_total: 124, t4_total: 8.6,
  esr: 12, crp: 2.1, calcium_total: 9.4, chloride: 103,
  serum_iron: 98, tibc: 320, transferrin_saturation: 30.6, vitamin_d_25oh: 38
};

function makeTestOrder(code) {
  const t = TESTS[code];
  return {
    id: `VERIFY-${code}`, patientId: 'PT-VERIFY', name: 'Test Patient',
    age: 40, sex: 'Female', phone: '', email: '', category: 'Walk-in',
    referrer: 'Self', tests: [code], priority: 'Routine', status: 'Approved',
    createdAt: '2026-11-14T08:00:00.000Z', updatedAt: '2026-11-14T14:30:00.000Z',
    approvedAt: '2026-11-14T14:30:00.000Z', amount: t.price, paid: t.price,
    paymentMethod: 'UPI', results: Object.fromEntries(t.parameters.map(k => [k, mockValues[k] ?? 10])),
    notes: ''
  };
}

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT_DIR = resolve(ROOT, 'work/pdf-verification');
await mkdir(OUT_DIR, { recursive: true });

const reportCss = await readFile(resolve(ROOT, 'dist/report.css'), 'utf8');

function wrapHtml(title, reportHtml) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<title></title>
<style>
${reportCss}
@page { size: A4 portrait; margin: 0; }
html, body { margin: 0 !important; padding: 0 !important; width: 210mm !important; height: 297mm !important; background: #ffffff !important; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
.report.report-document { width: 210mm !important; max-width: 210mm !important; margin: 0 !important; padding: 0 !important; background: #ffffff !important; }
.report-document .report-page { width: 210mm !important; max-width: 210mm !important; height: 297mm !important; min-height: 297mm !important; max-height: 297mm !important; margin: 0 !important; padding: 0 !important; border: 0 !important; box-shadow: none !important; display: flex !important; flex-direction: column !important; justify-content: flex-start !important; overflow: hidden !important; break-after: page !important; page-break-after: always !important; box-sizing: border-box !important; }
.report-document .report-page:last-child { break-after: auto !important; page-break-after: auto !important; }
</style>
</head>
<body>
${reportHtml}
</body>
</html>`;
}

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

const profile = {
  labName: 'Apex Precision Diagnostics',
  address: 'Plot 42, Hiranandani Business Park, Powai, Mumbai 400076',
  phone: '6361303305',
  email: 'reports@apexdiagnostics.in',
  registration: 'MAH-MUM-2024-NABL-0482',
  website: 'https://apexdiagnostics.in',
  labIncharge: 'Dr. Sunita Deshmukh, MSc, PhD',
  labInchargeQualification: 'Senior Biochemist & Quality Manager',
  pathologist: 'Dr. Anand Ramanathan, MD (Pathology)',
  pathologistQualification: 'Consultant Pathologist (Reg: MMC-2008/04/1234)',
  reportFooter: 'This report relates strictly to the sample received and tested. Quality controls verified. Correlate with clinical findings.',
  workingHours: 'Monday–Saturday: 7:00 AM – 9:00 PM | Sunday: 8:00 AM – 2:00 PM'
};

const scenarios = [
  {
    name: 'classic-cbc',
    title: 'Classic Layout - Complete Blood Count',
    template: 'classic',
    order: {
      ...makeTestOrder('CBC'),
      name: 'Mrs. Priya Venkateshwaran-Chatterjee',
      age: 42,
      sex: 'Female',
      patientId: 'PT-2026-004812',
      referrer: 'Dr. Rajeshwari Swaminathan, MD, DM (Hematology)',
      notes: 'Hb and RBC indices consistent with mild microcytic hypochromic picture. Recommend serum ferritin and iron studies.'
    }
  },
  {
    name: 'minimal-thyroid',
    title: 'Minimal Layout - Thyroid & Metabolic Profile',
    template: 'minimal',
    order: {
      ...makeTestOrder('THYROID_PROFILE'),
      name: 'Mr. Vikramaditya Harshavardhan Singhania',
      age: 58,
      sex: 'Male',
      patientId: 'PT-2026-009134',
      referrer: 'Dr. K. S. Murthy, MD (Endocrinology)',
      notes: 'Serum TSH elevated with borderline normal free thyroid hormones. Correlate with clinical symptoms and antibody titers.'
    }
  },
  {
    name: 'anand-fbs-single-page',
    title: 'Anand Laboratory - Fasting Blood Sugar (FBS)',
    template: 'classic',
    order: {
      id: 'BL-10011',
      patientId: 'PAT-94576',
      name: 'Mr Sumeet',
      age: 23,
      sex: 'Male',
      category: 'Walk-in',
      referrer: 'Dr. Rajesh Sharma',
      tests: ['FBS'],
      status: 'Approved',
      createdAt: '2026-11-22T03:42:00.000Z',
      collectedAt: '2026-11-22T03:42:00.000Z',
      receivedAt: '2026-11-22T03:42:00.000Z',
      approvedAt: '2026-11-22T03:43:00.000Z',
      approvedBy: 'usr-admin',
      approvedByName: 'Lab Technician',
      amount: 70,
      paid: 70,
      paymentMethod: 'Cash',
      results: { glucose_fasting: 118.0 },
      notes: 'Blood glucose level indicates impaired fasting glucose.'
    }
  },
  {
    name: 'sahara-all-15-panels-multipage',
    title: 'Sahara Layout - 15-Panel Multipage Comprehensive Health Check',
    template: 'sahara',
    order: {
      id: 'LF-COMPREHENSIVE-2026',
      patientId: 'PT-2026-007721',
      name: 'Col. Devendraprasad Raghunathrao Mohite-Patil (Retd.)',
      age: 67,
      sex: 'Male',
      category: 'Corporate Master Health Check',
      referrer: 'Dr. Meenakshi Sundaram, MD (Internal Medicine)',
      tests: Object.keys(TESTS),
      status: 'Approved',
      createdAt: '2026-11-14T08:00:00.000Z',
      collectedAt: '2026-11-14T08:15:00.000Z',
      receivedAt: '2026-11-14T08:45:00.000Z',
      approvedAt: '2026-11-14T14:30:00.000Z',
      approvedBy: 'usr-path-001',
      approvedByName: 'Dr. Anand Ramanathan, MD (Pathology)',
      amount: Object.values(TESTS).reduce((sum, t) => sum + t.price, 0),
      paid: Object.values(TESTS).reduce((sum, t) => sum + t.price, 0),
      paymentMethod: 'UPI',
      results: Object.assign({}, ...Object.keys(TESTS).map(c => makeTestOrder(c).results)),
      notes: 'Patient was fasting for 12 hours prior to collection. All parameters measured on calibrated automated analyzers.\nNo critical values encountered during routine processing.\nCorrelate lipid and glycemic parameters with dietary history and physical activity.\nFollow-up HbA1c recommended after 3 months.',
      resultsRevision: 1
    }
  }
];

const results = [];
for (const s of scenarios) {
  const htmlContent = wrapHtml(s.title, renderReport(s.order, profile, { template: s.template, demo: false }));
  const htmlPath = resolve(OUT_DIR, `${s.name}.html`);
  const pdfPath = resolve(OUT_DIR, `${s.name}.pdf`);
  await writeFile(htmlPath, htmlContent, 'utf8');

  // Generate real PDF with Chrome headless
  const proc = spawnSync(chromePath, [
    '--headless',
    '--disable-gpu',
    '--no-sandbox',
    '--no-pdf-header-footer',
    `--print-to-pdf=${pdfPath}`,
    htmlPath
  ], { encoding: 'utf8', timeout: 30000 });

  let pdfSize = 0;
  try {
    const s = await stat(pdfPath);
    pdfSize = s.size;
  } catch {}

  results.push({
    scenario: s.name,
    template: s.template,
    htmlFile: htmlPath,
    pdfFile: pdfPath,
    pdfSizeBytes: pdfSize,
    success: pdfSize > 5000
  });
}

console.log(JSON.stringify(results, null, 2));

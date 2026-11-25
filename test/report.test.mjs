import assert from 'node:assert/strict';
import { TESTS, PARAMETERS } from '../dist/catalog.js';
import { REPORT_TEMPLATES, renderReport } from '../dist/report.js';

const testResults = {
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

function makeTestOrder(code = 'CBC') {
  const test = TESTS[code];
  const now = Date.now();
  const approvedAt = new Date(now - 5 * 60000).toISOString();
  const results = Object.fromEntries(test.parameters.map(key => [key, testResults[key]]));
  if (code === 'CBC') Object.assign(results, {
    hb: 15, wbc: 5100, neutrophils: 79,
    lymphocytes: 18, eosinophils: 1, monocytes: 1, basophils: 1,
    platelets: 3.5, rbc: 5, hct: 42, mcv: 84, mch: 30, mchc: 35.7
  });
  return {
    id: `TEST-${code}`, patientId: 'TEST-PATIENT', name: 'Aarav Mehta',
    age: 35, sex: 'Male', phone: '', email: '', category: 'Walk-in',
    referrer: 'Referring clinician', tests: [code], priority: 'Routine',
    status: 'Approved', createdAt: new Date(now - 90 * 60000).toISOString(),
    updatedAt: approvedAt, approvedAt, amount: test.price, paid: test.price,
    paymentMethod: 'UPI', results, notes: 'Laboratory test notes.', version: 1,
    demo: true
  };
}

const profile = { labName: 'Example Diagnostics', address: 'Example address', phone: '+91 00000 00000', email: 'example@example.test', registration: 'EX-100', labIncharge: 'Example technician', labInchargeQualification: 'DMLT', pathologist: 'Example reviewer', pathologistQualification: 'MD (Pathology)', reportFooter: 'Please correlate clinically.', workingHours: '9 am–6 pm' };
const count = (text, pattern) => [...text.matchAll(pattern)].length;
for (const code of Object.keys(TESTS)) {
  const order = makeTestOrder(code);
  for (const template of REPORT_TEMPLATES) {
    const html = renderReport(order, profile, { template: template.id, preview: true });
    assert(html.includes(`report-theme-${template.id}`));
    assert(html.includes('SAMPLE REPORT'));
    assert(html.includes(order.name));
    assert.equal(count(html, /class="report-result-row /g), TESTS[code].parameters.length, `${code} must display every ordered result`);
    for (const key of TESTS[code].parameters) assert(html.includes(`data-parameter="${key}"`));
    assert(html.includes('Page 1 of 1'));
  }
}
const sample = makeTestOrder('CBC');
const before = JSON.stringify(sample);
const escaped = renderReport({ ...sample, name: '<img src=x onerror=alert(1)>', notes: '<script>bad()</script>' }, { ...profile, labName: 'Lab <script>bad()</script>' });
assert(!escaped.includes('<script>'));
assert(!escaped.includes('<img src='));
assert(escaped.includes('&lt;script&gt;'));
assert.equal(JSON.stringify(sample), before, 'rendering must never mutate a clinical record');

const noValues = renderReport({ ...sample, results: { hb: 0, wbc: null } }, profile);
assert.match(noValues, /<td class="report-result-value">0<span/, 'a measured zero must be retained and flagged');
assert.match(noValues, /data-parameter="wbc"><td>[^<]+<\/td><td class="report-result-value">—<\/td>/, 'missing result must display a dash, never zero');
const highLow = renderReport({ ...sample, results: { hb: 1, wbc: 100000 } }, profile);
assert(highLow.includes('Below reference range'));
assert(highLow.includes('Above reference range'));

const frozen = renderReport({ ...sample, reportSnapshot: { ...profile, labName: 'Original approved laboratory', reportTemplate: 'sahara' } }, { ...profile, labName: 'New laboratory' });
assert(frozen.includes('Original approved laboratory'));
assert(!frozen.includes('New laboratory'));
assert(frozen.includes('report-theme-sahara'));
assert(renderReport({ ...sample, reportSnapshot: { ...profile, reportTemplate: 'sahara' } }, profile, { template: 'minimal' }).includes('report-theme-minimal'));
assert(renderReport(sample, profile, { template: '<script>' }).includes('report-theme-classic'));
assert(renderReport({ ...sample, status: 'Review', sampleReport: false, demo: false }, profile).includes('DRAFT REPORT'));

const codes = Object.keys(TESTS);
const combined = { ...sample, tests: codes, results: Object.assign({}, ...codes.map(code => makeTestOrder(code).results)) };
const multipage = renderReport(combined, profile);
const pageCount = count(multipage, /<article class="report-page"/g);
assert(pageCount > 1, '15 panels must paginate');
for (let page = 1; page <= pageCount; page++) assert(multipage.includes(`Page ${page} of ${pageCount}`));
assert.equal(count(multipage, /class="report-result-row /g), codes.reduce((sum, code) => sum + TESTS[code].parameters.length, 0), 'pagination must not omit or duplicate results');
assert.equal(count(multipage, /class="report-brand"/g), pageCount, 'every page must repeat laboratory identity');
assert.equal(count(multipage, /class="report-patient-block"/g), pageCount, 'every page must repeat patient identity');
console.log(`PASS: ${codes.length} test panels × 3 templates, result completeness, escaping, zero/missing values, flags, frozen profiles, draft status, and ${pageCount}-page combined report.`);
const manyNotes = Array.from({ length: 90 }, (_, i) => `Clinical note line ${i + 1}.`).join('\n');
const noteReport = renderReport({ ...sample, notes: manyNotes }, profile);
assert(count(noteReport, /<article class="report-page"/g) > 1, 'long notes require their own numbered pages');
for (const line of manyNotes.split('\n')) assert(noteReport.includes(line), 'all clinical note text must be preserved');
const denseOrder = { ...sample, tests: ['CBC', 'THYROID_PROFILE'], results: { ...makeTestOrder('CBC').results, ...makeTestOrder('THYROID_PROFILE').results }, notes: 'Concise clinical note.' };
const denseReport = renderReport(denseOrder, profile);
assert.equal(count(denseReport, /<article class="report-page"/g), 2, 'a dense last results page must reserve a completion page for notes and reviewers');
const longProse = 'Review together with the relevant clinical information. '.repeat(12);
const proseReport = renderReport({ ...sample, notes: longProse }, profile);
assert(count(proseReport, /<article class="report-page"/g) > 1, 'notes over300 characters must receive their own completion pages');

// Released reports retain their exact historical rows, units and reference ranges.
const archivedParameters = Object.fromEntries(TESTS.CBC.parameters.slice(0, 13).map(key => [key, { ...PARAMETERS[key] }]));
archivedParameters.hb = { ...archivedParameters.hb, unit: 'ARCHIVED-UNIT', reference: 'ARCHIVED-RANGE', min: 1, max: 99 };
const archived = { ...sample, sampleReport: false, demo: false, catalogSnapshot: { tests: { CBC: { ...TESTS.CBC, parameters: TESTS.CBC.parameters.slice(0, 13) } }, parameters: archivedParameters }, results: Object.fromEntries(TESTS.CBC.parameters.slice(0, 13).map(key => [key, sample.results[key]])) };
const archiveHtml = renderReport(archived, profile);
assert(archiveHtml.includes('ARCHIVED-UNIT'));
assert(archiveHtml.includes('ARCHIVED-RANGE'));
assert.equal(count(archiveHtml, /class="report-result-row /g), 13, 'new live CBC analytes must not be added to a released report');
assert(!archiveHtml.includes('data-parameter="rdw_cv"'));
assert(!archiveHtml.includes('Historical report:'));

for (const invalid of [' ', false, true, [], {}, '0x10', 'NaN', 'Infinity']) {
  const html = renderReport({ ...sample, results: { hb: invalid } }, profile);
  assert.match(html, /data-parameter="hb"><td>[^<]+<\/td><td class="report-result-value">—<\/td>/, `${String(invalid)} must not become a measured result`);
}
const draftDemo = renderReport({ ...sample, status: 'Processing' }, profile, { demo: true, preview: true });
assert(draftDemo.includes('DRAFT REPORT'), 'demo and sample ribbons must still identify a draft');
assert(draftDemo.includes('Draft · not authorized'));
assert(!draftDemo.includes('Approved by'));
const legacyDate = renderReport({ ...archived, approvedAt: null, updatedAt: '2026-12-31T12:00:00Z' }, profile);
assert.match(legacyDate, /<dt>Reported<\/dt><dd>Not recorded<\/dd>/, 'billing time must never stand in for an unknown approval time');
const missingPanel = renderReport({ ...sample, tests: ['REMOVED_PANEL'], results: { historical_assay: 'Detected' } }, profile);
assert(missingPanel.includes('REMOVED_PANEL · definition unavailable'));
assert(missingPanel.includes('Additional recorded results'));
assert(missingPanel.includes('Detected'), 'recorded orphan result text must be retained');
assert(missingPanel.includes('Not captured'));
const missingParameter = renderReport({ ...archived, catalogSnapshot: { tests: { CBC: { ...TESTS.CBC, parameters: ['removed_parameter'] } }, parameters: {} }, results: { removed_parameter: 12 } }, profile);
assert(missingParameter.includes('removed_parameter'));
assert(missingParameter.includes('Definition not captured'));
assert(missingParameter.includes('>12</td>'));
const duplicateCode = renderReport({ ...sample, tests: ['CBC', 'CBC'] }, profile);
assert.equal(count(duplicateCode, /class="report-result-row /g), TESTS.CBC.parameters.length, 'duplicate order codes must not repeat a panel');
const shared = renderReport({ ...sample, tests: ['FBS', 'PPBS'], results: { ...makeTestOrder('PPBS').results } }, profile);
assert(shared.includes('data-test="FBS"'));
assert(shared.includes('data-test="PPBS"'), 'a shared analyte remains identifiable within its panel');
const longProfile = { ...profile, labName: 'Long laboratory name '.repeat(9), address: 'Long laboratory address '.repeat(20), website: 'https://example.test/'.repeat(20), reportFooter: 'Laboratory footer information. '.repeat(16), pathologist: 'Reviewer Name '.repeat(12), pathologistQualification: 'Qualification '.repeat(12) };
const maximum = renderReport({ ...combined, notes: manyNotes }, longProfile, { template: 'sahara' });
assert(count(maximum, /<article class="report-page"/g) > pageCount, 'long metadata must reduce available result space');
assert.equal(count(maximum, /class="report-result-row /g), codes.reduce((sum, code) => sum + TESTS[code].parameters.length, 0));
for (const line of manyNotes.split('\n')) assert(maximum.includes(line));
assert.equal(count(maximum, /class="report-reviewers"/g), 1, 'the authorization block occurs exactly once');

const hbOrderMale = { ...makeTestOrder('HB'), sex: 'Male', results: { hb: 12.8 } };
const hbHtmlMale = renderReport(hbOrderMale, profile);
assert(hbHtmlMale.includes('Hemoglobin (Hb)'));
assert(hbHtmlMale.includes('EDTA Whole Blood'));
assert(hbHtmlMale.includes('Photometric Method (SLS / Cyanmethemoglobin)'));
assert(hbHtmlMale.includes('13.5 – 17.5'));
assert(hbHtmlMale.includes('Below reference range'), 'Male Hb 12.8 g/dL must flag L against 13.5 - 17.5');
assert(hbHtmlMale.includes('Page 1 of 1'));

const hbHtmlFemaleHigh = renderReport({ ...makeTestOrder('HB'), sex: 'Female', results: { hb: 16.2 } }, profile);
assert(hbHtmlFemaleHigh.includes('12.0 – 15.5'));
assert(hbHtmlFemaleHigh.includes('Above reference range'), 'Female Hb 16.2 g/dL must flag H against 12.0 - 15.5');

const hbHtmlFemaleNormal = renderReport({ ...makeTestOrder('HB'), sex: 'Female', results: { hb: 13.0 } }, profile);
assert(!hbHtmlFemaleNormal.includes('report-abnormal'), 'Female Hb 13.0 g/dL must be normal without flags');

console.log('PASS: archived catalog definitions, strict numeric results, draft labels, immutable report date, missing definitions, duplicate panel identity, standalone HB, and long metadata pagination.');

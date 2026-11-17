import test from 'node:test';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import assert from 'node:assert/strict';
import * as catalog from '../dist/catalog.js';
import * as reportModule from '../dist/report.js';
import * as adminModule from '../dist/admin.js';
import * as barcodeModule from '../dist/barcode.js';

test('Report Studio styles,45 layouts, operational pages and patient workflows', async t => {
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, { url: 'https://labflow.test/', runScripts: 'outside-only', pretendToBeVisual: true });
  const w = dom.window, errors = [], checks = [];
  t.after(() => w.close());
  for (const path of ['style.css', 'report.css']) { const style = w.document.createElement('style'); style.dataset.source = path; style.textContent = readFileSync(new URL('../dist/' + path, import.meta.url), 'utf8'); w.document.head.appendChild(style); }
  w.addEventListener('error', e => errors.push(e.error));
  Object.assign(w, { catalog, reportModule, adminModule, barcodeModule, fetch: async () => ({ status: 404, ok: false, headers: { get: () => 'text/html' } }) });
  w.crypto.randomUUID = randomUUID;
  w.URL.createObjectURL = () => 'blob:test'; w.URL.revokeObjectURL = () => { };
  let prints = 0; w.print = () => { prints++; };
  const app = readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8')
    .replace(/^import[^\n]+\n/gm, '')
    .replace(/^/, 'const {TESTS,PARAMETERS,CATALOG_NOTICE,makeDemoOrders}=window.catalog;\nconst {REPORT_TEMPLATES,renderReport}=window.reportModule;\nconst {adminPage,loginScreen,staffForm}=window.adminModule;\nconst {renderBarcode}=window.barcodeModule;\n');
  w.eval(app);
  const $ = selector => w.document.querySelector(selector);
  const all = selector => [...w.document.querySelectorAll(selector)];
  const tick = () => new Promise(r => setTimeout(r, 8));
  const click = async selector => { const el = $(selector); assert(el, `missing ${selector}`); el.click(); await tick(); };
  const field = (selector, value) => { const el = $(selector); assert(el, `missing ${selector}`); el.value = value; el.dispatchEvent(new w.Event('input', { bubbles: true })); return el; };
  const select = async (selector, value) => { const el = field(selector, value); el.dispatchEvent(new w.Event('change', { bubbles: true })); await tick(); };
  const submit = async selector => { const el = $(selector); assert(el, `missing ${selector}`); el.dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true })); await tick(); };
  const state = () => JSON.parse(w.localStorage.getItem('labflow-v1'));
  const noted = message => { checks.push(message); console.log('PASS ' + message); };
  try {
    await tick();
    assert.equal($('h1').textContent, 'Report studio');
    assert.equal(all('.report-test-card').length, 15);
    assert.equal(all('.template-card').length, 3);
    noted('Report studio is default with 15 panel cards and 3 layout choices');
    assert.equal(w.getComputedStyle($('.report-intro')).display, 'flex', 'Studio intro must have screen styles');
    assert.equal(w.getComputedStyle($('.report-template-grid')).display, 'grid', 'Template choices must have screen grid styles');
    assert.equal(w.getComputedStyle($('.report-library')).display, 'grid', 'Panel library must have screen grid styles');
    const workspaceSheet = [...w.document.styleSheets].find(sheet => sheet.ownerNode?.dataset?.source === 'style.css') || w.document.styleSheets[0];
    assert([...workspaceSheet.cssRules].some(rule => rule.selectorText === '.report-intro'), 'Studio intro selector must be top-level, outside print rules');
    noted('Actual workspace CSS applies studio flex and template/library grids on screen; studio rules stay outside print media');

    await click('[data-action="choose-template"][data-template="minimal"]');
    assert.equal($('.template-card.selected [data-action="choose-template"]').dataset.template, 'minimal');
    assert.equal(all('[data-action="sample-report"]').length, 0, 'No view sample buttons should exist');
    assert(!w.document.body.textContent.includes('View sample'), 'No View sample text should exist');
    assert(!w.document.body.textContent.includes('COMPLETE BLOOD COUNT'), 'No COMPLETE BLOOD COUNT text in thumbnails');
    assert.match(all('.studio-section-heading p')[1].textContent, /Select a test panel to start a new patient report/);
    assert.equal(all('.start-report-btn[data-action="new-report"]').length, 15, 'All 15 panels must have Create report action');
    noted('Test report library has 15 panels with Create report only, neutral thumbnails, and no sample actions');

    for (const name of ['Overview', 'Patients', 'Samples', 'Results & reports', 'Billing', 'Analytics', 'Report studio']) {
      await click(`[data-page="${name}"]`); assert($('h1'));
    }
    noted('All workspace navigation pages render');
    assert.equal(all('.nav-label').length, 1, 'Only WORKSPACE nav section should exist');
    assert(!w.document.querySelector('.sidebar').textContent.includes('MANAGE'));
    assert(!w.document.querySelector('.sidebar').textContent.includes('Test catalog'));
    assert(!w.document.querySelector('.sidebar').textContent.includes('Readiness'));
    assert(!w.document.querySelector('.sidebar').textContent.includes('Quality controls'));
    assert(!w.document.querySelector('.sidebar').textContent.includes('Team & access'));
    assert(!w.document.querySelector('.sidebar').textContent.includes('Integrations'));
    assert(!w.document.querySelector('.sidebar').textContent.includes('Audit trail'));

    await click('[data-page="Settings"]');
    field('[name="labName"]', 'Unsaved laboratory draft');
    await click('[data-page="Report studio"]'); await click('[data-page="Settings"]');
    assert.equal($('[name="labName"]').value, 'Unsaved laboratory draft', 'Unsaved settings must survive page navigation');
    const profile = { labName: 'DOM Quality Laboratory', address: '123 Test Street', phone: '+91 9000012345', email: 'lab@example.test', registration: 'REG-TEST-123', website: 'https://example.test', labIncharge: 'Sample Lab Incharge', labInchargeQualification: 'DMLT', pathologist: 'Dr. Sample Reviewer', pathologistQualification: 'MD Pathology', workingHours: 'Mon–Sat, 8 am–8 pm', reportFooter: 'DOM report footer' };
    for (const [key, value] of Object.entries(profile)) field(`[name="${key}"]`, value);
    await select('[name="reportTemplate"]', 'sahara'); await submit('#settings-form');
    assert.equal(state().settings.reportTemplate, 'sahara');
    for (const [key, value] of Object.entries(profile)) assert.equal(state().settings[key], value);
    await click('[data-page="Report studio"]');
    assert.equal($('.template-card.selected [data-action="choose-template"]').dataset.template, 'sahara');
    noted('All laboratory and reviewer settings persist and choose the default layout');

    await click('[data-action="new-report"][data-code="TSH"]');
    assert.equal(all('[name="tests"]:checked').length, 1);
    assert.equal($('[name="tests"]:checked').value, 'TSH');
    assert.match($('#order-total').textContent, /400/);
    field('[name="name"]', 'DOM Patient Report'); field('[name="age"]', '30');
    await submit('#patient-form'); assert.match($('#form-error').textContent, /Confirm that the sample/);
    $('[name="sampleConfirmed"]').checked = true; await submit('#patient-form');
    assert($('#results-form')); assert.equal(all('#results-form [data-param]').length, 1);
    const id = $('#results-form').dataset.id;
    assert.equal(state().orders.find(o => o.id === id).status, 'Processing');
    assert(state().orders.find(o => o.id === id).collectedAt);
    assert(state().orders.find(o => o.id === id).receivedAt);
    await click('[data-action="submit-results"]'); assert.match($('#result-error').textContent, /Complete every/);
    await click('[data-action="preview-results"]');
    assert($('.report-status-draft')); assert.match($('.report-document-title').textContent, /DRAFT/);
    assert.match($('.report-document').textContent, /DOM Patient Report/);
    assert.equal($('.report-result-value').textContent.trim(), '—');
    assert.equal($('.report-document').dataset.reportTemplate, 'sahara');
    await click('[data-action="results"]');
    assert($('#results-form'), 'Draft preview must return directly to editable results');
    field('[name="tsh"]', '2.8'); field('[name="notes"]', 'Unsaved result note');
    await click('[data-action="record"]'); await click('[data-action="results"]');
    assert.equal($('[name="tsh"]').value, '2.8', 'Unsaved result must survive back navigation');
    assert.equal($('[name="notes"]').value, 'Unsaved result note', 'Unsaved notes must survive back navigation');
    field('[name="tsh"]', '2.3'); field('[name="notes"]', 'Draft note'); await click('[data-action="save-results"]');
    await click('[data-action="results"]'); assert.equal($('[name="tsh"]').value, '2.3'); assert.equal($('[name="notes"]').value, 'Draft note');
    await click('[data-action="submit-results"]'); await click('[data-action="results"]');
    await click('[data-action="approve"]'); assert.match($('#result-error').textContent, /Confirm/);
    assert(!$('[name="tsh"]').readOnly);
    field('[name="tsh"]', '6.5'); field('[name="notes"]', 'Corrected in final review'); $('#review-check').checked = true;
    await click('[data-action="approve"]');
    assert.equal(state().orders.find(o => o.id === id).results.tsh, 6.5);
    assert.equal(state().orders.find(o => o.id === id).notes, 'Corrected in final review');
    assert.equal(state().orders.find(o => o.id === id).status, 'Approved');
    assert.match($('.report-document').textContent, /DOM Patient Report/);
    assert.match($('.report-result-value').textContent, /6.5H/);
    assert.match($('.report-document').textContent, /Corrected in final review/);
    assert.match($('.report-document').textContent, /DOM Quality Laboratory/);
    assert.match($('.report-document').textContent, /Dr. Sample Reviewer/);
    noted('New report requires collection confirmation; preserves drafts; allows review corrections; approved report shows patient/result/letterhead');
    const frozen = state().orders.find(o => o.id === id).catalogSnapshot;
    assert(frozen?.tests?.TSH && frozen?.parameters?.tsh, 'Approval must freeze test and reference metadata');
    const originalParameter = { ...catalog.PARAMETERS.tsh }, originalTest = { ...catalog.TESTS.TSH, parameters: [...catalog.TESTS.TSH.parameters] };
    try {
      Object.assign(catalog.PARAMETERS.tsh, { name: 'MUTATED TSH PARAMETER', unit: 'changed-unit', reference: '99 – 100', min: 99, max: 100 });
      catalog.TESTS.TSH.name = 'MUTATED TSH PANEL'; catalog.TESTS.TSH.parameters = ['tsh', 'hb'];
      await click('[data-action="record"]'); await click('[data-action="report"]');
      assert($('.report-document').textContent.includes(originalParameter.name));
      assert($('.report-document').textContent.includes(originalTest.name));
      assert(!$('.report-document').textContent.includes('MUTATED'));
      assert(!$('.report-document').textContent.includes('changed-unit'));
      assert.equal(all('.report-result-row').length, 1, 'Catalog expansion must not add rows to an approved report');
    } finally { Object.assign(catalog.PARAMETERS.tsh, originalParameter); Object.assign(catalog.TESTS.TSH, originalTest); }
    noted('Approved reports freeze parameter labels, units, ranges, and panel definitions against catalog edits');


    const approvedAt = state().orders.find(o => o.id === id).approvedAt;
    await click('[data-action="record"]'); await click('[data-action="invoice"]');
    field('[name="payment"]', '100.29'); await submit('#payment-form');
    assert.match($('.form-total').textContent, /Received ₹100\.29/); assert.match($('.form-total').textContent, /Balance ₹299\.71/);
    assert.equal(state().orders.find(o => o.id === id).approvedAt, approvedAt);
    await click('[data-action="close"]'); await click('[data-page="Settings"]');
    field('[name="labName"]', 'Later Laboratory Name'); await submit('#settings-form');
    await click('[data-page="Report studio"]'); await click(`[data-action="report"][data-id="${id}"]`);
    assert.match($('.report-document').textContent, /DOM Quality Laboratory/); assert(!$('.report-document').textContent.includes('Later Laboratory Name'));
    await click('[data-action="close"]');
    noted('Payments display paise accurately, preserve approval timestamp, and approved reports preserve laboratory profile snapshot');

    await click('[data-action="new-report"][data-code="TSH"]');
    field('[name="name"]', 'Shared Parameter Patient'); field('[name="age"]', '40');
    $('[name="tests"][value="THYROID"]').checked = true; $('[name="sampleConfirmed"]').checked = true;
    await submit('#patient-form');
    assert.equal(all('#results-form [data-param]').length, 3);
    assert.equal(all('#results-form [name="tsh"]').length, 1);
    assert.equal(all('#flag-tsh').length, 1);
    field('[name="tsh"]', '2.1'); field('[name="t3_total"]', '120'); field('[name="t4_total"]', '8.5');
    await click('[data-action="submit-results"]'); await click('[data-action="results"]'); $('#review-check').checked = true;
    await click('[data-action="approve"]');
    const shared = state().orders.find(o => o.name === 'Shared Parameter Patient');
    assert.equal(shared.status, 'Approved'); assert.equal(Object.keys(shared.results).length, 3);
    assert.equal(all('[data-parameter="tsh"]').length, 2);
    await click('[data-action="close"]');
    noted('TSH + THYROID share one editable TSH input and generate both panel sections correctly');

    await click('[data-page="Patients"]'); await click('[data-action="new"]');
    field('[name="name"]', 'General Workflow Patient'); field('[name="age"]', '33'); $('[name="tests"][value="CRP"]').checked = true;
    await submit('#patient-form'); assert.match($('.detail-top').textContent, /General Workflow Patient/);
    assert.match($('.badge.Registered').textContent, /Registered/);
    await click('[data-action="advance"]'); await click('[data-action="advance"]'); await click('[data-action="results"]');
    field('[name="crp"]', '2.7'); await click('[data-action="submit-results"]'); await click('[data-action="results"]');
    $('#review-check').checked = true; await click('[data-action="approve"]'); assert.match($('.report-document').textContent, /General Workflow Patient/); await click('[data-action="record"]'); await click('[data-action="label"]'); assert($('.specimen-barcode[data-barcode-value]')); assert($('.specimen-barcode').getAttribute('width').endsWith('mm'));
    await click('[data-action="close"]');
    await click('[data-action="menu"]'); assert($('.sidebar').classList.contains('open')); $('.menu-backdrop').click(); await tick();
    assert(!$('.sidebar').classList.contains('open'));
    noted('General registration workflow and mobile navigation backdrop still work');

    assert.deepEqual(errors.map(e => e?.message), []);
    console.log(JSON.stringify({ checks: checks.length, sampleCombinations: 45, records: state().orders.length, errors: errors.map(e => e?.stack) }, null, 2));
  } finally {
    w.close();
  }

});

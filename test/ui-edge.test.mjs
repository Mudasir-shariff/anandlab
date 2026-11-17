import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import * as catalog from '../dist/catalog.js';
import * as reportModule from '../dist/report.js';
import * as adminModule from '../dist/admin.js';
import * as barcodeModule from '../dist/barcode.js';
const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
const app = readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8').replace(/^import[^\n]+\n/gm, '').replace(/^/, 'const {TESTS,PARAMETERS,CATALOG_NOTICE,makeDemoOrders}=window.catalog;\nconst {REPORT_TEMPLATES,renderReport}=window.reportModule;\nconst {adminPage,loginScreen,staffForm}=window.adminModule;\nconst {renderBarcode}=window.barcodeModule;\n');
const tick = () => new Promise(r => setTimeout(r, 10));
const response = (data, status = 200) => ({ status, ok: status >= 200 && status < 300, headers: { get: () => 'application/json' }, json: async () => structuredClone(data) });
async function setup({ fetch, storage } = {}) {
    const dom = new JSDOM(html, { url: 'https://labflow.test/', runScripts: 'outside-only', pretendToBeVisual: true }); const w = dom.window;
    Object.assign(w, { catalog, reportModule, adminModule, barcodeModule, fetch: fetch || (async () => response({ error: 'missing' }, 404)) }); w.crypto.randomUUID = randomUUID; w.print = () => { };
    if (storage) w.localStorage.setItem('labflow-v1', JSON.stringify(storage));
    const errors = []; w.addEventListener('error', e => errors.push(e.error)); w.eval(app); await tick();
    const $ = s => w.document.querySelector(s), all = s => [...w.document.querySelectorAll(s)];
    const click = async s => { const el = $(s); if (!el) throw Error('missing ' + s); el.click(); await tick(); };
    const field = (s, v) => { const el = $(s); if (!el) throw Error('missing ' + s); el.value = v; el.dispatchEvent(new w.Event('input', { bubbles: true })); return el; };
    const submit = async (s) => { const event = new w.Event('submit', { bubbles: true, cancelable: true }); $(s).dispatchEvent(event); await tick(); return event; };
    const state = () => JSON.parse(w.localStorage.getItem('labflow-v1'));
    return { w, $, all, click, field, submit, state, errors, close: () => w.close() };
}
const output = [];
{
    const h = await setup(); try {
        await h.click('[data-action="new-report"][data-code="TSH"]'); h.field('[name="name"]', 'Blank Age'); h.$('[name="sampleConfirmed"]').checked = true;
        const nativeValid = h.$('#patient-form').checkValidity(); await h.submit('#patient-form');
        output.push({ case: 'blank age programmatic submit', nativeValid, created: h.state()?.orders.some(o => o.name === 'Blank Age'), age: h.state()?.orders.find(o => o.name === 'Blank Age')?.age });
        if (!h.$('#results-form') && h.$('#patient-form')) { h.field('[name="age"]', '35'); await h.submit('#patient-form'); }
        if (h.$('#results-form')) { const event = await h.submit('#results-form'); output.push({ case: 'results Enter/submit', defaultPrevented: event.defaultPrevented }); }
    } finally { h.close(); }
}
{
    const h = await setup(); try {
        await h.click('[data-action="new-report"][data-code="TSH"]'); h.field('[name="name"]', 'Bad Phone'); h.field('[name="age"]', '45'); h.field('[name="phone"]', 'this is not a phone'); h.$('[name="sampleConfirmed"]').checked = true;
        const nativeValid = h.$('#patient-form').checkValidity(); await h.submit('#patient-form'); output.push({ case: 'invalid phone native-valid form', nativeValid, created: h.state()?.orders.some(o => o.name === 'Bad Phone') });
    } finally { h.close(); }
}
{
    const h = await setup(); try {
        await h.click('[data-action="new-report"][data-code="TSH"]'); h.field('[name="name"]', 'Duplicate Submit'); h.field('[name="age"]', '45'); h.$('[name="sampleConfirmed"]').checked = true;
        const form = h.$('#patient-form'); form.dispatchEvent(new h.w.Event('submit', { bubbles: true, cancelable: true })); form.dispatchEvent(new h.w.Event('submit', { bubbles: true, cancelable: true })); await tick(); await tick();
        output.push({ case: 'same form double submit', count: h.state().orders.filter(o => o.name === 'Duplicate Submit').length });
    } finally { h.close(); }
}
{
    let rows = [], putCount = 0, postCount = 0;
    const fetch = async (url, opts = {}) => {
        if (url === '/api/health') return response({ ok: true }); if (url === '/api/session') return response({ "user": { "id": "test-admin", "username": "test.admin", "displayName": "Test administrator", "role": "admin" }, "permissions": ["orders:read", "orders:create", "orders:update", "samples:write", "workflow:process", "results:write", "reports:approve", "billing:write", "settings:write", "users:manage", "backup:read", "integrations:manage", "audit:read", "quality:manage"] }); if (url === '/api/state') return response({ orders: rows, activity: [], settings: {} });
        if (url === '/api/orders' && opts.method === 'POST') { postCount++; const o = { ...JSON.parse(opts.body), version: 1 }; rows.unshift(o); return response({ order: o }, 201); }
        if (url.startsWith('/api/orders/') && opts.method === 'PUT') { putCount++; if (putCount === 1) return response({ error: 'Injected collection failure' }, 500); const o = { ...JSON.parse(opts.body), version: 2 }; rows = rows.map(x => x.id === o.id ? o : x); return response({ order: o }); }
        return response({ error: 'unknown' }, 404);
    };
    const h = await setup({ fetch }); try {
        await h.click('[data-action="new-report"][data-code="TSH"]'); h.field('[name="name"]', 'Partial Save'); h.field('[name="age"]', '45'); h.$('[name="sampleConfirmed"]').checked = true;
        await h.submit('#patient-form'); const afterFail = { formStillOpen: !!h.$('#patient-form'), rows: rows.length, status: rows[0]?.status, toast: h.$('#toast').textContent };
        if (h.$('#patient-form')) await h.submit('#patient-form'); output.push({ case: 'new report partial failure retry', afterFail, rowsAfterRetry: rows.length, postCount });
    } finally { h.close(); }
}
{
    const h = await setup(); try {
        await h.click('[data-action="new-report"]'); h.field('[name="name"]', 'All Tests'); h.field('[name="age"]', '45'); for (const el of h.all('[name="tests"]')) el.checked = true; h.$('[name="sampleConfirmed"]').checked = true;
        await h.submit('#patient-form'); const inputCount = h.all('[data-param]').length;
        for (const key of Object.keys(catalog.PARAMETERS)) h.field(`[data-param="${key}"]`, '10');
        await h.click('[data-action="submit-results"]'); await h.click('[data-action="results"]'); h.$('#review-check').checked = true; await h.click('[data-action="approve"]');
        output.push({ case: 'all15 selected', inputCount, expectedUnique: Object.keys(catalog.PARAMETERS).length, reportPages: h.all('.report-page').length, reportRows: h.all('.report-result-row').length, storedStatus: h.state().orders.find(o => o.name === 'All Tests')?.status });
    } finally { h.close(); }
}
{
    const orders = catalog.makeDemoOrders(); const legacy = orders.find(o => o.status === 'Approved'); legacy.tests = ['CBC']; legacy.results = { hb: 12, wbc: 5000 };
    const h = await setup({ storage: { orders, settings: {}, activity: [] } }); try {
        await h.click(`[data-action="report"][data-id="${legacy.id}"]`); output.push({ case: 'legacy approved CBC missing results', ribbon: h.$('.report-status-ribbon')?.textContent, title: h.$('.report-document-title')?.textContent, missingRows: h.all('.report-result-value').filter(el => el.textContent.trim() === '—').length });
    } finally { h.close(); }
}

{
    let remote = { id: 'LF-STALE', patientId: 'PT-STALE', name: 'Conflict Patient', age: 35, sex: 'Male', tests: ['TSH'], priority: 'Routine', status: 'Processing', version: 1, results: { tsh: 2.1 }, demo: false, sampleReport: false, amount: 400, paid: 0 };
    delete remote.reportSnapshot; delete remote.approvedAt;
    let puts = 0, reads = 0;
    const fetch = async (url, opts = {}) => {
        if (url === '/api/health') return response({ ok: true }); if (url === '/api/session') return response({ "user": { "id": "test-admin", "username": "test.admin", "displayName": "Test administrator", "role": "admin" }, "permissions": ["orders:read", "orders:create", "orders:update", "samples:write", "workflow:process", "results:write", "reports:approve", "billing:write", "settings:write", "users:manage", "backup:read", "integrations:manage", "audit:read", "quality:manage"] });
        if (url === '/api/state') { reads++; return response({ orders: [remote], activity: [], settings: {} }); }
        if (url === '/api/orders/LF-STALE' && opts.method === 'PUT') { puts++; const input = JSON.parse(opts.body); if (input.expectedVersion !== remote.version) return response({ error: 'Changed remotely' }, 409); remote = { ...input, version: remote.version + 1 }; return response({ order: remote }); }
        return response({ error: 'unknown' }, 404);
    };
    const h = await setup({ fetch }); try {
        await h.click('[data-action="results"][data-id="LF-STALE"]'); h.field('[name="tsh"]', '2.9');
        remote = { ...remote, version: 2, results: { tsh: 3.3 } };
        await h.click('[data-action="save-results"]');
        const typedRetained = h.$('[name="tsh"]')?.value === '2.9', reloadAvailable = !!h.$('[data-action="reload-results"]');
        if (reloadAvailable) await h.click('[data-action="reload-results"]');
        const latestValue = h.$('[name="tsh"]')?.value;
        h.field('[name="tsh"]', '4.4'); await h.click('[data-action="record"]'); await h.click('[data-action="results"]');
        const unsavedRestored = h.$('[name="tsh"]')?.value === '4.4';
        await h.click('[data-action="save-results"]');
        output.push({ case: 'conflict and session edits', typedRetained, reloadAvailable, latestValue, unsavedRestored, remoteSavedValue: remote.results.tsh, puts, reads });
    } finally { h.close(); }
}
{
    const h = await setup(); try {
        await h.click('[data-page="Settings"]'); h.field('[name="labName"]', 'Unsaved laboratory setting'); await h.click('[data-page="Report studio"]'); await h.click('[data-page="Settings"]');
        output.push({ case: 'unsaved settings navigation', restored: h.$('[name="labName"]').value === 'Unsaved laboratory setting' });
    } finally { h.close(); }
}
console.log(JSON.stringify(output, null, 2));
if (true) {
    const byCase = Object.fromEntries(output.map(item => [item.case, item]));
    const failures = [];
    if (byCase['blank age programmatic submit'].created) failures.push('Blank age must not create an order');
    if (!byCase['results Enter/submit']?.defaultPrevented && byCase['results Enter/submit']) failures.push('Result form submit must prevent navigation');
    if (byCase['invalid phone native-valid form'].created) failures.push('Invalid phone must not create an order');
    if (byCase['same form double submit'].count !== 1) failures.push('Duplicate submit must create one order');
    if (byCase['new report partial failure retry'].rowsAfterRetry !== 1) failures.push('Partial failure retry must not create duplicate orders');
    if (!byCase['conflict and session edits'].typedRetained || !byCase['conflict and session edits'].reloadAvailable || byCase['conflict and session edits'].latestValue !== '3.3' || !byCase['conflict and session edits'].unsavedRestored || byCase['conflict and session edits'].remoteSavedValue !== 4.4) failures.push('Conflict recovery must retain edits, reload latest and permit saving new version');
    if (!byCase['unsaved settings navigation'].restored) failures.push('Unsaved settings must survive navigation');
    console.log('Fix assertions: ' + (failures.length ? failures.join('; ') : 'PASS'));
    process.exit(failures.length ? 1 : 0);
}
process.exit(0);

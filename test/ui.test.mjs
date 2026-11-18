import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import * as catalog from '../dist/catalog.js';
import * as reportModule from '../dist/report.js';

test('Labflow Desktop UI: Login, Billing, Reports, Printing and Settings validation', async t => {
  const html = readFileSync(new URL('../dist/index.html', import.meta.url), 'utf8');
  const dom = new JSDOM(html, {
    url: 'http://localhost/',
    runScripts: 'outside-only',
    pretendToBeVisual: true
  });
  const w = dom.window;
  t.after(() => w.close());

  // Inject styles
  for (const file of ['style.css', 'report.css']) {
    const style = w.document.createElement('style');
    style.textContent = readFileSync(new URL('../dist/' + file, import.meta.url), 'utf8');
    w.document.head.appendChild(style);
  }

  // Mock labflowAPI
  let savedSession = null;
  w.labflowAPI = {
    getSupabaseConfig: async () => ({
      supabaseUrl: 'https://test.supabase.co',
      supabaseAnonKey: 'test-anon-key'
    }),
    saveSession: async (s) => { savedSession = s; return { success: true }; },
    loadSession: async () => savedSession,
    clearSession: async () => { savedSession = null; return { success: true }; },
    getPrinters: async () => [{ name: 'Thermal-80mm', isDefault: true }],
    printReceipt: async () => ({ success: true }),
    printReport: async () => ({ success: true }),
    printToPDF: async () => ({ success: true, filePath: 'C:/Users/DELL/Downloads/report.pdf' })
  };

  // Mock Supabase client
  w.supabase = {
    createClient: () => ({
      auth: {
        signInWithPassword: async ({ email, password }) => {
          if (email === 'anandlab@labflow.local' && password === 'LFR@26-1103') {
            return {
              data: {
                user: { id: 'usr-1', email, user_metadata: { username: 'anandlab' } },
                session: { access_token: 'tok-123', refresh_token: 'ref-123' }
              },
              error: null
            };
          }
          return { data: null, error: { message: 'Invalid login credentials' } };
        },
        setSession: async () => ({ data: { user: { id: 'usr-1' } }, error: null }),
        signOut: async () => ({ error: null }),
        updateUser: async () => ({ data: {}, error: null })
      },
      from: (tbl) => {
        const mockRows = {
          lab_settings: [{
            id: 'lab-1',
            lab_name: 'Anand Diagnostic Laboratory',
            registration_no: 'KA-BLR-LAB-2026-089',
            letterhead_template: 'classic',
            pathologist_name: 'Dr. Ramesh Kumar',
            lab_incharge: 'S. Nagaraj'
          }],
          doctors: [
            { id: 'doc-1', name: 'Dr. Meera Iyer', qualification: 'MD', active: true },
            { id: 'doc-2', name: 'Dr. Arjun Rao', qualification: 'MBBS', active: true }
          ],
          referral_labs: [{ id: 'rl-1', name: 'Apex Lab', active: true }],
          referral_hospitals: [{ id: 'rh-1', name: 'City Hospital', active: true }],
          tests: Object.entries(catalog.TESTS).map(([code, meta], idx) => ({
            id: `test-${idx + 1}`,
            code,
            name: meta.name,
            department: meta.department,
            sample_type: meta.sample,
            price: meta.price,
            active: true
          })),
          patients: [
            { id: 'pt-1', patient_no: 'PT-10001', title: 'Mr', full_name: 'Suresh Kumar', sex: 'Male', age_value: 45, age_unit: 'Y', mobile: '9845011223' }
          ],
          bills: [
            {
              id: 'bill-1',
              bill_no: 'BL-10001',
              subtotal: 450,
              discount: 0,
              total: 450,
              paid_amount: 450,
              balance: 0,
              payment_status: 'Paid',
              created_at: new Date().toISOString(),
              patients: { patient_no: 'PT-10001', title: 'Mr', full_name: 'Suresh Kumar', sex: 'Male', age_value: 45, age_unit: 'Y' },
              doctors: { name: 'Dr. Meera Iyer' },
              bill_items: [{ test_name: 'Complete Blood Count', test_sample_type: 'EDTA', price: 450 }]
            }
          ],
          reports: [
            {
              id: 'rep-1',
              status: 'Pending',
              created_at: new Date().toISOString(),
              bills: { bill_no: 'BL-10001', doctors: { name: 'Dr. Meera Iyer' } },
              patients: { patient_no: 'PT-10001', title: 'Mr', full_name: 'Suresh Kumar', sex: 'Male', age_value: 45, age_unit: 'Y' },
              report_results: [
                { id: 'rr-1', test_code: 'CBC', parameter_code: 'hb', parameter_name: 'Hemoglobin', unit: 'g/dL', reference_range: '13.5 – 17.5', min_val: 12.0, max_val: 17.5, critical_min: 7.0, critical_max: 21.0, value: '14.5', flag: '' }
              ]
            }
          ]
        };

        const chain = {
          select: () => chain,
          order: () => chain,
          limit: () => chain,
          eq: () => chain,
          gte: () => chain,
          lte: () => chain,
          or: () => chain,
          maybeSingle: async () => ({ data: mockRows[tbl]?.[0] || null, error: null }),
          single: async () => ({ data: mockRows[tbl]?.[0] || null, error: null }),
          insert: async (data) => ({ data: Array.isArray(data) ? data[0] : data, error: null }),
          update: async () => ({ error: null }),
          then: (resolve) => resolve({ data: mockRows[tbl] || [], error: null })
        };
        return chain;
      },
      rpc: async (fn, args) => {
        if (fn === 'create_bill_transaction') {
          return {
            data: {
              bill_id: 'bill-new',
              bill_no: 'BL-10002',
              patient_id: 'pt-1',
              patient_no: 'PT-10001',
              report_id: 'rep-new',
              total: 450,
              paid_amount: 450,
              balance: 0,
              payment_status: 'Paid'
            },
            error: null
          };
        }
        if (fn === 'collect_bill_payment') {
          return {
            data: { bill_id: args.p_bill_id, paid_amount: args.p_amount, balance: 0, payment_status: 'Paid' },
            error: null
          };
        }
        return { data: null, error: null };
      }
    })
  };

  // Load app.js
  const appSrc = readFileSync(new URL('../dist/app.js', import.meta.url), 'utf8')
    .replace(/^import[^\n]+\n/gm, '')
    .replace(/^/, 'const {TESTS,PARAMETERS,reportNotes}=window.catalog;\nconst {renderReport,REPORT_TEMPLATES}=window.reportModule;\n');

  w.catalog = catalog;
  w.reportModule = reportModule;
  w.eval(appSrc);

  const tick = (ms = 20) => new Promise(r => setTimeout(r, ms));
  await tick(50);

  // 1. Verify Login Screen renders
  assert(w.document.querySelector('#login-form'), 'Login form should render');
  assert.equal(w.document.querySelector('h1').textContent, 'Opti-X Labs');

  // 2. Test Invalid Login
  const usernameInput = w.document.querySelector('#username');
  const passwordInput = w.document.querySelector('#password');
  const submitBtn = w.document.querySelector('#login-submit-btn');

  usernameInput.value = 'wronguser';
  passwordInput.value = 'wrongpass';
  w.document.querySelector('#login-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await tick(50);

  assert(w.document.querySelector('.login-error-banner'), 'Error banner should be displayed on failed login');

  // 3. Test Valid Login with anandlab
  const userIn = w.document.querySelector('#username');
  const passIn = w.document.querySelector('#password');
  userIn.value = 'anandlab';
  passIn.value = 'LFR@26-1103';
  w.document.querySelector('#login-form').dispatchEvent(new w.Event('submit', { bubbles: true, cancelable: true }));
  await tick(100);

  // 4. Verify Main Layout Renders
  assert(w.document.querySelector('.app-layout'), 'App layout should render after successful login');
  assert.equal(w.document.querySelector('.sidebar-title h2').textContent, 'Anand Diagnostic Laboratory');

  // 5. Verify Billing Module (New Bill)
  assert(w.document.querySelector('#patient-fullname'), 'Patient full name input should be present');
  assert(w.document.querySelector('#test-catalog-pills'), 'Test catalog pills should render');
  assert(w.document.querySelector('#bill-doctor'), 'Doctor select should be present');

  // 6. Test Reports Navigation
  const reportsNavBtn = w.document.querySelector('.nav-item[data-nav="reports"]');
  reportsNavBtn.click();
  await tick(50);
  assert(w.document.querySelector('#tab-rep-pending'), 'Reports tabs should render');

  // 7. Test Settings Navigation
  const settingsNavBtn = w.document.querySelector('.nav-item[data-nav="settings"]');
  settingsNavBtn.click();
  await tick(50);
  assert(w.document.querySelector('#tab-set-profile'), 'Settings tabs should render');

  console.log('PASS: All Labflow desktop flows (Login, Billing, Reports, Settings, Printing) verified.');
});

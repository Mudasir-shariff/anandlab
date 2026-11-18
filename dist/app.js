/**
 * Labflow Diagnostics - Desktop Application Core
 * Backed by Supabase PostgreSQL
 */

import { TESTS, PARAMETERS, reportNotes } from './catalog.js';
import { renderReport, REPORT_TEMPLATES } from './report.js';

// Application State
const state = {
  supabase: null,
  user: null,
  config: null,
  currentPage: 'billing', // 'billing' | 'reports' | 'settings'
  billingSubTab: 'new',   // 'new' | 'list'
  reportsSubTab: 'pending', // 'pending' | 'completed' | 'all'
  settingsSubTab: 'profile', // 'profile' | 'doctors' | 'referrals' | 'catalog' | 'security'

  // Reference Data
  labSettings: {},
  doctors: [],
  referralLabs: [],
  referralHospitals: [],
  testsCatalog: [],

  // New Bill Form State
  newBill: {
    selectedPatientId: null,
    patient: {
      title: 'Mr',
      fullName: '',
      sex: 'Male',
      ageValue: '',
      ageUnit: 'Y',
      mobile: '',
      altMobile: '',
      email: '',
      height: '',
      weight: '',
      area: '',
      city: 'Bangalore',
      pincode: ''
    },
    doctorId: '',
    referralLabId: '',
    referralHospitalId: '',
    selectedTestIds: [],
    discount: 0,
    paidAmount: 0,
    paymentMode: 'Cash',
    paymentNotes: ''
  },

  // Lists & Filters
  billsList: [],
  billsFilter: {
    search: '',
    status: 'All',
    dateRange: 'Today'
  },

  reportsList: [],
  reportsFilter: {
    search: '',
    dateRange: 'Today'
  },

  // Active Report Result Entry
  activeReport: null,

  // Lockout & Inactivity
  failedLoginAttempts: 0,
  lockoutUntil: 0,
  idleTimer: null
};

// -------------------------------------------------------------
// Indian Currency to Words Utility
// -------------------------------------------------------------
function numberToWords(amount) {
  const num = Math.floor(amount || 0);
  if (num === 0) return 'Rupees Zero Only';

  const units = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
  const teens = ['Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
  const tens = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

  function convertTwoDigits(n) {
    if (n < 10) return units[n];
    if (n < 20) return teens[n - 10];
    const u = n % 10;
    return tens[Math.floor(n / 10)] + (u ? ' ' + units[u] : '');
  }

  function convertThreeDigits(n) {
    const h = Math.floor(n / 100);
    const rem = n % 100;
    let res = '';
    if (h) res += units[h] + ' Hundred';
    if (rem) res += (res ? ' ' : '') + convertTwoDigits(rem);
    return res;
  }

  let words = '';
  const crore = Math.floor(num / 10000000);
  let rem = num % 10000000;
  const lakh = Math.floor(rem / 100000);
  rem = rem % 100000;
  const thousand = Math.floor(rem / 1000);
  rem = rem % 1000;

  if (crore) words += convertTwoDigits(crore) + ' Crore ';
  if (lakh) words += convertTwoDigits(lakh) + ' Lakh ';
  if (thousand) words += convertTwoDigits(thousand) + ' Thousand ';
  if (rem) words += convertThreeDigits(rem);

  return 'Rupees ' + words.trim() + ' Only';
}

function formatCurrency(val) {
  const n = Number(val || 0);
  return '₹ ' + n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(isoString) {
  if (!isoString) return '—';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true
  });
}

function escapeHTML(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// -------------------------------------------------------------
// Toast Notifications
// -------------------------------------------------------------
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${escapeHTML(message)}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    toast.classList.add('toast-fadeout');
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

// -------------------------------------------------------------
// Inactivity & Auto-Logout (30 minutes)
// -------------------------------------------------------------
function resetIdleTimer() {
  if (state.idleTimer) clearTimeout(state.idleTimer);
  if (state.user) {
    state.idleTimer = setTimeout(() => {
      handleLogout('Session expired due to 30 minutes of inactivity.');
    }, 30 * 60 * 1000);
  }
}

['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll'].forEach(evt => {
  window.addEventListener(evt, resetIdleTimer, { passive: true });
});

// -------------------------------------------------------------
// Core Initialization & Supabase Setup
// -------------------------------------------------------------
async function init() {
  try {
    if (!window.labflowAPI) {
      document.getElementById('app').innerHTML = `
        <div class="setup-container">
          <h2>Browser Runtime Warning</h2>
          <p>Please run Labflow inside the Electron Desktop Application for full security and printing access.</p>
        </div>`;
      return;
    }

    state.config = await window.labflowAPI.getSupabaseConfig();

    if (!state.config || !state.config.supabaseUrl || !state.config.supabaseAnonKey) {
      renderSetupPrompt();
      return;
    }

    // Initialize Supabase Client (UMD bundle)
    if (typeof window.supabase === 'undefined' || !window.supabase.createClient) {
      throw new Error('Supabase library failed to load.');
    }

    state.supabase = window.supabase.createClient(state.config.supabaseUrl, state.config.supabaseAnonKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: true
      }
    });

    // Check saved encrypted session from safeStorage
    const savedSession = await window.labflowAPI.loadSession();
    if (savedSession) {
      try {
        const sessionObj = JSON.parse(savedSession);
        const { data, error } = await state.supabase.auth.setSession({
          access_token: sessionObj.access_token,
          refresh_token: sessionObj.refresh_token
        });
        if (!error && data?.user) {
          state.user = data.user;
          await loadReferenceData();
          renderApp();
          resetIdleTimer();
          return;
        }
      } catch (e) {
        console.warn('Failed to restore saved session:', e);
      }
    }

    renderLogin();
  } catch (err) {
    console.error('Initialization error:', err);
    document.getElementById('app').innerHTML = `
      <div class="setup-container">
        <h2>Initialization Error</h2>
        <p>${escapeHTML(err.message)}</p>
      </div>`;
  }
}

function renderSetupPrompt() {
  document.getElementById('app').innerHTML = `
    <div class="setup-container">
      <div class="setup-card">
        <div class="brand-badge">Labflow Desktop</div>
        <h2>Supabase Connection Required</h2>
        <p>Please configure your Supabase project credentials in <code>.env</code> file:</p>
        <pre>SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key-here</pre>
        <p class="muted">Once configured, restart the application to connect.</p>
      </div>
    </div>`;
}

// -------------------------------------------------------------
// Authentication (Login / Logout)
// -------------------------------------------------------------
function renderLogin(errorMessage = '') {
  const isLocked = Date.now() < state.lockoutUntil;
  const remainingSecs = Math.ceil((state.lockoutUntil - Date.now()) / 1000);

  document.getElementById('app').innerHTML = `
    <div class="login-wrapper">
      <div class="login-card">
        <div class="login-header">
          <div class="login-logo">
            <svg viewBox="0 0 48 48" width="40" height="40" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 5h10m-8 0v15L10 37a4 4 0 0 0 3 6h22a4 4 0 0 0 3-6L27 20V5M16 29h16"/><circle cx="22" cy="34" r="1.5"/><circle cx="28" cy="38" r="1"/></svg>
          </div>
          <h1>Labflow Diagnostics</h1>
          <p class="subtitle">Diagnostic Laboratory Management System</p>
        </div>

        ${errorMessage ? `<div class="login-error-banner" role="alert">${escapeHTML(errorMessage)}</div>` : ''}
        ${isLocked ? `<div class="login-error-banner">Too many failed attempts. Locked for ${remainingSecs} seconds.</div>` : ''}

        <form id="login-form" class="login-form">
          <div class="form-group">
            <label for="username">Username</label>
            <input type="text" id="username" name="username" placeholder="anandlab" required autocomplete="username" ${isLocked ? 'disabled' : ''} />
          </div>

          <div class="form-group">
            <label for="password">Password</label>
            <input type="password" id="password" name="password" placeholder="••••••••" required autocomplete="current-password" ${isLocked ? 'disabled' : ''} />
          </div>

          <button type="submit" id="login-submit-btn" class="btn btn-primary btn-block" ${isLocked ? 'disabled' : ''}>
            Sign In to Labflow
          </button>
        </form>

        <div class="login-footer">
          <span>Protected by Supabase Auth &amp; SafeStorage</span>
        </div>
      </div>
    </div>`;

  const form = document.getElementById('login-form');
  form.addEventListener('submit', handleLogin);
}

async function handleLogin(e) {
  e.preventDefault();
  if (Date.now() < state.lockoutUntil) return;

  const submitBtn = document.getElementById('login-submit-btn');
  const usernameInput = document.getElementById('username');
  const passwordInput = document.getElementById('password');

  const username = usernameInput.value.trim().toLowerCase();
  const password = passwordInput.value;

  if (!username || !password) return;

  // Map username to internal auth email
  const email = `${username}@labflow.local`;

  submitBtn.disabled = true;
  submitBtn.textContent = 'Verifying credentials...';

  try {
    const { data, error } = await state.supabase.auth.signInWithPassword({
      email,
      password
    });

    if (error || !data?.user || !data?.session) {
      state.failedLoginAttempts++;
      if (state.failedLoginAttempts >= 5) {
        state.lockoutUntil = Date.now() + 60 * 1000;
        state.failedLoginAttempts = 0;
      }
      renderLogin('Invalid username or password.');
      return;
    }

    state.failedLoginAttempts = 0;
    state.user = data.user;

    // Encrypt and persist session token via safeStorage
    await window.labflowAPI.saveSession(JSON.stringify({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token
    }));

    await loadReferenceData();
    renderApp();
    resetIdleTimer();
    showToast('Signed in successfully', 'success');
  } catch (err) {
    console.error('Login error:', err);
    renderLogin('An error occurred during authentication. Please retry.');
  }
}

async function handleLogout(toastMsg = '') {
  if (state.supabase) {
    try { await state.supabase.auth.signOut(); } catch (e) {}
  }
  if (window.labflowAPI) {
    await window.labflowAPI.clearSession();
  }
  state.user = null;
  state.activeReport = null;
  if (state.idleTimer) clearTimeout(state.idleTimer);
  renderLogin(toastMsg);
}

// -------------------------------------------------------------
// Data Fetching & Reference Cache
// -------------------------------------------------------------
async function loadReferenceData() {
  try {
    // 1. Settings
    const { data: settings } = await state.supabase.from('lab_settings').select('*').limit(1).maybeSingle();
    if (settings) state.labSettings = settings;

    // 2. Doctors
    const { data: docs } = await state.supabase.from('doctors').select('*').order('name');
    if (docs) state.doctors = docs;

    // 3. Referral Labs & Hospitals
    const { data: labs } = await state.supabase.from('referral_labs').select('*').order('name');
    if (labs) state.referralLabs = labs;

    const { data: hosps } = await state.supabase.from('referral_hospitals').select('*').order('name');
    if (hosps) state.referralHospitals = hosps;

    // 4. Tests & Parameters
    const { data: tests } = await state.supabase.from('tests').select('*, test_parameters(*)').order('name');
    if (tests) state.testsCatalog = tests;
  } catch (err) {
    console.error('Error loading reference data:', err);
    showToast('Could not load some laboratory reference data.', 'error');
  }
}

// -------------------------------------------------------------
// Main Application Frame
// -------------------------------------------------------------
function renderApp() {
  const container = document.getElementById('app');
  container.innerHTML = `
    <div class="app-layout">
      <!-- Sidebar -->
      <aside class="app-sidebar">
        <div class="sidebar-brand">
          <div class="sidebar-logo">
            <svg viewBox="0 0 48 48" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M19 5h10m-8 0v15L10 37a4 4 0 0 0 3 6h22a4 4 0 0 0 3-6L27 20V5M16 29h16"/><circle cx="22" cy="34" r="1.5"/><circle cx="28" cy="38" r="1"/></svg>
          </div>
          <div class="sidebar-title">
            <h2>${escapeHTML(state.labSettings.lab_name || 'Labflow Diagnostics')}</h2>
            <span>${escapeHTML(state.labSettings.registration_no || 'KA-BLR-LAB')}</span>
          </div>
        </div>

        <nav class="sidebar-nav">
          <button class="nav-item ${state.currentPage === 'billing' ? 'active' : ''}" data-nav="billing">
            <span class="nav-icon">💳</span>
            <span class="nav-label">Billing</span>
          </button>

          <button class="nav-item ${state.currentPage === 'reports' ? 'active' : ''}" data-nav="reports">
            <span class="nav-icon">📋</span>
            <span class="nav-label">Reports</span>
          </button>

          <button class="nav-item ${state.currentPage === 'settings' ? 'active' : ''}" data-nav="settings">
            <span class="nav-icon">⚙️</span>
            <span class="nav-label">Settings</span>
          </button>
        </nav>

        <div class="sidebar-footer">
          <div class="user-info">
            <span class="user-icon">👤</span>
            <div class="user-details">
              <strong>${escapeHTML(state.user?.user_metadata?.username || 'anandlab')}</strong>
              <small>Staff Operator</small>
            </div>
          </div>
          <button id="logout-btn" class="btn btn-outline-danger btn-sm" title="Sign out">
            Logout
          </button>
        </div>
      </aside>

      <!-- Main Content Area -->
      <main class="app-main" id="main-content">
        <!-- Rendered based on state.currentPage -->
      </main>
    </div>`;

  // Attach Sidebar Listeners
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(btn => {
    btn.addEventListener('click', () => {
      state.currentPage = btn.dataset.nav;
      renderApp();
    });
  });

  document.getElementById('logout-btn').addEventListener('click', () => {
    if (confirm('Are you sure you want to sign out of Labflow?')) {
      handleLogout();
    }
  });

  // Render Sub-Page
  const mainContent = document.getElementById('main-content');
  if (state.currentPage === 'billing') {
    renderBillingModule(mainContent);
  } else if (state.currentPage === 'reports') {
    renderReportsModule(mainContent);
  } else if (state.currentPage === 'settings') {
    renderSettingsModule(mainContent);
  }
}

// -------------------------------------------------------------
// MODULE 1: BILLING
// -------------------------------------------------------------
function renderBillingModule(container) {
  container.innerHTML = `
    <div class="module-header">
      <div class="module-title">
        <h1>Patient Billing &amp; Invoices</h1>
        <p>Register patients, select tests, collect payments and print receipts</p>
      </div>
      <div class="module-tabs">
        <button class="tab-btn ${state.billingSubTab === 'new' ? 'active' : ''}" id="tab-new-bill">New Registration / Bill</button>
        <button class="tab-btn ${state.billingSubTab === 'list' ? 'active' : ''}" id="tab-bills-list">All Invoices &amp; Ledger</button>
      </div>
    </div>
    <div class="module-body" id="billing-body"></div>`;

  document.getElementById('tab-new-bill').addEventListener('click', () => {
    state.billingSubTab = 'new';
    renderBillingModule(container);
  });
  document.getElementById('tab-bills-list').addEventListener('click', () => {
    state.billingSubTab = 'list';
    renderBillingModule(container);
  });

  const body = document.getElementById('billing-body');
  if (state.billingSubTab === 'new') {
    renderNewBillForm(body);
  } else {
    renderBillsList(body);
  }
}

function renderNewBillForm(container) {
  const activeTests = state.testsCatalog.filter(t => t.active);
  const selectedTests = activeTests.filter(t => state.newBill.selectedTestIds.includes(t.id));

  const subtotal = selectedTests.reduce((sum, t) => sum + Number(t.price), 0);
  const discount = Math.max(0, Math.min(subtotal, Number(state.newBill.discount || 0)));
  const total = Math.max(0, subtotal - discount);
  const paid = Math.max(0, Math.min(total, Number(state.newBill.paidAmount ?? total)));
  const balance = total - paid;

  container.innerHTML = `
    <div class="billing-grid">
      <!-- Left Column: Patient & Referral -->
      <div class="billing-pane">
        <div class="card">
          <div class="card-header">
            <h3>1. Patient Registration</h3>
            <div class="patient-search-box">
              <input type="text" id="patient-lookup-input" placeholder="🔍 Search existing patient by mobile or name..." autocomplete="off" />
              <div id="patient-lookup-results" class="lookup-dropdown hidden"></div>
            </div>
          </div>
          <div class="card-body">
            <div class="form-row">
              <div class="form-group col-3">
                <label>Title *</label>
                <select id="patient-title">
                  ${['Mr', 'Mrs', 'Ms', 'Master', 'Miss', 'Baby', 'B/O', 'Dr', 'Prof'].map(t =>
                    `<option value="${t}" ${state.newBill.patient.title === t ? 'selected' : ''}>${t}</option>`
                  ).join('')}
                </select>
              </div>
              <div class="form-group col-9">
                <label>Full Patient Name *</label>
                <input type="text" id="patient-fullname" placeholder="Enter patient full name" value="${escapeHTML(state.newBill.patient.fullName)}" required />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group col-6">
                <label>Gender *</label>
                <div class="radio-toggle-group">
                  ${['Male', 'Female', 'Other'].map(g => `
                    <label class="radio-label">
                      <input type="radio" name="patient-sex" value="${g}" ${state.newBill.patient.sex === g ? 'checked' : ''} />
                      <span>${g}</span>
                    </label>
                  `).join('')}
                </div>
              </div>
              <div class="form-group col-6">
                <label>Age *</label>
                <div class="input-unit-group">
                  <input type="number" id="patient-age-val" min="0" max="150" placeholder="Age" value="${escapeHTML(state.newBill.patient.ageValue)}" required />
                  <select id="patient-age-unit">
                    <option value="Y" ${state.newBill.patient.ageUnit === 'Y' ? 'selected' : ''}>Years</option>
                    <option value="M" ${state.newBill.patient.ageUnit === 'M' ? 'selected' : ''}>Months</option>
                    <option value="D" ${state.newBill.patient.ageUnit === 'D' ? 'selected' : ''}>Days</option>
                  </select>
                </div>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group col-6">
                <label>Primary Mobile *</label>
                <input type="tel" id="patient-mobile" placeholder="10-digit mobile" maxlength="10" value="${escapeHTML(state.newBill.patient.mobile)}" />
              </div>
              <div class="form-group col-6">
                <label>Alternate Mobile</label>
                <input type="tel" id="patient-alt-mobile" placeholder="Optional phone" value="${escapeHTML(state.newBill.patient.altMobile)}" />
              </div>
            </div>

            <details class="collapsible-section">
              <summary>Additional Patient Details (Height, Weight, Address)</summary>
              <div class="collapsible-content">
                <div class="form-row">
                  <div class="form-group col-6">
                    <label>Height (cm)</label>
                    <input type="number" id="patient-height" placeholder="e.g. 170" value="${escapeHTML(state.newBill.patient.height)}" />
                  </div>
                  <div class="form-group col-6">
                    <label>Weight (kg)</label>
                    <input type="number" id="patient-weight" placeholder="e.g. 68" value="${escapeHTML(state.newBill.patient.weight)}" />
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group col-12">
                    <label>Area / Locality</label>
                    <input type="text" id="patient-area" placeholder="e.g. Vijayanagar" value="${escapeHTML(state.newBill.patient.area)}" />
                  </div>
                </div>
                <div class="form-row">
                  <div class="form-group col-6">
                    <label>City</label>
                    <input type="text" id="patient-city" value="${escapeHTML(state.newBill.patient.city)}" />
                  </div>
                  <div class="form-group col-6">
                    <label>Pincode</label>
                    <input type="text" id="patient-pincode" placeholder="560040" value="${escapeHTML(state.newBill.patient.pincode)}" />
                  </div>
                </div>
              </div>
            </details>
          </div>
        </div>

        <!-- Referral Information -->
        <div class="card mt-3">
          <div class="card-header">
            <h3>2. Referral Sources</h3>
          </div>
          <div class="card-body">
            <div class="form-row">
              <div class="form-group col-12">
                <label>Referred By (Doctor)</label>
                <div class="select-with-add">
                  <select id="bill-doctor">
                    <option value="">Self / Walk-in</option>
                    ${state.doctors.filter(d => d.active).map(d =>
                      `<option value="${d.id}" ${state.newBill.doctorId === d.id ? 'selected' : ''}>${escapeHTML(d.name)}${d.qualification ? ' (' + escapeHTML(d.qualification) + ')' : ''}</option>`
                    ).join('')}
                  </select>
                  <button type="button" class="btn btn-primary-outline btn-icon" id="btn-add-doctor" title="Add New Doctor">+</button>
                </div>
              </div>
            </div>

            <div class="form-row">
              <div class="form-group col-6">
                <label>Referral Lab</label>
                <div class="select-with-add">
                  <select id="bill-referral-lab">
                    <option value="">Direct / None</option>
                    ${state.referralLabs.filter(l => l.active).map(l =>
                      `<option value="${l.id}" ${state.newBill.referralLabId === l.id ? 'selected' : ''}>${escapeHTML(l.name)}</option>`
                    ).join('')}
                  </select>
                  <button type="button" class="btn btn-primary-outline btn-icon" id="btn-add-ref-lab" title="Add Referral Lab">+</button>
                </div>
              </div>

              <div class="form-group col-6">
                <label>Referral Hospital</label>
                <div class="select-with-add">
                  <select id="bill-referral-hosp">
                    <option value="">Direct / None</option>
                    ${state.referralHospitals.filter(h => h.active).map(h =>
                      `<option value="${h.id}" ${state.newBill.referralHospitalId === h.id ? 'selected' : ''}>${escapeHTML(h.name)}</option>`
                    ).join('')}
                  </select>
                  <button type="button" class="btn btn-primary-outline btn-icon" id="btn-add-ref-hosp" title="Add Referral Hospital">+</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Right Column: Test Selection, Cart & Payment -->
      <div class="billing-pane">
        <div class="card">
          <div class="card-header">
            <h3>3. Test Catalog Selection</h3>
            <input type="text" id="test-search-filter" class="table-search" placeholder="Filter tests..." />
          </div>
          <div class="card-body">
            <div class="test-pill-container" id="test-catalog-pills">
              ${activeTests.map(t => {
                const isSelected = state.newBill.selectedTestIds.includes(t.id);
                return `
                  <button type="button" class="test-pill ${isSelected ? 'selected' : ''}" data-test-id="${t.id}">
                    <span class="test-pill-code">${escapeHTML(t.code)}</span>
                    <span class="test-pill-name">${escapeHTML(t.name)}</span>
                    <span class="test-pill-price">₹${t.price}</span>
                  </button>`;
              }).join('')}
            </div>

            <!-- Selected Cart Table -->
            <div class="cart-section mt-4">
              <h4>Selected Tests (${selectedTests.length})</h4>
              ${selectedTests.length === 0 ? `
                <div class="empty-cart-notice">No tests selected. Click tests above to add.</div>
              ` : `
                <table class="data-table cart-table">
                  <thead>
                    <tr>
                      <th>Test Panel</th>
                      <th>Specimen</th>
                      <th class="text-right">Price</th>
                      <th class="text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${selectedTests.map(t => `
                      <tr>
                        <td><strong>${escapeHTML(t.name)}</strong> (${escapeHTML(t.code)})</td>
                        <td><small>${escapeHTML(t.sample_type)}</small></td>
                        <td class="text-right">${formatCurrency(t.price)}</td>
                        <td class="text-center">
                          <button type="button" class="btn-remove-test" data-test-id="${t.id}" title="Remove test">&times;</button>
                        </td>
                      </tr>
                    `).join('')}
                  </tbody>
                </table>
              `}
            </div>

            <!-- Financial Summary & Checkout -->
            <div class="billing-summary-box mt-4">
              <div class="summary-line">
                <span>Subtotal:</span>
                <strong>${formatCurrency(subtotal)}</strong>
              </div>

              <div class="summary-line">
                <span>Discount (₹):</span>
                <input type="number" id="bill-discount" min="0" max="${subtotal}" value="${state.newBill.discount}" class="summary-input" />
              </div>

              <div class="summary-line highlight">
                <span>Net Total:</span>
                <strong class="total-amount">${formatCurrency(total)}</strong>
              </div>

              <div class="summary-line">
                <span>Paid Amount (₹):</span>
                <input type="number" id="bill-paid" min="0" max="${total}" value="${state.newBill.paidAmount !== undefined ? state.newBill.paidAmount : total}" class="summary-input" />
              </div>

              <div class="summary-line">
                <span>Payment Mode:</span>
                <select id="bill-payment-mode" class="summary-input">
                  ${['Cash', 'UPI', 'Card', 'Net Banking', 'Other'].map(m =>
                    `<option value="${m}" ${state.newBill.paymentMode === m ? 'selected' : ''}>${m}</option>`
                  ).join('')}
                </select>
              </div>

              <div class="summary-line ${balance > 0 ? 'text-danger' : 'text-success'}">
                <span>Balance Due:</span>
                <strong>${formatCurrency(balance)}</strong>
              </div>
            </div>

            <div class="mt-4">
              <button type="button" id="btn-submit-bill" class="btn btn-primary btn-lg btn-block" ${selectedTests.length === 0 ? 'disabled' : ''}>
                💳 Create Bill &amp; Print Receipt
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  // Attach New Bill Listeners
  attachNewBillListeners(container);
}

function attachNewBillListeners(container) {
  // Test Selection Pills
  container.querySelectorAll('.test-pill').forEach(pill => {
    pill.addEventListener('click', () => {
      const id = pill.dataset.testId;
      const idx = state.newBill.selectedTestIds.indexOf(id);
      if (idx > -1) {
        state.newBill.selectedTestIds.splice(idx, 1);
      } else {
        state.newBill.selectedTestIds.push(id);
      }
      renderNewBillForm(container);
    });
  });

  // Remove test from cart table
  container.querySelectorAll('.btn-remove-test').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.testId;
      state.newBill.selectedTestIds = state.newBill.selectedTestIds.filter(tid => tid !== id);
      renderNewBillForm(container);
    });
  });

  // Filter test pills
  const searchFilter = container.querySelector('#test-search-filter');
  if (searchFilter) {
    searchFilter.addEventListener('input', (e) => {
      const q = e.target.value.toLowerCase();
      container.querySelectorAll('.test-pill').forEach(pill => {
        const text = pill.textContent.toLowerCase();
        pill.style.display = text.includes(q) ? 'inline-flex' : 'none';
      });
    });
  }

  // Discount & Paid Inputs
  const discountInput = container.querySelector('#bill-discount');
  if (discountInput) {
    discountInput.addEventListener('input', (e) => {
      state.newBill.discount = Number(e.target.value || 0);
      renderNewBillForm(container);
    });
  }

  const paidInput = container.querySelector('#bill-paid');
  if (paidInput) {
    paidInput.addEventListener('input', (e) => {
      state.newBill.paidAmount = Number(e.target.value || 0);
    });
  }

  const modeSelect = container.querySelector('#bill-payment-mode');
  if (modeSelect) {
    modeSelect.addEventListener('change', (e) => {
      state.newBill.paymentMode = e.target.value;
    });
  }

  // Doctor & Referral Quick Add Modals
  container.querySelector('#btn-add-doctor')?.addEventListener('click', () => openAddDoctorModal());
  container.querySelector('#btn-add-ref-lab')?.addEventListener('click', () => openAddReferralLabModal());
  container.querySelector('#btn-add-ref-hosp')?.addEventListener('click', () => openAddReferralHospitalModal());

  // Patient Lookup Input
  const lookupInput = container.querySelector('#patient-lookup-input');
  const lookupDropdown = container.querySelector('#patient-lookup-results');
  if (lookupInput && lookupDropdown) {
    let debounceTimer;
    lookupInput.addEventListener('input', (e) => {
      clearTimeout(debounceTimer);
      const query = e.target.value.trim();
      if (query.length < 2) {
        lookupDropdown.classList.add('hidden');
        return;
      }
      debounceTimer = setTimeout(async () => {
        const { data: patients } = await state.supabase
          .from('patients')
          .select('*')
          .or(`mobile.ilike.%${query}%,full_name.ilike.%${query}%`)
          .limit(5);

        if (patients && patients.length > 0) {
          lookupDropdown.innerHTML = patients.map(p => `
            <div class="lookup-item" data-id="${p.id}">
              <strong>${escapeHTML(p.full_name)}</strong> (${p.patient_no}) - ${p.sex}, ${p.age_value}${p.age_unit}
              <div><small>📱 ${escapeHTML(p.mobile || 'No mobile')} | ${escapeHTML(p.area || p.city || '')}</small></div>
            </div>
          `).join('');
          lookupDropdown.classList.remove('hidden');

          lookupDropdown.querySelectorAll('.lookup-item').forEach(item => {
            item.addEventListener('click', () => {
              const selected = patients.find(p => p.id === item.dataset.id);
              if (selected) {
                state.newBill.selectedPatientId = selected.id;
                state.newBill.patient = {
                  title: selected.title,
                  fullName: selected.full_name,
                  sex: selected.sex,
                  ageValue: selected.age_value,
                  ageUnit: selected.age_unit,
                  mobile: selected.mobile || '',
                  altMobile: selected.alt_mobile || '',
                  email: selected.email || '',
                  height: selected.height || '',
                  weight: selected.weight || '',
                  area: selected.area || '',
                  city: selected.city || '',
                  pincode: selected.pincode || ''
                };
                showToast(`Loaded patient: ${selected.full_name}`, 'info');
                renderNewBillForm(container);
              }
            });
          });
        } else {
          lookupDropdown.innerHTML = '<div class="lookup-empty">No matching patients found.</div>';
          lookupDropdown.classList.remove('hidden');
        }
      }, 300);
    });
  }

  // Submit Bill
  container.querySelector('#btn-submit-bill')?.addEventListener('click', handleCreateBill);
}

async function handleCreateBill() {
  const submitBtn = document.getElementById('btn-submit-bill');
  submitBtn.disabled = true;
  submitBtn.textContent = 'Processing transaction...';

  // Harvest patient values from DOM
  const title = document.getElementById('patient-title').value;
  const fullName = document.getElementById('patient-fullname').value.trim();
  const sex = document.querySelector('input[name="patient-sex"]:checked')?.value || 'Male';
  const ageValue = parseInt(document.getElementById('patient-age-val').value, 10);
  const ageUnit = document.getElementById('patient-age-unit').value;
  const mobile = document.getElementById('patient-mobile').value.trim();
  const altMobile = document.getElementById('patient-alt-mobile')?.value.trim() || '';
  const height = document.getElementById('patient-height')?.value.trim() || null;
  const weight = document.getElementById('patient-weight')?.value.trim() || null;
  const area = document.getElementById('patient-area')?.value.trim() || '';
  const city = document.getElementById('patient-city')?.value.trim() || 'Bangalore';
  const pincode = document.getElementById('patient-pincode')?.value.trim() || '';

  if (!fullName) {
    showToast('Please enter patient full name.', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = '💳 Create Bill & Print Receipt';
    return;
  }
  if (isNaN(ageValue) || ageValue < 0) {
    showToast('Please enter a valid age.', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = '💳 Create Bill & Print Receipt';
    return;
  }
  if (state.newBill.selectedTestIds.length === 0) {
    showToast('Please select at least one test.', 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = '💳 Create Bill & Print Receipt';
    return;
  }

  const doctorId = document.getElementById('bill-doctor').value || null;
  const refLabId = document.getElementById('bill-referral-lab').value || null;
  const refHospId = document.getElementById('bill-referral-hosp').value || null;

  const patientPayload = {
    title,
    full_name: fullName,
    sex,
    age_value: ageValue,
    age_unit: ageUnit,
    mobile,
    alt_mobile: altMobile,
    height,
    weight,
    area,
    city,
    pincode
  };

  try {
    // Call Supabase Atomic Billing RPC
    const { data: result, error } = await state.supabase.rpc('create_bill_transaction', {
      p_patient_id: state.newBill.selectedPatientId,
      p_patient_data: patientPayload,
      p_doctor_id: doctorId,
      p_referral_lab_id: refLabId,
      p_referral_hospital_id: refHospId,
      p_test_ids: state.newBill.selectedTestIds,
      p_discount: state.newBill.discount,
      p_paid_amount: state.newBill.paidAmount,
      p_payment_mode: state.newBill.paymentMode,
      p_payment_notes: ''
    });

    if (error) throw error;

    showToast(`Bill ${result.bill_no} created successfully!`, 'success');

    // Fetch full bill details for receipt printing
    await openReceiptModal(result.bill_id);

    // Reset Form
    state.newBill.selectedPatientId = null;
    state.newBill.selectedTestIds = [];
    state.newBill.discount = 0;
    state.newBill.paidAmount = 0;
    state.newBill.patient = {
      title: 'Mr',
      fullName: '',
      sex: 'Male',
      ageValue: '',
      ageUnit: 'Y',
      mobile: '',
      altMobile: '',
      email: '',
      height: '',
      weight: '',
      area: '',
      city: 'Bangalore',
      pincode: ''
    };
  } catch (err) {
    console.error('Failed to create bill:', err);
    showToast('Billing error: ' + (err.message || 'Database transaction failed.'), 'error');
    submitBtn.disabled = false;
    submitBtn.textContent = '💳 Create Bill & Print Receipt';
  }
}

// -------------------------------------------------------------
// Bills Ledger & Receipt Generation
// -------------------------------------------------------------
async function renderBillsList(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <div class="filter-bar">
          <input type="text" id="bills-search" placeholder="Search by Bill ID, Patient Name or Phone..." value="${escapeHTML(state.billsFilter.search)}" class="table-search" />
          <select id="bills-filter-status" class="filter-select">
            <option value="All" ${state.billsFilter.status === 'All' ? 'selected' : ''}>All Payment Statuses</option>
            <option value="Paid" ${state.billsFilter.status === 'Paid' ? 'selected' : ''}>Paid</option>
            <option value="Partial" ${state.billsFilter.status === 'Partial' ? 'selected' : ''}>Partial</option>
            <option value="Unpaid" ${state.billsFilter.status === 'Unpaid' ? 'selected' : ''}>Unpaid</option>
          </select>
          <select id="bills-filter-date" class="filter-select">
            <option value="Today" ${state.billsFilter.dateRange === 'Today' ? 'selected' : ''}>Today</option>
            <option value="Yesterday" ${state.billsFilter.dateRange === 'Yesterday' ? 'selected' : ''}>Yesterday</option>
            <option value="Week" ${state.billsFilter.dateRange === 'Week' ? 'selected' : ''}>Last 7 Days</option>
            <option value="All" ${state.billsFilter.dateRange === 'All' ? 'selected' : ''}>All Time</option>
          </select>
          <button id="btn-refresh-bills" class="btn btn-outline btn-sm">🔄 Refresh</button>
        </div>
      </div>
      <div class="card-body">
        <div id="bills-table-container">
          <div class="loading-state">Loading billing ledger...</div>
        </div>
      </div>
    </div>`;

  await loadBillsTable();

  // Attach search and filter listeners
  document.getElementById('bills-search')?.addEventListener('input', (e) => {
    state.billsFilter.search = e.target.value;
    loadBillsTable();
  });
  document.getElementById('bills-filter-status')?.addEventListener('change', (e) => {
    state.billsFilter.status = e.target.value;
    loadBillsTable();
  });
  document.getElementById('bills-filter-date')?.addEventListener('change', (e) => {
    state.billsFilter.dateRange = e.target.value;
    loadBillsTable();
  });
  document.getElementById('btn-refresh-bills')?.addEventListener('click', loadBillsTable);
}

async function loadBillsTable() {
  const container = document.getElementById('bills-table-container');
  if (!container) return;

  try {
    let query = state.supabase
      .from('bills')
      .select('*, patients(*), doctors(*), bill_items(*)')
      .order('created_at', { ascending: false });

    if (state.billsFilter.status !== 'All') {
      query = query.eq('payment_status', state.billsFilter.status);
    }

    if (state.billsFilter.dateRange === 'Today') {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      query = query.gte('created_at', startOfDay.toISOString());
    } else if (state.billsFilter.dateRange === 'Yesterday') {
      const yStart = new Date();
      yStart.setDate(yStart.getDate() - 1);
      yStart.setHours(0, 0, 0, 0);
      const yEnd = new Date();
      yEnd.setDate(yEnd.getDate() - 1);
      yEnd.setHours(23, 59, 59, 999);
      query = query.gte('created_at', yStart.toISOString()).lte('created_at', yEnd.toISOString());
    } else if (state.billsFilter.dateRange === 'Week') {
      const pastWeek = new Date();
      pastWeek.setDate(pastWeek.getDate() - 7);
      query = query.gte('created_at', pastWeek.toISOString());
    }

    const { data: bills, error } = await query;
    if (error) throw error;

    let filtered = bills || [];
    if (state.billsFilter.search) {
      const q = state.billsFilter.search.toLowerCase();
      filtered = filtered.filter(b =>
        b.bill_no.toLowerCase().includes(q) ||
        b.patients?.full_name?.toLowerCase().includes(q) ||
        b.patients?.mobile?.includes(q) ||
        b.patients?.patient_no?.toLowerCase().includes(q)
      );
    }

    if (filtered.length === 0) {
      container.innerHTML = '<div class="empty-state">No matching bills found.</div>';
      return;
    }

    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Bill ID</th>
            <th>Date &amp; Time</th>
            <th>Patient Details</th>
            <th>Referred By</th>
            <th class="text-right">Total</th>
            <th class="text-right">Paid</th>
            <th class="text-right">Balance</th>
            <th class="text-center">Status</th>
            <th class="text-center">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(b => `
            <tr>
              <td><strong>${escapeHTML(b.bill_no)}</strong></td>
              <td>${formatDate(b.created_at)}</td>
              <td>
                <strong>${escapeHTML(b.patients?.title || '')} ${escapeHTML(b.patients?.full_name || '—')}</strong>
                <div><small>${b.patients?.patient_no} · ${b.patients?.sex}, ${b.patients?.age_value}${b.patients?.age_unit}</small></div>
              </td>
              <td>${escapeHTML(b.doctors?.name || 'Self / Walk-in')}</td>
              <td class="text-right">${formatCurrency(b.total)}</td>
              <td class="text-right text-success">${formatCurrency(b.paid_amount)}</td>
              <td class="text-right ${b.balance > 0 ? 'text-danger font-bold' : ''}">${formatCurrency(b.balance)}</td>
              <td class="text-center">
                <span class="badge badge-${b.payment_status.toLowerCase()}">${b.payment_status}</span>
              </td>
              <td class="text-center">
                <div class="table-actions">
                  <button class="btn btn-outline btn-xs btn-print-receipt" data-id="${b.id}" title="Print Receipt">🖨️ Receipt</button>
                  ${b.balance > 0 ? `
                    <button class="btn btn-primary-outline btn-xs btn-collect-payment" data-id="${b.id}" data-balance="${b.balance}" title="Collect Balance">💵 Pay</button>
                  ` : ''}
                </div>
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>`;

    // Attach row action listeners
    container.querySelectorAll('.btn-print-receipt').forEach(btn => {
      btn.addEventListener('click', () => openReceiptModal(btn.dataset.id));
    });

    container.querySelectorAll('.btn-collect-payment').forEach(btn => {
      btn.addEventListener('click', () => openCollectPaymentModal(btn.dataset.id, Number(btn.dataset.balance)));
    });
  } catch (err) {
    console.error('Error loading bills:', err);
    container.innerHTML = `<div class="error-state">Failed to load bills: ${escapeHTML(err.message)}</div>`;
  }
}

// -------------------------------------------------------------
// MODULE 2: REPORTS
// -------------------------------------------------------------
function renderReportsModule(container) {
  if (state.activeReport) {
    renderResultEntryForm(container);
    return;
  }

  container.innerHTML = `
    <div class="module-header">
      <div class="module-title">
        <h1>Laboratory Reports</h1>
        <p>Result entry, automated reference interval flagging, and multi-template printing</p>
      </div>
      <div class="module-tabs">
        <button class="tab-btn ${state.reportsSubTab === 'pending' ? 'active' : ''}" id="tab-rep-pending">Pending Reports</button>
        <button class="tab-btn ${state.reportsSubTab === 'completed' ? 'active' : ''}" id="tab-rep-completed">Completed Reports</button>
        <button class="tab-btn ${state.reportsSubTab === 'all' ? 'active' : ''}" id="tab-rep-all">All Reports</button>
      </div>
    </div>
    <div class="module-body">
      <div class="card">
        <div class="card-header">
          <div class="filter-bar">
            <input type="text" id="reports-search" placeholder="Search by patient, bill no..." class="table-search" value="${escapeHTML(state.reportsFilter.search)}" />
            <select id="reports-filter-date" class="filter-select">
              <option value="Today" ${state.reportsFilter.dateRange === 'Today' ? 'selected' : ''}>Today</option>
              <option value="Yesterday" ${state.reportsFilter.dateRange === 'Yesterday' ? 'selected' : ''}>Yesterday</option>
              <option value="Week" ${state.reportsFilter.dateRange === 'Week' ? 'selected' : ''}>Last 7 Days</option>
              <option value="All" ${state.reportsFilter.dateRange === 'All' ? 'selected' : ''}>All Time</option>
            </select>
            <button id="btn-refresh-reports" class="btn btn-outline btn-sm">🔄 Refresh</button>
          </div>
        </div>
        <div class="card-body">
          <div id="reports-table-container">
            <div class="loading-state">Loading reports...</div>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById('tab-rep-pending').addEventListener('click', () => {
    state.reportsSubTab = 'pending';
    renderReportsModule(container);
  });
  document.getElementById('tab-rep-completed').addEventListener('click', () => {
    state.reportsSubTab = 'completed';
    renderReportsModule(container);
  });
  document.getElementById('tab-rep-all').addEventListener('click', () => {
    state.reportsSubTab = 'all';
    renderReportsModule(container);
  });

  document.getElementById('reports-search')?.addEventListener('input', (e) => {
    state.reportsFilter.search = e.target.value;
    loadReportsTable();
  });
  document.getElementById('reports-filter-date')?.addEventListener('change', (e) => {
    state.reportsFilter.dateRange = e.target.value;
    loadReportsTable();
  });
  document.getElementById('btn-refresh-reports')?.addEventListener('click', loadReportsTable);

  loadReportsTable();
}

async function loadReportsTable() {
  const container = document.getElementById('reports-table-container');
  if (!container) return;

  try {
    let query = state.supabase
      .from('reports')
      .select('*, bills(*, doctors(*)), patients(*), report_results(*)')
      .order('created_at', { ascending: false });

    if (state.reportsSubTab === 'pending') {
      query = query.eq('status', 'Pending');
    } else if (state.reportsSubTab === 'completed') {
      query = query.eq('status', 'Completed');
    }

    if (state.reportsFilter.dateRange === 'Today') {
      const s = new Date(); s.setHours(0,0,0,0);
      query = query.gte('created_at', s.toISOString());
    } else if (state.reportsFilter.dateRange === 'Week') {
      const w = new Date(); w.setDate(w.getDate() - 7);
      query = query.gte('created_at', w.toISOString());
    }

    const { data: reports, error } = await query;
    if (error) throw error;

    let filtered = reports || [];
    if (state.reportsFilter.search) {
      const q = state.reportsFilter.search.toLowerCase();
      filtered = filtered.filter(r =>
        r.bills?.bill_no?.toLowerCase().includes(q) ||
        r.patients?.full_name?.toLowerCase().includes(q) ||
        r.patients?.patient_no?.toLowerCase().includes(q) ||
        r.patients?.mobile?.includes(q)
      );
    }

    if (filtered.length === 0) {
      container.innerHTML = `<div class="empty-state">No ${state.reportsSubTab} reports found.</div>`;
      return;
    }

    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Bill / Order</th>
            <th>Date</th>
            <th>Patient Details</th>
            <th>Doctor</th>
            <th>Tests</th>
            <th class="text-center">Status</th>
            <th class="text-center">Action</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(r => {
            const uniqueTestCodes = [...new Set(r.report_results?.map(res => res.test_code) || [])];
            return `
              <tr>
                <td><strong>${escapeHTML(r.bills?.bill_no || '—')}</strong></td>
                <td>${formatDate(r.created_at)}</td>
                <td>
                  <strong>${escapeHTML(r.patients?.full_name || '—')}</strong>
                  <div><small>${r.patients?.patient_no} · ${r.patients?.sex}, ${r.patients?.age_value}${r.patients?.age_unit}</small></div>
                </td>
                <td>${escapeHTML(r.bills?.doctors?.name || 'Self / Walk-in')}</td>
                <td><span class="test-codes-badge">${uniqueTestCodes.join(', ')}</span></td>
                <td class="text-center">
                  <span class="badge badge-${r.status.toLowerCase()}">${r.status}</span>
                </td>
                <td class="text-center">
                  ${r.status === 'Pending' ? `
                    <button class="btn btn-primary btn-sm btn-enter-results" data-id="${r.id}">
                      ✍️ Enter Results
                    </button>
                  ` : `
                    <div class="table-actions">
                      <button class="btn btn-outline btn-sm btn-print-report" data-id="${r.id}">
                        🖨️ View / Print
                      </button>
                      <button class="btn btn-outline-danger btn-xs btn-reopen-report" data-id="${r.id}" title="Reopen for editing">
                        ✏️ Edit
                      </button>
                    </div>
                  `}
                </td>
              </tr>
            `;
          }).join('')}
        </tbody>
      </table>`;

    container.querySelectorAll('.btn-enter-results').forEach(btn => {
      btn.addEventListener('click', () => openResultEntry(btn.dataset.id));
    });

    container.querySelectorAll('.btn-print-report').forEach(btn => {
      btn.addEventListener('click', () => openReportPrintPreview(btn.dataset.id));
    });

    container.querySelectorAll('.btn-reopen-report').forEach(btn => {
      btn.addEventListener('click', () => handleReopenReport(btn.dataset.id));
    });
  } catch (err) {
    console.error('Error loading reports:', err);
    container.innerHTML = `<div class="error-state">Failed to load reports: ${escapeHTML(err.message)}</div>`;
  }
}

// -------------------------------------------------------------
// Result Entry View with Real-Time Flags
// -------------------------------------------------------------
async function openResultEntry(reportId) {
  try {
    const { data: report, error } = await state.supabase
      .from('reports')
      .select('*, bills(*, doctors(*)), patients(*), report_results(*)')
      .eq('id', reportId)
      .single();

    if (error || !report) throw error || new Error('Report not found');

    state.activeReport = report;
    renderApp();
  } catch (err) {
    showToast('Failed to open result entry: ' + err.message, 'error');
  }
}

function renderResultEntryForm(container) {
  const r = state.activeReport;
  if (!r) return;

  // Group results by test_code
  const grouped = {};
  r.report_results.sort((a, b) => a.sort_order - b.sort_order).forEach(row => {
    if (!grouped[row.test_code]) grouped[row.test_code] = [];
    grouped[row.test_code].push(row);
  });

  // Default clinical notes from catalog if empty
  let defaultNotes = r.clinical_notes || '';
  if (!defaultNotes) {
    const testKeys = Object.keys(grouped);
    defaultNotes = testKeys.map(k => reportNotes[k]).filter(Boolean).join('\n\n');
  }

  container.innerHTML = `
    <div class="result-entry-container">
      <div class="result-entry-header card">
        <div class="patient-banner">
          <div>
            <h2>${escapeHTML(r.patients.title)} ${escapeHTML(r.patients.full_name)}</h2>
            <p>Patient ID: <strong>${r.patients.patient_no}</strong> | Age/Sex: <strong>${r.patients.age_value} ${r.patients.age_unit} / ${r.patients.sex}</strong></p>
          </div>
          <div>
            <p>Bill No: <strong>${r.bills.bill_no}</strong> | Date: <strong>${formatDate(r.created_at)}</strong></p>
            <p>Referred By: <strong>${escapeHTML(r.bills.doctors?.name || 'Self / Walk-in')}</strong></p>
          </div>
          <div class="banner-actions">
            <button id="btn-back-to-reports" class="btn btn-outline btn-sm">← Back to Reports</button>
          </div>
        </div>
      </div>

      <form id="result-entry-form" class="mt-4">
        ${Object.entries(grouped).map(([code, rows]) => {
          const testMeta = state.testsCatalog.find(t => t.code === code) || TESTS[code] || {};
          return `
            <div class="card mb-4">
              <div class="card-header bg-subtle">
                <h3>${escapeHTML(testMeta.name || code)} <small>(${escapeHTML(testMeta.department || 'Clinical Lab')} · ${escapeHTML(testMeta.sample_type || testMeta.sample || 'Specimen')})</small></h3>
              </div>
              <div class="card-body">
                <table class="data-table result-input-table">
                  <thead>
                    <tr>
                      <th style="width: 35%">Parameter</th>
                      <th style="width: 25%">Result Value</th>
                      <th style="width: 15%">Unit</th>
                      <th style="width: 25%">Biological Reference Interval</th>
                    </tr>
                  </thead>
                  <tbody>
                    ${rows.map(row => {
                      const initialFlag = row.flag || '';
                      return `
                        <tr class="result-param-row ${initialFlag ? 'row-abnormal' : ''}" data-param-id="${row.id}">
                          <td>
                            <strong>${escapeHTML(row.parameter_name)}</strong>
                          </td>
                          <td>
                            <div class="result-input-wrapper">
                              <input
                                type="text"
                                class="result-value-input"
                                data-id="${row.id}"
                                data-min="${row.min_val ?? ''}"
                                data-max="${row.max_val ?? ''}"
                                data-crit-min="${row.critical_min ?? ''}"
                                data-crit-max="${row.critical_max ?? ''}"
                                value="${escapeHTML(row.value || '')}"
                                placeholder="Enter value"
                              />
                              <span class="flag-badge flag-${initialFlag.toLowerCase()}" id="flag-${row.id}">${initialFlag}</span>
                            </div>
                          </td>
                          <td>${escapeHTML(row.unit || '—')}</td>
                          <td>${escapeHTML(row.reference_range || '—')}</td>
                        </tr>
                      `;
                    }).join('')}
                  </tbody>
                </table>
              </div>
            </div>`;
        }).join('')}

        <div class="card mb-4">
          <div class="card-header">
            <h3>Clinical Notes &amp; Interpretation</h3>
          </div>
          <div class="card-body">
            <textarea id="report-clinical-notes" rows="4" class="form-control">${escapeHTML(defaultNotes)}</textarea>
            <small class="muted">Standard clinical panel notes. Editable prior to final authorization.</small>
          </div>
        </div>

        <div class="form-actions sticky-actions">
          <button type="button" id="btn-save-progress" class="btn btn-outline btn-lg">💾 Save Progress</button>
          <button type="button" id="btn-complete-report" class="btn btn-primary btn-lg">✅ Mark as Completed &amp; Print</button>
        </div>
      </form>
    </div>`;

  // Attach Result Live Flag Listeners
  container.querySelectorAll('.result-value-input').forEach(input => {
    input.addEventListener('input', () => evaluateLiveFlag(input));
  });

  container.querySelector('#btn-back-to-reports')?.addEventListener('click', () => {
    state.activeReport = null;
    renderApp();
  });

  container.querySelector('#btn-save-progress')?.addEventListener('click', () => handleSaveReport(false));
  container.querySelector('#btn-complete-report')?.addEventListener('click', () => handleSaveReport(true));
}

function evaluateLiveFlag(input) {
  const rowId = input.dataset.id;
  const flagBadge = document.getElementById(`flag-${rowId}`);
  const rowElement = input.closest('.result-param-row');
  const valStr = input.value.trim();

  if (!valStr || isNaN(Number(valStr))) {
    flagBadge.textContent = '';
    flagBadge.className = 'flag-badge';
    rowElement.classList.remove('row-abnormal', 'row-critical');
    return '';
  }

  const val = Number(valStr);
  const min = input.dataset.min ? Number(input.dataset.min) : null;
  const max = input.dataset.max ? Number(input.dataset.max) : null;
  const critMin = input.dataset.critMin ? Number(input.dataset.critMin) : null;
  const critMax = input.dataset.critMax ? Number(input.dataset.critMax) : null;

  let flag = '';
  if (critMin !== null && val < critMin) flag = 'C';
  else if (critMax !== null && val > critMax) flag = 'C';
  else if (min !== null && val < min) flag = 'L';
  else if (max !== null && val > max) flag = 'H';

  flagBadge.textContent = flag;
  flagBadge.className = `flag-badge flag-${flag.toLowerCase()}`;

  rowElement.classList.toggle('row-abnormal', flag === 'L' || flag === 'H');
  rowElement.classList.toggle('row-critical', flag === 'C');
  return flag;
}

async function handleSaveReport(markCompleted = false) {
  if (!state.activeReport) return;

  const notes = document.getElementById('report-clinical-notes').value.trim();
  const inputs = document.querySelectorAll('.result-value-input');

  const updates = [];
  inputs.forEach(input => {
    const id = input.dataset.id;
    const value = input.value.trim();
    const flag = evaluateLiveFlag(input);
    updates.push({ id, value, flag });
  });

  try {
    // 1. Batch update report_results
    for (const u of updates) {
      await state.supabase
        .from('report_results')
        .update({ value: u.value, flag: u.flag })
        .eq('id', u.id);
    }

    // 2. Update report status and notes
    const updatePayload = {
      clinical_notes: notes,
      updated_at: new Date().toISOString()
    };

    if (markCompleted) {
      updatePayload.status = 'Completed';
      updatePayload.completed_at = new Date().toISOString();
      updatePayload.completed_by = state.user.id;
    }

    const { error: repErr } = await state.supabase
      .from('reports')
      .update(updatePayload)
      .eq('id', state.activeReport.id);

    if (repErr) throw repErr;

    if (markCompleted) {
      showToast('Report completed and finalized!', 'success');
      const repId = state.activeReport.id;
      state.activeReport = null;
      renderApp();
      openReportPrintPreview(repId);
    } else {
      showToast('Progress saved successfully', 'success');
    }
  } catch (err) {
    console.error('Failed to save report:', err);
    showToast('Failed to save report: ' + err.message, 'error');
  }
}

async function handleReopenReport(reportId) {
  if (!confirm('Reopening will set the report status back to Pending. Do you wish to continue?')) return;
  try {
    const { error } = await state.supabase
      .from('reports')
      .update({ status: 'Pending', completed_at: null })
      .eq('id', reportId);
    if (error) throw error;
    showToast('Report reopened for editing', 'info');
    openResultEntry(reportId);
  } catch (err) {
    showToast('Error reopening report: ' + err.message, 'error');
  }
}

// -------------------------------------------------------------
// MODULE 3: PRINTING & PDF EXPORT
// -------------------------------------------------------------
async function openReceiptModal(billId) {
  try {
    const { data: bill, error } = await state.supabase
      .from('bills')
      .select('*, patients(*), doctors(*), bill_items(*), payments(*)')
      .eq('id', billId)
      .single();

    if (error || !bill) throw error || new Error('Bill not found');

    const modalContainer = document.getElementById('modal-container');
    modalContainer.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-dialog modal-lg">
          <div class="modal-header">
            <h3>Invoice &amp; Payment Receipt</h3>
            <button class="modal-close" id="modal-close-btn">&times;</button>
          </div>
          <div class="modal-body">
            <div class="receipt-preview-controls mb-3">
              <label>Print Format:</label>
              <select id="receipt-format-select" class="form-control" style="width: auto; display: inline-block;">
                <option value="thermal">80mm Thermal Receipt (POS Roll)</option>
                <option value="a4">A4 Full Sheet Invoice</option>
              </select>
            </div>
            <div id="receipt-rendered-content" class="receipt-preview-box">
              <!-- Rendered receipt -->
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" id="receipt-close-btn">Close</button>
            <button class="btn btn-primary" id="btn-do-print-receipt">🖨️ Print Receipt</button>
          </div>
        </div>
      </div>`;

    const formatSelect = document.getElementById('receipt-format-select');
    const previewBox = document.getElementById('receipt-rendered-content');

    function updatePreview() {
      const format = formatSelect.value;
      previewBox.innerHTML = generateReceiptHTML(bill, state.labSettings, format);
    }
    updatePreview();
    formatSelect.addEventListener('change', updatePreview);

    document.getElementById('modal-close-btn').addEventListener('click', () => modalContainer.innerHTML = '');
    document.getElementById('receipt-close-btn').addEventListener('click', () => modalContainer.innerHTML = '');

    document.getElementById('btn-do-print-receipt').addEventListener('click', async () => {
      const format = formatSelect.value;
      const html = generateReceiptHTML(bill, state.labSettings, format, true);
      const res = await window.labflowAPI.printReceipt({ html, format });
      if (res.success) {
        showToast('Receipt printed successfully', 'success');
        modalContainer.innerHTML = '';
      } else {
        showToast('Print error: ' + (res.failureReason || 'Failed'), 'error');
      }
    });
  } catch (err) {
    showToast('Failed to load receipt: ' + err.message, 'error');
  }
}

function generateReceiptHTML(bill, lab, format = 'thermal', fullPage = false) {
  const inWords = numberToWords(bill.paid_amount || bill.total);
  const labName = lab.lab_name || 'Anand Diagnostic Laboratory';
  const labAddr = lab.address || 'Bangalore, Karnataka';
  const labPhone = lab.phone || '+91 98765 43210';
  const labReg = lab.registration_no || 'KA-BLR-LAB';

  const itemsRows = bill.bill_items.map(item => `
    <tr>
      <td>${escapeHTML(item.test_name)}</td>
      <td class="text-right">${formatCurrency(item.price)}</td>
    </tr>
  `).join('');

  if (format === 'thermal') {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          @page { size: 80mm auto; margin: 2mm; }
          body { font-family: monospace, sans-serif; width: 72mm; margin: 0 auto; font-size: 11px; line-height: 1.3; color: #000; }
          .center { text-align: center; }
          .text-right { text-align: right; }
          .bold { font-weight: bold; }
          .divider { border-top: 1px dashed #000; margin: 4px 0; }
          .double-divider { border-top: 2px solid #000; margin: 4px 0; }
          table { width: 100%; border-collapse: collapse; font-size: 11px; }
          th, td { padding: 2px 0; }
          .words { font-size: 10px; font-style: italic; margin-top: 4px; }
          .signature-box { margin-top: 18px; text-align: right; }
        </style>
      </head>
      <body>
        <div class="center bold" style="font-size: 13px;">${escapeHTML(labName)}</div>
        <div class="center" style="font-size: 10px;">${escapeHTML(labAddr)}</div>
        <div class="center" style="font-size: 10px;">Phone: ${escapeHTML(labPhone)} | Reg: ${escapeHTML(labReg)}</div>
        <div class="double-divider"></div>
        <div class="center bold">DIAGNOSTIC PAYMENT RECEIPT</div>
        <div class="divider"></div>
        <div>Receipt No: <strong>${escapeHTML(bill.bill_no)}</strong></div>
        <div>Date &amp; Time: ${formatDate(bill.created_at)}</div>
        <div>Patient: <strong>${escapeHTML(bill.patients?.title)} ${escapeHTML(bill.patients?.full_name)}</strong></div>
        <div>ID / Sex / Age: ${bill.patients?.patient_no} / ${bill.patients?.sex} / ${bill.patients?.age_value}${bill.patients?.age_unit}</div>
        <div>Ref Doctor: ${escapeHTML(bill.doctors?.name || 'Self / Walk-in')}</div>
        <div class="divider"></div>
        <table>
          <thead>
            <tr><th style="text-align: left;">Test Description</th><th class="text-right">Price</th></tr>
          </thead>
          <tbody>${itemsRows}</tbody>
        </table>
        <div class="divider"></div>
        <table>
          <tr><td>Subtotal:</td><td class="text-right">${formatCurrency(bill.subtotal)}</td></tr>
          ${bill.discount > 0 ? `<tr><td>Discount:</td><td class="text-right">-${formatCurrency(bill.discount)}</td></tr>` : ''}
          <tr class="bold"><td>Total:</td><td class="text-right">${formatCurrency(bill.total)}</td></tr>
          <tr class="bold"><td>Amount Paid:</td><td class="text-right">${formatCurrency(bill.paid_amount)}</td></tr>
          <tr><td>Balance Due:</td><td class="text-right">${formatCurrency(bill.balance)}</td></tr>
          <tr><td>Mode:</td><td class="text-right">${escapeHTML(bill.payments?.[0]?.mode || 'Cash')}</td></tr>
        </table>
        <div class="divider"></div>
        <div class="words">${escapeHTML(inWords)}</div>
        <div class="signature-box">
          <p>Authorized Signatory</p>
        </div>
        <div class="center" style="margin-top: 10px; font-size: 9px;">Thank you for choosing ${escapeHTML(labName)}</div>
      </body>
      </html>`;
  } else {
    // A4 Format
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          @page { size: A4; margin: 15mm; }
          body { font-family: 'DM Sans', Arial, sans-serif; font-size: 13px; color: #1e293b; line-height: 1.5; }
          .header { display: flex; justify-content: space-between; border-bottom: 2px solid #0d9488; padding-bottom: 12px; }
          .lab-name { font-size: 20px; font-weight: bold; color: #0f766e; }
          .text-right { text-align: right; }
          .patient-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; margin: 15px 0; display: flex; justify-content: space-between; }
          table { width: 100%; border-collapse: collapse; margin-top: 15px; }
          th { background: #f1f5f9; padding: 8px; text-align: left; border-bottom: 1px solid #cbd5e1; }
          td { padding: 8px; border-bottom: 1px solid #e2e8f0; }
          .summary-table { width: 45%; margin-left: auto; margin-top: 15px; }
          .summary-table td { padding: 4px 8px; }
          .total-row { font-weight: bold; font-size: 14px; border-top: 1px solid #000; border-bottom: 1px solid #000; }
          .footer { margin-top: 40px; display: flex; justify-content: space-between; align-items: flex-end; }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="lab-name">${escapeHTML(labName)}</div>
            <div>${escapeHTML(labAddr)}</div>
            <div>Phone: ${escapeHTML(labPhone)} | Email: ${escapeHTML(lab.email || '')}</div>
          </div>
          <div class="text-right">
            <h2>TAX INVOICE / RECEIPT</h2>
            <div><strong>Bill No:</strong> ${escapeHTML(bill.bill_no)}</div>
            <div><strong>Date:</strong> ${formatDate(bill.created_at)}</div>
          </div>
        </div>

        <div class="patient-box">
          <div>
            <div><strong>Patient Name:</strong> ${escapeHTML(bill.patients?.title)} ${escapeHTML(bill.patients?.full_name)}</div>
            <div><strong>Patient ID:</strong> ${bill.patients?.patient_no}</div>
            <div><strong>Age / Sex:</strong> ${bill.patients?.age_value} ${bill.patients?.age_unit} / ${bill.patients?.sex}</div>
          </div>
          <div>
            <div><strong>Mobile:</strong> ${escapeHTML(bill.patients?.mobile || '—')}</div>
            <div><strong>Referred By:</strong> ${escapeHTML(bill.doctors?.name || 'Self / Walk-in')}</div>
            <div><strong>Payment Status:</strong> ${bill.payment_status}</div>
          </div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width: 10%">Sl.</th>
              <th>Test Panel Description</th>
              <th>Specimen</th>
              <th class="text-right" style="width: 20%">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            ${bill.bill_items.map((item, idx) => `
              <tr>
                <td>${idx + 1}</td>
                <td><strong>${escapeHTML(item.test_name)}</strong></td>
                <td>${escapeHTML(item.test_sample_type)}</td>
                <td class="text-right">${formatCurrency(item.price)}</td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <table class="summary-table">
          <tr><td>Subtotal:</td><td class="text-right">${formatCurrency(bill.subtotal)}</td></tr>
          ${bill.discount > 0 ? `<tr><td>Discount:</td><td class="text-right">-${formatCurrency(bill.discount)}</td></tr>` : ''}
          <tr class="total-row"><td>Total Amount:</td><td class="text-right">${formatCurrency(bill.total)}</td></tr>
          <tr><td>Amount Paid:</td><td class="text-right">${formatCurrency(bill.paid_amount)}</td></tr>
          <tr style="font-weight: bold;"><td>Balance Due:</td><td class="text-right">${formatCurrency(bill.balance)}</td></tr>
        </table>

        <div style="margin-top: 10px; font-weight: 500;">
          Amount in Words: <em>${escapeHTML(inWords)}</em>
        </div>

        <div class="footer">
          <div>
            <small>This is a computer generated diagnostic receipt.</small>
          </div>
          <div class="text-right">
            <p>For ${escapeHTML(labName)}</p>
            <br><br>
            <p><strong>Authorized Signatory</strong></p>
          </div>
        </div>
      </body>
      </html>`;
  }
}

// -------------------------------------------------------------
// Report Printing with 3 Letterhead Styles
// -------------------------------------------------------------
async function openReportPrintPreview(reportId) {
  try {
    const { data: report, error } = await state.supabase
      .from('reports')
      .select('*, bills(*, doctors(*)), patients(*), report_results(*)')
      .eq('id', reportId)
      .single();

    if (error || !report) throw error || new Error('Report not found');

    // Adapt database report structure to renderReport format
    const orderAdapter = {
      id: report.bills?.bill_no,
      patientId: report.patients?.patient_no,
      name: `${report.patients?.title} ${report.patients?.full_name}`,
      age: report.patients?.age_value,
      sex: report.patients?.sex,
      referrer: report.bills?.doctors?.name || 'Self',
      createdAt: report.created_at,
      collectedAt: report.created_at,
      receivedAt: report.created_at,
      approvedAt: report.completed_at,
      status: report.status === 'Completed' ? 'Approved' : 'Draft',
      notes: report.clinical_notes,
      tests: [...new Set(report.report_results?.map(r => r.test_code) || [])],
      results: Object.fromEntries(report.report_results?.map(r => [r.parameter_code, r.value]) || [])
    };

    const settingsAdapter = {
      labName: state.labSettings.lab_name,
      address: state.labSettings.address,
      phone: state.labSettings.phone,
      email: state.labSettings.email,
      registration: state.labSettings.registration_no,
      pathologist: state.labSettings.pathologist_name,
      pathologistQualification: state.labSettings.pathologist_qualification,
      labIncharge: state.labSettings.lab_incharge,
      labInchargeQualification: state.labSettings.lab_incharge_qualification,
      reportFooter: state.labSettings.report_footer,
      workingHours: state.labSettings.working_hours,
      reportTemplate: state.labSettings.letterhead_template || 'classic'
    };

    const modalContainer = document.getElementById('modal-container');
    modalContainer.innerHTML = `
      <div class="modal-overlay">
        <div class="modal-dialog modal-xl">
          <div class="modal-header">
            <h3>Diagnostic Clinical Report - ${escapeHTML(report.bills?.bill_no)}</h3>
            <div class="template-selector">
              <label>Letterhead Style:</label>
              <select id="report-template-select">
                ${REPORT_TEMPLATES.map(tpl =>
                  `<option value="${tpl.id}" ${tpl.id === settingsAdapter.reportTemplate ? 'selected' : ''}>${tpl.name}</option>`
                ).join('')}
              </select>
            </div>
            <button class="modal-close" id="modal-close-btn">&times;</button>
          </div>
          <div class="modal-body">
            <div id="report-rendered-view" class="report-preview-frame"></div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" id="btn-close-rep-modal">Close</button>
            <button class="btn btn-outline" id="btn-export-pdf">📥 Export PDF</button>
            <button class="btn btn-primary" id="btn-print-report-now">🖨️ Print Clinical Report</button>
          </div>
        </div>
      </div>`;

    const tplSelect = document.getElementById('report-template-select');
    const viewContainer = document.getElementById('report-rendered-view');

    function renderActiveHTML() {
      const template = tplSelect.value;
      const html = renderReport(orderAdapter, settingsAdapter, { template });
      viewContainer.innerHTML = html;
      return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Report ${orderAdapter.id}</title><link rel="stylesheet" href="./report.css"></head><body>${html}</body></html>`;
    }

    renderActiveHTML();
    tplSelect.addEventListener('change', renderActiveHTML);

    document.getElementById('modal-close-btn').addEventListener('click', () => modalContainer.innerHTML = '');
    document.getElementById('btn-close-rep-modal').addEventListener('click', () => modalContainer.innerHTML = '');

    document.getElementById('btn-print-report-now').addEventListener('click', async () => {
      const fullHtml = renderActiveHTML();
      const res = await window.labflowAPI.printReport({ html: fullHtml });
      if (res.success) {
        showToast('Report printed successfully', 'success');
      } else {
        showToast('Print failed: ' + (res.failureReason || 'Error'), 'error');
      }
    });

    document.getElementById('btn-export-pdf').addEventListener('click', async () => {
      const fullHtml = renderActiveHTML();
      const filename = `Report-${orderAdapter.id}-${orderAdapter.name.replace(/\s+/g, '_')}.pdf`;
      const res = await window.labflowAPI.printToPDF({ html: fullHtml, defaultFilename: filename });
      if (res.success) {
        showToast('Saved PDF to ' + res.filePath, 'success');
      } else if (!res.canceled) {
        showToast('Failed to export PDF: ' + res.error, 'error');
      }
    });
  } catch (err) {
    showToast('Failed to load report preview: ' + err.message, 'error');
  }
}

// -------------------------------------------------------------
// MODULE 4: SETTINGS (Minimal)
// -------------------------------------------------------------
function renderSettingsModule(container) {
  container.innerHTML = `
    <div class="module-header">
      <div class="module-title">
        <h1>Laboratory Settings</h1>
        <p>Lab profile, doctors, referral sources, test catalog pricing and account security</p>
      </div>
      <div class="module-tabs">
        <button class="tab-btn ${state.settingsSubTab === 'profile' ? 'active' : ''}" id="tab-set-profile">Lab Details &amp; Letterhead</button>
        <button class="tab-btn ${state.settingsSubTab === 'doctors' ? 'active' : ''}" id="tab-set-doctors">Doctors Directory</button>
        <button class="tab-btn ${state.settingsSubTab === 'referrals' ? 'active' : ''}" id="tab-set-referrals">Referral Sources</button>
        <button class="tab-btn ${state.settingsSubTab === 'catalog' ? 'active' : ''}" id="tab-set-catalog">Test Catalog &amp; Pricing</button>
        <button class="tab-btn ${state.settingsSubTab === 'security' ? 'active' : ''}" id="tab-set-security">Account Security</button>
      </div>
    </div>
    <div class="module-body" id="settings-body"></div>`;

  document.getElementById('tab-set-profile').addEventListener('click', () => { state.settingsSubTab = 'profile'; renderSettingsModule(container); });
  document.getElementById('tab-set-doctors').addEventListener('click', () => { state.settingsSubTab = 'doctors'; renderSettingsModule(container); });
  document.getElementById('tab-set-referrals').addEventListener('click', () => { state.settingsSubTab = 'referrals'; renderSettingsModule(container); });
  document.getElementById('tab-set-catalog').addEventListener('click', () => { state.settingsSubTab = 'catalog'; renderSettingsModule(container); });
  document.getElementById('tab-set-security').addEventListener('click', () => { state.settingsSubTab = 'security'; renderSettingsModule(container); });

  const body = document.getElementById('settings-body');
  if (state.settingsSubTab === 'profile') renderLabProfileSettings(body);
  else if (state.settingsSubTab === 'doctors') renderDoctorsSettings(body);
  else if (state.settingsSubTab === 'referrals') renderReferralsSettings(body);
  else if (state.settingsSubTab === 'catalog') renderCatalogSettings(body);
  else if (state.settingsSubTab === 'security') renderSecuritySettings(body);
}

function renderLabProfileSettings(container) {
  const lab = state.labSettings;
  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>Laboratory Profile &amp; Letterhead Customization</h3>
      </div>
      <div class="card-body">
        <form id="lab-profile-form">
          <div class="form-row">
            <div class="form-group col-6">
              <label>Laboratory Name *</label>
              <input type="text" id="lab-name" value="${escapeHTML(lab.lab_name || '')}" required />
            </div>
            <div class="form-group col-6">
              <label>Tagline / Motto</label>
              <input type="text" id="lab-tagline" value="${escapeHTML(lab.tagline || '')}" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group col-12">
              <label>Full Physical Address</label>
              <input type="text" id="lab-address" value="${escapeHTML(lab.address || '')}" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group col-4">
              <label>Phone Number</label>
              <input type="text" id="lab-phone" value="${escapeHTML(lab.phone || '')}" />
            </div>
            <div class="form-group col-4">
              <label>Official Email</label>
              <input type="email" id="lab-email" value="${escapeHTML(lab.email || '')}" />
            </div>
            <div class="form-group col-4">
              <label>Registration / License No.</label>
              <input type="text" id="lab-reg" value="${escapeHTML(lab.registration_no || '')}" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group col-6">
              <label>Consultant Pathologist Name</label>
              <input type="text" id="lab-pathologist" value="${escapeHTML(lab.pathologist_name || '')}" />
            </div>
            <div class="form-group col-6">
              <label>Pathologist Qualifications</label>
              <input type="text" id="lab-pathologist-deg" value="${escapeHTML(lab.pathologist_qualification || '')}" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group col-6">
              <label>Laboratory In-Charge / Technologist</label>
              <input type="text" id="lab-incharge" value="${escapeHTML(lab.lab_incharge || '')}" />
            </div>
            <div class="form-group col-6">
              <label>In-Charge Qualifications</label>
              <input type="text" id="lab-incharge-deg" value="${escapeHTML(lab.lab_incharge_qualification || '')}" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group col-6">
              <label>Default Letterhead Theme</label>
              <select id="lab-template">
                ${REPORT_TEMPLATES.map(t =>
                  `<option value="${t.id}" ${t.id === lab.letterhead_template ? 'selected' : ''}>${t.name} (${t.description})</option>`
                ).join('')}
              </select>
            </div>
            <div class="form-group col-6">
              <label>Working Hours</label>
              <input type="text" id="lab-hours" value="${escapeHTML(lab.working_hours || '')}" />
            </div>
          </div>

          <div class="form-row">
            <div class="form-group col-12">
              <label>Report Footer Disclaimer</label>
              <input type="text" id="lab-footer" value="${escapeHTML(lab.report_footer || '')}" />
            </div>
          </div>

          <div class="mt-3">
            <button type="submit" class="btn btn-primary">Save Laboratory Settings</button>
          </div>
        </form>
      </div>
    </div>`;

  document.getElementById('lab-profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      lab_name: document.getElementById('lab-name').value.trim(),
      tagline: document.getElementById('lab-tagline').value.trim(),
      address: document.getElementById('lab-address').value.trim(),
      phone: document.getElementById('lab-phone').value.trim(),
      email: document.getElementById('lab-email').value.trim(),
      registration_no: document.getElementById('lab-reg').value.trim(),
      pathologist_name: document.getElementById('lab-pathologist').value.trim(),
      pathologist_qualification: document.getElementById('lab-pathologist-deg').value.trim(),
      lab_incharge: document.getElementById('lab-incharge').value.trim(),
      lab_incharge_qualification: document.getElementById('lab-incharge-deg').value.trim(),
      letterhead_template: document.getElementById('lab-template').value,
      working_hours: document.getElementById('lab-hours').value.trim(),
      report_footer: document.getElementById('lab-footer').value.trim(),
      updated_at: new Date().toISOString()
    };

    try {
      const { error } = await state.supabase.from('lab_settings').upsert({ id: lab.id, ...payload });
      if (error) throw error;
      state.labSettings = { ...lab, ...payload };
      showToast('Lab profile updated successfully', 'success');
      renderApp();
    } catch (err) {
      showToast('Failed to save settings: ' + err.message, 'error');
    }
  });
}

function renderDoctorsSettings(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>Referring Doctors Directory</h3>
        <button class="btn btn-primary btn-sm" id="btn-add-doc-modal">+ Add Doctor</button>
      </div>
      <div class="card-body">
        <table class="data-table">
          <thead>
            <tr>
              <th>Doctor Name</th>
              <th>Qualifications</th>
              <th>Phone</th>
              <th class="text-center">Status</th>
              <th class="text-center">Action</th>
            </tr>
          </thead>
          <tbody>
            ${state.doctors.map(d => `
              <tr>
                <td><strong>${escapeHTML(d.name)}</strong></td>
                <td>${escapeHTML(d.qualification || '—')}</td>
                <td>${escapeHTML(d.phone || '—')}</td>
                <td class="text-center">
                  <span class="badge ${d.active ? 'badge-paid' : 'badge-unpaid'}">${d.active ? 'Active' : 'Inactive'}</span>
                </td>
                <td class="text-center">
                  <button class="btn btn-outline btn-xs btn-toggle-doctor" data-id="${d.id}" data-active="${d.active}">
                    ${d.active ? 'Deactivate' : 'Activate'}
                  </button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  document.getElementById('btn-add-doc-modal').addEventListener('click', openAddDoctorModal);

  container.querySelectorAll('.btn-toggle-doctor').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const nextActive = btn.dataset.active === 'false';
      await state.supabase.from('doctors').update({ active: nextActive }).eq('id', id);
      await loadReferenceData();
      renderDoctorsSettings(container);
    });
  });
}

function renderReferralsSettings(container) {
  container.innerHTML = `
    <div class="form-row">
      <div class="col-6">
        <div class="card">
          <div class="card-header">
            <h3>Referral Laboratories</h3>
            <button class="btn btn-primary btn-sm" id="btn-add-lab-modal">+ Add Lab</button>
          </div>
          <div class="card-body">
            <table class="data-table">
              <thead><tr><th>Name</th><th class="text-center">Status</th></tr></thead>
              <tbody>
                ${state.referralLabs.map(l => `
                  <tr>
                    <td><strong>${escapeHTML(l.name)}</strong></td>
                    <td class="text-center"><span class="badge ${l.active ? 'badge-paid' : 'badge-unpaid'}">${l.active ? 'Active' : 'Inactive'}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <div class="col-6">
        <div class="card">
          <div class="card-header">
            <h3>Referral Hospitals</h3>
            <button class="btn btn-primary btn-sm" id="btn-add-hosp-modal">+ Add Hospital</button>
          </div>
          <div class="card-body">
            <table class="data-table">
              <thead><tr><th>Name</th><th class="text-center">Status</th></tr></thead>
              <tbody>
                ${state.referralHospitals.map(h => `
                  <tr>
                    <td><strong>${escapeHTML(h.name)}</strong></td>
                    <td class="text-center"><span class="badge ${h.active ? 'badge-paid' : 'badge-unpaid'}">${h.active ? 'Active' : 'Inactive'}</span></td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById('btn-add-lab-modal').addEventListener('click', openAddReferralLabModal);
  document.getElementById('btn-add-hosp-modal').addEventListener('click', openAddReferralHospitalModal);
}

function renderCatalogSettings(container) {
  container.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>Diagnostic Test Catalog &amp; Prices</h3>
      </div>
      <div class="card-body">
        <table class="data-table">
          <thead>
            <tr>
              <th>Code</th>
              <th>Test Panel Name</th>
              <th>Department</th>
              <th>Sample Type</th>
              <th style="width: 140px;">Price (₹)</th>
              <th class="text-center">Status</th>
              <th class="text-center">Save</th>
            </tr>
          </thead>
          <tbody>
            ${state.testsCatalog.map(t => `
              <tr data-test-id="${t.id}">
                <td><strong>${escapeHTML(t.code)}</strong></td>
                <td>${escapeHTML(t.name)}</td>
                <td>${escapeHTML(t.department)}</td>
                <td><small>${escapeHTML(t.sample_type)}</small></td>
                <td>
                  <input type="number" class="form-control price-edit-input" data-id="${t.id}" value="${t.price}" min="0" />
                </td>
                <td class="text-center">
                  <span class="badge ${t.active ? 'badge-paid' : 'badge-unpaid'}">${t.active ? 'Active' : 'Inactive'}</span>
                </td>
                <td class="text-center">
                  <button class="btn btn-primary-outline btn-xs btn-save-test-price" data-id="${t.id}">Update</button>
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    </div>`;

  container.querySelectorAll('.btn-save-test-price').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const input = container.querySelector(`.price-edit-input[data-id="${id}"]`);
      const newPrice = Number(input.value || 0);
      try {
        const { error } = await state.supabase.from('tests').update({ price: newPrice }).eq('id', id);
        if (error) throw error;
        showToast('Test price updated', 'success');
        await loadReferenceData();
      } catch (err) {
        showToast('Error updating price: ' + err.message, 'error');
      }
    });
  });
}

function renderSecuritySettings(container) {
  container.innerHTML = `
    <div class="card" style="max-width: 500px;">
      <div class="card-header">
        <h3>Change Staff Password</h3>
      </div>
      <div class="card-body">
        <form id="change-pwd-form">
          <div class="form-group mb-3">
            <label>New Password</label>
            <input type="password" id="new-password" placeholder="••••••••" required minlength="8" />
          </div>
          <div class="form-group mb-3">
            <label>Confirm New Password</label>
            <input type="password" id="confirm-password" placeholder="••••••••" required minlength="8" />
          </div>
          <button type="submit" class="btn btn-primary">Update Password</button>
        </form>
      </div>
    </div>`;

  document.getElementById('change-pwd-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const p1 = document.getElementById('new-password').value;
    const p2 = document.getElementById('confirm-password').value;
    if (p1 !== p2) {
      showToast('Passwords do not match.', 'error');
      return;
    }
    try {
      const { error } = await state.supabase.auth.updateUser({ password: p1 });
      if (error) throw error;
      showToast('Password updated successfully', 'success');
      document.getElementById('change-pwd-form').reset();
    } catch (err) {
      showToast('Password change failed: ' + err.message, 'error');
    }
  });
}

// -------------------------------------------------------------
// Quick Add Modals (Doctors, Labs, Hospitals, Payment)
// -------------------------------------------------------------
function openAddDoctorModal() {
  const modalContainer = document.getElementById('modal-container');
  modalContainer.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-dialog">
        <div class="modal-header">
          <h3>Add Referring Doctor</h3>
          <button class="modal-close" id="modal-close-btn">&times;</button>
        </div>
        <form id="quick-add-doc-form">
          <div class="modal-body">
            <div class="form-group mb-3">
              <label>Doctor Full Name *</label>
              <input type="text" id="new-doc-name" placeholder="Dr. Firstname Lastname" required />
            </div>
            <div class="form-group mb-3">
              <label>Degrees / Speciality</label>
              <input type="text" id="new-doc-qual" placeholder="MBBS, MD" />
            </div>
            <div class="form-group">
              <label>Phone Number</label>
              <input type="tel" id="new-doc-phone" placeholder="+91 ..." />
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" id="modal-cancel-btn">Cancel</button>
            <button type="submit" class="btn btn-primary">Save Doctor</button>
          </div>
        </form>
      </div>
    </div>`;

  document.getElementById('modal-close-btn').addEventListener('click', () => modalContainer.innerHTML = '');
  document.getElementById('modal-cancel-btn').addEventListener('click', () => modalContainer.innerHTML = '');

  document.getElementById('quick-add-doc-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('new-doc-name').value.trim();
    const qualification = document.getElementById('new-doc-qual').value.trim();
    const phone = document.getElementById('new-doc-phone').value.trim();

    try {
      const { data, error } = await state.supabase.from('doctors').insert({ name, qualification, phone }).select().single();
      if (error) throw error;
      showToast('Doctor added successfully', 'success');
      await loadReferenceData();
      modalContainer.innerHTML = '';
      if (state.currentPage === 'billing' && state.billingSubTab === 'new') {
        state.newBill.doctorId = data.id;
        renderNewBillForm(document.getElementById('billing-body'));
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });
}

function openAddReferralLabModal() {
  const modalContainer = document.getElementById('modal-container');
  modalContainer.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-dialog">
        <div class="modal-header">
          <h3>Add Referral Laboratory</h3>
          <button class="modal-close" id="modal-close-btn">&times;</button>
        </div>
        <form id="quick-add-lab-form">
          <div class="modal-body">
            <div class="form-group">
              <label>Lab Name *</label>
              <input type="text" id="new-lab-name" required />
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" id="modal-cancel-btn">Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>`;

  document.getElementById('modal-close-btn').addEventListener('click', () => modalContainer.innerHTML = '');
  document.getElementById('modal-cancel-btn').addEventListener('click', () => modalContainer.innerHTML = '');

  document.getElementById('quick-add-lab-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('new-lab-name').value.trim();
    try {
      const { data, error } = await state.supabase.from('referral_labs').insert({ name }).select().single();
      if (error) throw error;
      showToast('Referral Lab added', 'success');
      await loadReferenceData();
      modalContainer.innerHTML = '';
      if (state.currentPage === 'billing' && state.billingSubTab === 'new') {
        state.newBill.referralLabId = data.id;
        renderNewBillForm(document.getElementById('billing-body'));
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });
}

function openAddReferralHospitalModal() {
  const modalContainer = document.getElementById('modal-container');
  modalContainer.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-dialog">
        <div class="modal-header">
          <h3>Add Referral Hospital</h3>
          <button class="modal-close" id="modal-close-btn">&times;</button>
        </div>
        <form id="quick-add-hosp-form">
          <div class="modal-body">
            <div class="form-group">
              <label>Hospital Name *</label>
              <input type="text" id="new-hosp-name" required />
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" id="modal-cancel-btn">Cancel</button>
            <button type="submit" class="btn btn-primary">Save</button>
          </div>
        </form>
      </div>
    </div>`;

  document.getElementById('modal-close-btn').addEventListener('click', () => modalContainer.innerHTML = '');
  document.getElementById('modal-cancel-btn').addEventListener('click', () => modalContainer.innerHTML = '');

  document.getElementById('quick-add-hosp-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = document.getElementById('new-hosp-name').value.trim();
    try {
      const { data, error } = await state.supabase.from('referral_hospitals').insert({ name }).select().single();
      if (error) throw error;
      showToast('Referral Hospital added', 'success');
      await loadReferenceData();
      modalContainer.innerHTML = '';
      if (state.currentPage === 'billing' && state.billingSubTab === 'new') {
        state.newBill.referralHospitalId = data.id;
        renderNewBillForm(document.getElementById('billing-body'));
      }
    } catch (err) {
      showToast('Error: ' + err.message, 'error');
    }
  });
}

function openCollectPaymentModal(billId, maxBalance) {
  const modalContainer = document.getElementById('modal-container');
  modalContainer.innerHTML = `
    <div class="modal-overlay">
      <div class="modal-dialog">
        <div class="modal-header">
          <h3>Collect Balance Payment</h3>
          <button class="modal-close" id="modal-close-btn">&times;</button>
        </div>
        <form id="collect-pay-form">
          <div class="modal-body">
            <div class="form-group mb-3">
              <label>Payment Amount (₹) *</label>
              <input type="number" id="pay-amount" min="1" max="${maxBalance}" value="${maxBalance}" required />
            </div>
            <div class="form-group mb-3">
              <label>Payment Mode</label>
              <select id="pay-mode">
                ${['Cash', 'UPI', 'Card', 'Net Banking', 'Other'].map(m => `<option value="${m}">${m}</option>`).join('')}
              </select>
            </div>
            <div class="form-group">
              <label>Payment Notes</label>
              <input type="text" id="pay-notes" placeholder="Optional transaction ID or note" />
            </div>
          </div>
          <div class="modal-footer">
            <button type="button" class="btn btn-outline" id="modal-cancel-btn">Cancel</button>
            <button type="submit" class="btn btn-primary">Record Payment</button>
          </div>
        </form>
      </div>
    </div>`;

  document.getElementById('modal-close-btn').addEventListener('click', () => modalContainer.innerHTML = '');
  document.getElementById('modal-cancel-btn').addEventListener('click', () => modalContainer.innerHTML = '');

  document.getElementById('collect-pay-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const amount = Number(document.getElementById('pay-amount').value);
    const mode = document.getElementById('pay-mode').value;
    const notes = document.getElementById('pay-notes').value.trim();

    try {
      const { data, error } = await state.supabase.rpc('collect_bill_payment', {
        p_bill_id: billId,
        p_amount: amount,
        p_mode: mode,
        p_notes: notes
      });

      if (error) throw error;
      showToast('Payment recorded successfully', 'success');
      modalContainer.innerHTML = '';
      loadBillsTable();
      openReceiptModal(billId);
    } catch (err) {
      showToast('Payment error: ' + err.message, 'error');
    }
  });
}

// -------------------------------------------------------------
// Launch on DOM Ready
// -------------------------------------------------------------
window.addEventListener('DOMContentLoaded', init);

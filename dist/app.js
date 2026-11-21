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

function uiIcon(name, size = 16, className = '') {
  const extraClass = className ? ` ${className}` : '';
  const s = size;
  const icons = {
    'credit-card': `<svg class="svg-icon${extraClass}" width="${s}" height="${s}" viewBox="0 0 24 24"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="10" x2="22" y2="10"/></svg>`,
    'clipboard': `<svg class="svg-icon${extraClass}" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>`,
    'settings': `<svg class="svg-icon${extraClass}" width="${s}" height="${s}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
    'user': `<svg class="svg-icon${extraClass}" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`,
    'phone': `<svg class="svg-icon${extraClass}" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/></svg>`,
    'search': `<svg class="svg-icon${extraClass}" width="${s}" height="${s}" viewBox="0 0 24 24"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
    'refresh': `<svg class="svg-icon${extraClass}" width="${s}" height="${s}" viewBox="0 0 24 24"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
    'printer': `<svg class="svg-icon${extraClass}" width="${s}" height="${s}" viewBox="0 0 24 24"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>`,
    'wallet': `<svg class="svg-icon${extraClass}" width="${s}" height="${s}" viewBox="0 0 24 24"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="M7 15h0M2 10h20"/></svg>`,
    'edit': `<svg class="svg-icon${extraClass}" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>`,
    'save': `<svg class="svg-icon${extraClass}" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>`,
    'check-circle': `<svg class="svg-icon${extraClass}" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>`,
    'download': `<svg class="svg-icon${extraClass}" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
    'log-out': `<svg class="svg-icon${extraClass}" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>`,
    'plus': `<svg class="svg-icon${extraClass}" width="${s}" height="${s}" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`,
    'lock': `<svg class="svg-icon${extraClass}" width="${s}" height="${s}" viewBox="0 0 24 24"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
    'eye': `<svg class="svg-icon${extraClass}" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>`,
    'eye-off': `<svg class="svg-icon${extraClass}" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`,
    'shield-check': `<svg class="svg-icon${extraClass}" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><polyline points="9 12 11 14 15 10"/></svg>`,
    'arrow-right': `<svg class="svg-icon${extraClass}" width="${s}" height="${s}" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
    'info': `<svg class="svg-icon${extraClass}" width="${s}" height="${s}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`,
    'alert-circle': `<svg class="svg-icon${extraClass}" width="${s}" height="${s}" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`,
    'flask': `<svg class="svg-icon${extraClass}" width="${s}" height="${s}" viewBox="0 0 24 24"><path d="M10 2v7.527a2 2 0 0 1-.211.896L4.72 20.55a1 1 0 0 0 .9 1.45h12.76a1 1 0 0 0 .9-1.45l-5.069-10.127A2 2 0 0 1 14 9.527V2"/><line x1="8.5" y1="2" x2="15.5" y2="2"/><line x1="7" y1="16" x2="17" y2="16"/></svg>`,
    'database': `<svg class="svg-icon${extraClass}" width="${s}" height="${s}" viewBox="0 0 24 24"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>`
  };
  return icons[name] || '';
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
    // Browser fallback shim when opened outside Electron
    if (!window.labflowAPI) {
      window.labflowAPI = {
        getSupabaseConfig: async () => {
          let u = localStorage.getItem('supabase_url') || '';
          let k = localStorage.getItem('supabase_publishable_key') || localStorage.getItem('supabase_anon_key') || '';
          if (!u || !k) {
            try {
              const res = await fetch('/api/config');
              if (res.ok) {
                const data = await res.json();
                if (data.supabaseUrl && data.supabaseAnonKey) {
                  u = data.supabaseUrl;
                  k = data.supabaseAnonKey;
                  localStorage.setItem('supabase_url', u);
                  localStorage.setItem('supabase_publishable_key', k);
                  localStorage.setItem('supabase_anon_key', k);
                }
              }
            } catch (_) { }
          }
          return { supabaseUrl: u, supabaseAnonKey: k };
        },
        saveSupabaseConfig: async (cfg) => {
          localStorage.setItem('supabase_url', cfg.supabaseUrl);
          localStorage.setItem('supabase_publishable_key', cfg.supabaseAnonKey);
          localStorage.setItem('supabase_anon_key', cfg.supabaseAnonKey);
          return { success: true };
        },
        saveSession: async (s) => { localStorage.setItem('labflow_session', s); return { success: true }; },
        loadSession: async () => localStorage.getItem('labflow_session'),
        clearSession: async () => { localStorage.removeItem('labflow_session'); return { success: true }; },
        getPrinters: async () => [],
        printReceipt: async ({ html }) => {
          const w = window.open('', '_blank', 'width=450,height=600');
          w.document.write(html);
          w.document.close();
          w.focus();
          setTimeout(() => { w.print(); }, 250);
          return { success: true };
        },
        printReport: async ({ html }) => {
          const w = window.open('', '_blank');
          w.document.write(html);
          w.document.close();
          w.focus();
          setTimeout(() => { w.print(); }, 250);
          return { success: true };
        },
        printToPDF: async () => {
          window.print();
          return { success: true };
        }
      };
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
        persistSession: true,
        autoRefreshToken: true
      }
    });

    if (state.supabase.auth?.onAuthStateChange) {
      state.supabase.auth.onAuthStateChange(async (event, session) => {
        if (session?.user) {
          state.user = session.user;
          if (window.labflowAPI) {
            await window.labflowAPI.saveSession(JSON.stringify({
              access_token: session.access_token,
              refresh_token: session.refresh_token
            }));
          }
        } else if (event === 'SIGNED_OUT') {
          state.user = null;
          if (window.labflowAPI) {
            await window.labflowAPI.clearSession();
          }
        }
      });
    }

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
        <div class="login-logo-container mb-3">
          <img src="./assets/logo.png" alt="OPTI - X LABS" class="login-logo-img" width="160" height="62" style="filter: brightness(0) invert(1);" />
        </div>
        <div class="brand-badge">Opti-X Labs Desktop</div>
        <h2>Connect Supabase Database</h2>
        <p class="muted">Enter your Supabase project credentials to connect this desktop app to your cloud database:</p>
        <form id="setup-supabase-form" class="mt-3 text-left">
          <div class="form-group mb-3">
            <label style="color: #cbd5e1;">Project URL</label>
            <input type="url" id="setup-url" placeholder="https://xxxxxxxxxxxx.supabase.co" required style="background: #0f172a; border-color: #334155; color: #fff;" />
          </div>
          <div class="form-group mb-3">
            <label style="color: #cbd5e1;">Publishable Key (or Legacy Anon Key)</label>
            <textarea id="setup-key" rows="3" placeholder="sbp_... or eyJhbGciOi..." required style="background: #0f172a; border-color: #334155; color: #fff;"></textarea>
          </div>
          <button type="submit" class="btn btn-primary btn-block">Save &amp; Connect Database</button>
        </form>
      </div>
    </div>`;

  document.getElementById('setup-supabase-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = document.getElementById('setup-url').value.trim();
    const key = document.getElementById('setup-key').value.trim();
    if (!url || !key) return;

    const res = await window.labflowAPI.saveSupabaseConfig({ supabaseUrl: url, supabaseAnonKey: key });
    if (res.success) {
      showToast('Configuration saved! Connecting...', 'success');
      init();
    } else {
      showToast('Failed to save configuration: ' + res.error, 'error');
    }
  });
}

// -------------------------------------------------------------
// Authentication (Login / Logout)
// -------------------------------------------------------------
function renderLogin(errorMessage = '') {
  const isLocked = Date.now() < state.lockoutUntil;
  const remainingSecs = Math.ceil((state.lockoutUntil - Date.now()) / 1000);

  document.getElementById('app').innerHTML = `
    <div class="login-wrapper login-split-page">
      <!-- Left Column: Precision Microscope Objective Hero Image (Anand Laboratory) -->
      <div class="login-brand-side" aria-label="Anand Laboratory - Dr. Anand Hospital">
        <div class="sr-only">
          <h2>DR. ANAND HOSPITAL - Anand Laboratory</h2>
          <p>Patient billing, diagnostics and reports.</p>
        </div>
      </div>

      <!-- Right Column: Staff Authentication -->
      <div class="login-form-side">
        <div class="login-auth-box">
          <div class="login-brand-header">
            <svg class="optix-logo-mark" viewBox="0 0 32 32" width="28" height="28" aria-hidden="true">
              <circle cx="16" cy="16" r="15" fill="#111827"/>
              <path d="M 16,3 A 13,13 0 0,0 5.5,23.5 C 7.5,15.5 12,9 16,3 Z" fill="#FAF8F5"/>
              <path d="M 16,29 A 13,13 0 0,0 26.5,8.5 C 24.5,16.5 20,23 16,29 Z" fill="#FAF8F5"/>
            </svg>
            <h1>Opti-X Labs</h1>
          </div>

          <div class="login-title-group">
            <h2 class="login-main-heading">Staff sign in</h2>
            <p class="login-main-subheading">Access your laboratory workspace.</p>
          </div>

          ${errorMessage ? `
            <div class="login-error-banner" role="alert">
              ${uiIcon('alert-circle', 16)}
              <span>${escapeHTML(errorMessage)}</span>
            </div>
          ` : ''}

          ${isLocked ? `
            <div class="login-error-banner" role="alert">
              ${uiIcon('alert-circle', 16)}
              <span>Too many failed attempts. Account locked for ${remainingSecs} seconds.</span>
            </div>
          ` : ''}

          <form id="login-form" class="login-clean-form" novalidate>
            <div class="login-field-group">
              <label for="username" class="login-label">Username</label>
              <input type="text" id="username" name="username" class="login-text-input" placeholder="Enter your username" required autocomplete="username" spellcheck="false" ${isLocked ? 'disabled' : ''} />
            </div>

            <div class="login-field-group">
              <label for="password" class="login-label">Password</label>
              <div class="login-pwd-container">
                <input type="password" id="password" name="password" class="login-text-input" placeholder="Enter your password" required autocomplete="current-password" ${isLocked ? 'disabled' : ''} />
                <button type="button" class="login-eye-toggle" id="btn-toggle-pwd" title="Toggle password visibility" tabindex="-1">
                  <span class="eye-open">${uiIcon('eye', 18)}</span>
                  <span class="eye-closed" style="display:none;">${uiIcon('eye-off', 18)}</span>
                </button>
              </div>
            </div>

            <button type="submit" id="login-submit-btn" class="login-wine-btn" ${isLocked ? 'disabled' : ''}>
              <span>Sign in</span>
              <span class="login-btn-arrow">&rarr;</span>
            </button>
          </form>

          <a href="#support" class="login-support-link" id="login-support-link">Contact support</a>

          <div class="login-card-footer">
            <div class="login-footer-divider"></div>
            <div class="login-footer-contacts">
              <a href="mailto:hello@opti-x.in">hello@opti-x.in</a>
              <span class="login-footer-sep">|</span>
              <a href="tel:8123649448">8123649448</a>
            </div>
          </div>
        </div>
      </div>
    </div>`;

  const form = document.getElementById('login-form');
  form.addEventListener('submit', handleLogin);

  const supportLink = document.getElementById('login-support-link');
  if (supportLink) {
    supportLink.addEventListener('click', (e) => {
      e.preventDefault();
      showToast('Laboratory Helpdesk: Toll-Free 8123649448 | hello@opti-x.in | Direct: 6361303305', 'info');
    });
  }

  const toggleBtn = document.getElementById('btn-toggle-pwd');
  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      const pwdInput = document.getElementById('password');
      if (!pwdInput) return;
      const eyeOpen = toggleBtn.querySelector('.eye-open');
      const eyeClosed = toggleBtn.querySelector('.eye-closed');
      if (pwdInput.type === 'password') {
        pwdInput.type = 'text';
        if (eyeOpen) eyeOpen.style.display = 'none';
        if (eyeClosed) eyeClosed.style.display = 'inline-flex';
      } else {
        pwdInput.type = 'password';
        if (eyeOpen) eyeOpen.style.display = 'inline-flex';
        if (eyeClosed) eyeClosed.style.display = 'none';
      }
      pwdInput.focus();
    });
  }
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
    try { await state.supabase.auth.signOut(); } catch (e) { }
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
    state.labSettings = {
      lab_name: 'Anand Laboratory',
      address: 'Silk Filature Quarters Road, Ward No. 14, Sidlaghatta – 562105, Chikkaballapur (Dist.)',
      phone: '6361303305',
      email: 'anandhealthcaresdl@gmail.com',
      working_hours: '7:00 AM – 9:00 PM (All 7 Days)',
      report_footer: 'Results relate only to the sample tested. Please correlate with clinical findings.',
      letterhead_template: 'classic',
      ...(settings || {})
    };
    if (!state.labSettings.lab_name || state.labSettings.lab_name === 'Anand Diagnostic Center') {
      state.labSettings.lab_name = 'Anand Laboratory';
    }
    if (!state.labSettings.address || state.labSettings.address.includes('Vijayanagar')) {
      state.labSettings.address = 'Silk Filature Quarters Road, Ward No. 14, Sidlaghatta – 562105, Chikkaballapur (Dist.)';
    }
    if (!state.labSettings.email || state.labSettings.email === 'hello@opti-x.in') {
      state.labSettings.email = 'anandhealthcaresdl@gmail.com';
    }
    if (!state.labSettings.phone) {
      state.labSettings.phone = '6361303305';
    }

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
          <div class="sidebar-logo-container">
            <img src="./assets/logo.png" alt="OPTI - X LABS" class="sidebar-logo-img" />
          </div>
          <div class="sidebar-title">
            <h2>${escapeHTML(state.labSettings.lab_name || 'Opti-X Labs')}</h2>
            <span>${escapeHTML(state.labSettings.registration_no || 'KA-BLR-LAB')}</span>
          </div>
        </div>

        <nav class="sidebar-nav">
          <button class="nav-item ${state.currentPage === 'billing' ? 'active' : ''}" data-nav="billing">
            <span class="nav-icon">${uiIcon('credit-card', 18)}</span>
            <span class="nav-label">Billing</span>
          </button>

          <button class="nav-item ${state.currentPage === 'reports' ? 'active' : ''}" data-nav="reports">
            <span class="nav-icon">${uiIcon('clipboard', 18)}</span>
            <span class="nav-label">Reports</span>
          </button>

          <button class="nav-item ${state.currentPage === 'settings' ? 'active' : ''}" data-nav="settings">
            <span class="nav-icon">${uiIcon('settings', 18)}</span>
            <span class="nav-label">Settings</span>
          </button>
        </nav>

        <div class="sidebar-footer">
          <div class="user-info">
            <span class="user-icon">${uiIcon('user', 18)}</span>
            <div class="user-details">
              <strong>${escapeHTML(state.user?.user_metadata?.username || 'anandlab')}</strong>
              <small>Staff Operator</small>
            </div>
          </div>
          <div class="sidebar-help-links">
            <button id="sidebar-support-btn" class="sidebar-link-btn" title="Helpdesk & Support">${uiIcon('phone', 13)} Support</button>
            <span class="sep">&bull;</span>
            <button id="sidebar-privacy-btn" class="sidebar-link-btn" title="Privacy Policy">${uiIcon('shield-check', 13)} Privacy</button>
          </div>
          <button id="logout-btn" class="btn btn-outline-danger btn-sm" title="Sign out">
            ${uiIcon('log-out', 14)} Logout
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

  document.getElementById('sidebar-support-btn')?.addEventListener('click', () => {
    state.currentPage = 'settings';
    state.settingsSubTab = 'support';
    renderApp();
  });

  document.getElementById('sidebar-privacy-btn')?.addEventListener('click', () => {
    state.currentPage = 'settings';
    state.settingsSubTab = 'privacy';
    renderApp();
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
              <input type="text" id="patient-lookup-input" placeholder="Search existing patient by mobile or name..." autocomplete="off" />
              <div id="patient-lookup-results" class="lookup-dropdown hidden"></div>
            </div>
          </div>
          <div class="card-body">
            <div class="form-row patient-name-row">
              <div class="form-group col-title">
                <label for="patient-title">Title *</label>
                <select id="patient-title">
                  ${['Mr', 'Mrs', 'Ms', 'Master', 'Miss', 'Baby', 'B/O', 'Dr', 'Prof'].map(t =>
    `<option value="${t}" ${state.newBill.patient.title === t ? 'selected' : ''}>${t}</option>`
  ).join('')}
                </select>
              </div>
              <div class="form-group col-fullname">
                <label for="patient-fullname">Full Patient Name *</label>
                <input type="text" id="patient-fullname" placeholder="Enter patient full name" value="${escapeHTML(state.newBill.patient.fullName)}" required />
              </div>
            </div>

            <div class="form-row">
              <div class="form-group col-6">
                <label>Gender *</label>
                <div class="radio-toggle-group" role="radiogroup" aria-label="Gender selection">
                  ${['Male', 'Female', 'Other'].map(g => `
                    <label class="radio-label ${state.newBill.patient.sex === g ? 'active' : ''}">
                      <input type="radio" name="patient-sex" value="${g}" ${state.newBill.patient.sex === g ? 'checked' : ''} tabindex="0" />
                      <span>${g}</span>
                    </label>
                  `).join('')}
                </div>
              </div>
              <div class="form-group col-6">
                <label>Age *</label>
                <div class="input-unit-group">
                  <input type="number" id="patient-age-val" class="tabular-nums" min="0" max="150" placeholder="Age" value="${escapeHTML(state.newBill.patient.ageValue)}" required />
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
            <input type="text" id="test-search-filter" class="table-search" placeholder="Search tests by code or name..." />
          </div>
          <div class="card-body">
            <div class="test-pill-container test-catalog-list" id="test-catalog-pills">
              ${activeTests.map(t => {
    const isSelected = state.newBill.selectedTestIds.includes(t.id);
    return `
                  <div class="test-pill test-list-row ${isSelected ? 'selected' : ''}" data-test-id="${t.id}" role="button" tabindex="0">
                    <div class="test-list-left">
                      <span class="test-pill-code">${escapeHTML(t.code)}</span>
                      <span class="test-pill-name">${escapeHTML(t.name)}</span>
                    </div>
                    <div class="test-list-right">
                      <span class="test-pill-price tabular-nums text-right">₹${t.price}</span>
                      <span class="test-pill-action">${isSelected ? '✓ Added' : '+ Add'}</span>
                    </div>
                  </div>`;
  }).join('')}
            </div>

            <!-- Selected Cart & Payment Summary Together -->
            <div class="cart-section mt-4">
              <h4>Selected Tests (${selectedTests.length})</h4>
              ${selectedTests.length === 0 ? `
                <div class="empty-cart-notice">No tests selected. Choose tests from the list above.</div>
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
                        <td class="text-right tabular-nums">${formatCurrency(t.price)}</td>
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
                <strong class="tabular-nums">${formatCurrency(subtotal)}</strong>
              </div>

              <div class="summary-line">
                <span>Discount (₹):</span>
                <input type="number" id="bill-discount" min="0" max="${subtotal}" value="${state.newBill.discount}" class="summary-input tabular-nums" />
              </div>

              <div class="summary-line highlight net-total-highlight">
                <span>Net Total:</span>
                <strong class="total-amount tabular-nums">${formatCurrency(total)}</strong>
              </div>

              <div class="summary-line">
                <span>Paid Amount (₹):</span>
                <input type="number" id="bill-paid" min="0" max="${total}" value="${state.newBill.paidAmount !== undefined ? state.newBill.paidAmount : total}" class="summary-input tabular-nums" />
              </div>

              <div class="summary-line">
                <span>Payment Mode:</span>
                <select id="bill-payment-mode" class="summary-input">
                  ${['Cash', 'UPI', 'Card', 'Net Banking', 'Other'].map(m =>
    `<option value="${m}" ${state.newBill.paymentMode === m ? 'selected' : ''}>${m}</option>`
  ).join('')}
                </select>
              </div>

              <div class="summary-due-box ${balance > 0 ? 'has-due' : 'no-due'}">
                <span>Balance Due:</span>
                <strong class="tabular-nums">${formatCurrency(balance)}</strong>
              </div>
            </div>

            <div class="mt-4">
              <button type="button" id="btn-submit-bill" class="btn btn-primary btn-lg btn-block" ${selectedTests.length === 0 ? 'disabled' : ''}>
                ${uiIcon('credit-card', 18)} Create bill &amp; print receipt
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
              <div><small>${uiIcon('phone', 12)} ${escapeHTML(p.mobile || 'No mobile')} | ${escapeHTML(p.area || p.city || '')}</small></div>
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
    submitBtn.innerHTML = `${uiIcon('credit-card', 18)} Create Bill &amp; Print Receipt`;
    return;
  }
  if (isNaN(ageValue) || ageValue < 0) {
    showToast('Please enter a valid age.', 'error');
    submitBtn.disabled = false;
    submitBtn.innerHTML = `${uiIcon('credit-card', 18)} Create Bill &amp; Print Receipt`;
    return;
  }
  if (state.newBill.selectedTestIds.length === 0) {
    showToast('Please select at least one test.', 'error');
    submitBtn.disabled = false;
    submitBtn.innerHTML = `${uiIcon('credit-card', 18)} Create Bill &amp; Print Receipt`;
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
    submitBtn.innerHTML = `${uiIcon('credit-card', 18)} Create Bill &amp; Print Receipt`;
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
          <button id="btn-refresh-bills" class="btn btn-outline btn-sm">${uiIcon('refresh', 14)} Refresh</button>
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
                  <button class="btn btn-outline btn-xs btn-print-receipt" data-id="${b.id}" title="Print Receipt">${uiIcon('printer', 13)} Receipt</button>
                  ${b.balance > 0 ? `
                    <button class="btn btn-primary-outline btn-xs btn-collect-payment" data-id="${b.id}" data-balance="${b.balance}" title="Collect Balance">${uiIcon('wallet', 13)} Pay</button>
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

  if (state.reportsSubTab === 'register') {
    container.innerHTML = `
      <div class="module-header">
        <div class="module-title">
          <h1>Laboratory Reports · Patient Registration</h1>
          <p>Register new patients, order tests, and generate clinical reports</p>
        </div>
        <div class="module-tabs">
          <button class="tab-btn active" id="tab-rep-register">${uiIcon('plus', 14)} New Registration</button>
          <button class="tab-btn" id="tab-rep-pending">Pending Reports</button>
          <button class="tab-btn" id="tab-rep-completed">Completed Reports</button>
          <button class="tab-btn" id="tab-rep-all">All Reports</button>
        </div>
      </div>
      <div class="module-body" id="reports-reg-body"></div>`;

    document.getElementById('tab-rep-register').addEventListener('click', () => {
      state.reportsSubTab = 'register';
      renderReportsModule(container);
    });
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

    renderNewBillForm(document.getElementById('reports-reg-body'));
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
        <button class="tab-btn hidden" id="tab-rep-register" style="display:none">New Registration</button>
      </div>
    </div>
    <div class="module-body">
      <div class="card">
        <div class="card-header">
          <div class="reports-toolbar">
            <button id="btn-quick-register-report" class="btn btn-primary btn-register-patient">
              ${uiIcon('plus', 16)} Register patient
            </button>
            <div class="toolbar-search-wrapper">
              ${uiIcon('search', 16)}
              <input type="text" id="reports-search" placeholder="Search by patient, mobile, bill no..." class="table-search" value="${escapeHTML(state.reportsFilter.search)}" />
            </div>
            <select id="reports-filter-date" class="filter-select">
              <option value="Today" ${state.reportsFilter.dateRange === 'Today' ? 'selected' : ''}>Today</option>
              <option value="Yesterday" ${state.reportsFilter.dateRange === 'Yesterday' ? 'selected' : ''}>Yesterday</option>
              <option value="Week" ${state.reportsFilter.dateRange === 'Week' ? 'selected' : ''}>Last 7 Days</option>
              <option value="All" ${state.reportsFilter.dateRange === 'All' ? 'selected' : ''}>All Time</option>
            </select>
            <button id="btn-refresh-reports" class="btn btn-outline btn-refresh">
              ${uiIcon('refresh', 16)} Refresh
            </button>
          </div>
        </div>
        <div class="card-body">
          <div id="reports-table-container">
            <div class="loading-state">Loading reports...</div>
          </div>
        </div>
      </div>
    </div>`;

  document.getElementById('tab-rep-register').addEventListener('click', () => {
    state.reportsSubTab = 'register';
    renderReportsModule(container);
  });
  document.getElementById('btn-quick-register-report').addEventListener('click', () => {
    state.reportsSubTab = 'register';
    renderReportsModule(container);
  });
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
      const s = new Date(); s.setHours(0, 0, 0, 0);
      query = query.gte('created_at', s.toISOString());
    } else if (state.reportsFilter.dateRange === 'Yesterday') {
      const yStart = new Date(); yStart.setDate(yStart.getDate() - 1); yStart.setHours(0, 0, 0, 0);
      const yEnd = new Date(); yEnd.setHours(0, 0, 0, 0);
      query = query.gte('created_at', yStart.toISOString()).lt('created_at', yEnd.toISOString());
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
      const isDateFiltered = state.reportsFilter.dateRange !== 'All';
      const tabLabel = state.reportsSubTab === 'all' ? '' : `${state.reportsSubTab} `;
      container.innerHTML = `
        <div class="empty-state">
          <p>No ${tabLabel}reports found${isDateFiltered ? ` for ${state.reportsFilter.dateRange}` : ''}.</p>
          ${isDateFiltered ? `<button class="btn btn-outline btn-sm mt-3" id="btn-show-all-time-reports">View All Time Reports</button>` : ''}
        </div>`;
      document.getElementById('btn-show-all-time-reports')?.addEventListener('click', () => {
        state.reportsFilter.dateRange = 'All';
        const filterSelect = document.getElementById('reports-filter-date');
        if (filterSelect) filterSelect.value = 'All';
        loadReportsTable();
      });
      return;
    }

    container.innerHTML = `
      <table class="data-table">
        <thead>
          <tr>
            <th>Reg No / Bill</th>
            <th>Registered Date</th>
            <th>Patient Details</th>
            <th>Doctor</th>
            <th>Tests Ordered</th>
            <th>Billing Status</th>
            <th class="text-center">Status</th>
            <th class="text-center">Action</th>
          </tr>
        </thead>
        <tbody>
          ${filtered.map(r => {
      const uniqueTestCodes = [...new Set(r.report_results?.map(res => res.test_code) || [])];
      const bill = r.bills || {};
      const total = bill.net_amount ?? bill.total_amount ?? bill.total ?? 0;
      const paid = bill.paid_amount ?? 0;
      const bal = Math.max(0, total - paid);
      const billStatus = (bal === 0 && total > 0) ? 'Paid' : (paid > 0 ? 'Partial' : 'Unpaid');
      return `
              <tr>
                <td>
                  <strong>${escapeHTML(bill.bill_no || '—')}</strong>
                  <div><small style="color: var(--primary-action, #004F49); font-weight: 600;">${r.patients?.patient_no || ''}</small></div>
                </td>
                <td class="tabular-nums">
                  ${formatDate(r.created_at)}
                </td>
                <td>
                  <div class="patient-cell-grouped">
                    <strong>${escapeHTML(r.patients?.full_name || '—')}</strong>
                    <div class="small-muted">${r.patients?.sex || ''}, ${r.patients?.age_value || ''}${r.patients?.age_unit || ''} · ${escapeHTML(r.patients?.mobile || 'No mobile')}</div>
                  </div>
                </td>
                <td>${escapeHTML(bill.doctors?.name || 'Self / Walk-in')}</td>
                <td><span class="test-codes-badge">${uniqueTestCodes.join(', ')}</span></td>
                <td>
                  <div class="report-bill-summary">
                    <span class="badge badge-${billStatus.toLowerCase()}">${billStatus}</span>
                    <div class="tabular-nums small-muted">₹ ${total}${bal > 0 ? ` · <span class="text-danger font-bold">Due: ₹ ${bal}</span>` : ''}</div>
                  </div>
                </td>
                <td class="text-center">
                  <span class="badge badge-${r.status.toLowerCase()}">${r.status}</span>
                </td>
                <td class="text-center">
                  ${r.status === 'Pending' ? `
                    <div class="table-actions">
                      <button class="btn btn-primary btn-sm btn-enter-results" data-id="${r.id}">
                        ${uiIcon('edit', 14)} Enter results
                      </button>
                      ${bill.id ? `
                        <button class="btn btn-outline btn-sm btn-print-bill" data-bill-id="${bill.id}" title="Print Invoice / Bill">
                          ${uiIcon('credit-card', 14)} Bill
                        </button>
                      ` : ''}
                    </div>
                  ` : `
                    <div class="table-actions">
                      <button class="btn btn-primary btn-sm btn-print-report" data-id="${r.id}">
                        ${uiIcon('printer', 14)} Print report
                      </button>
                      ${bill.id ? `
                        <button class="btn btn-outline btn-sm btn-print-bill" data-bill-id="${bill.id}">
                          ${uiIcon('credit-card', 14)} Bill
                        </button>
                      ` : ''}
                      <button class="btn btn-outline-danger btn-xs btn-reopen-report" data-id="${r.id}" title="Reopen for editing">
                        ${uiIcon('edit', 12)} Edit
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

    container.querySelectorAll('.btn-print-bill').forEach(btn => {
      btn.addEventListener('click', () => openReceiptModal(btn.dataset.billId));
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
          <div class="patient-banner-top">
            <button id="btn-back-to-reports" class="btn btn-outline btn-sm">← Back to reports</button>
            <div class="patient-status-chip">
              <span class="badge badge-${(r.status || 'pending').toLowerCase()}">${r.status || 'Pending'}</span>
            </div>
          </div>
          <div class="patient-banner-info">
            <h2>${escapeHTML(r.patients.title || '')} ${escapeHTML(r.patients.full_name)}</h2>
            <div class="patient-meta-row">
              <span class="patient-meta-pill">Patient Reg No: <strong class="tabular-nums">${r.patients.patient_no}</strong></span>
              <span class="patient-meta-pill">Age / Sex: <strong class="tabular-nums">${r.patients.age_value} ${r.patients.age_unit} / ${r.patients.sex}</strong></span>
              <span class="patient-meta-pill">Mobile: <strong class="tabular-nums">${escapeHTML(r.patients.mobile || '—')}</strong></span>
              <span class="patient-meta-pill">Invoice / Bill: <strong class="tabular-nums">${r.bills?.bill_no || '—'}</strong></span>
              <span class="patient-meta-pill">Reg Date: <strong class="tabular-nums">${formatDate(r.created_at)}</strong></span>
              <span class="patient-meta-pill">Referred By: <strong>${escapeHTML(r.bills?.doctors?.name || 'Self / Walk-in')}</strong></span>
            </div>
          </div>
        </div>
      </div>

      <form id="result-entry-form" class="mt-4">
        ${Object.entries(grouped).map(([code, rows]) => {
    const testMeta = state.testsCatalog.find(t => t.code === code) || TESTS[code] || {};
    return `
            <div class="card mb-4 test-section-card">
              <div class="card-header bg-subtle">
                <h3>${escapeHTML(testMeta.name || code)} <small class="text-secondary">(${escapeHTML(testMeta.department || 'Clinical Lab')} · ${escapeHTML(testMeta.sample_type || testMeta.sample || 'Specimen')})</small></h3>
              </div>
              <div class="card-body">
                <table class="data-table result-input-table">
                  <thead>
                    <tr>
                      <th style="width: 34%">Parameter</th>
                      <th style="width: 26%">Result</th>
                      <th style="width: 15%">Unit</th>
                      <th style="width: 25%">Reference interval</th>
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
                                class="result-value-input tabular-nums"
                                data-id="${row.id}"
                                data-min="${row.min_val ?? ''}"
                                data-max="${row.max_val ?? ''}"
                                data-crit-min="${row.critical_min ?? ''}"
                                data-crit-max="${row.critical_max ?? ''}"
                                value="${escapeHTML(row.value || '')}"
                                placeholder="Enter result"
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

        <div class="card mb-4 clinical-notes-card">
          <div class="card-header bg-subtle">
            <h3>Clinical Notes &amp; Interpretation</h3>
          </div>
          <div class="card-body">
            <textarea id="report-clinical-notes" rows="4" class="form-control clinical-notes-textarea" placeholder="Enter clinical interpretation, remarks or correlation notes...">${escapeHTML(defaultNotes)}</textarea>
            <p class="field-helper-text">Standard clinical panel notes. Editable prior to final authorization.</p>
          </div>
        </div>

        <!-- Billing & Invoice Summary Section in Report Entry -->
        <div class="card mb-4 report-billing-card">
          <div class="card-header bg-subtle d-flex justify-between align-center">
            <h3>${uiIcon('credit-card', 16)} Diagnostic Billing &amp; Invoice Ledger</h3>
            <div class="d-flex align-center gap-2">
              ${r.bills?.id ? `
                <button type="button" class="btn btn-outline btn-sm" id="btn-print-bill-entry">
                  ${uiIcon('printer', 14)} Print receipt
                </button>
              ` : ''}
              <span class="badge badge-${(r.bills?.payment_status || 'paid').toLowerCase()}">${r.bills?.payment_status || 'Paid'}</span>
            </div>
          </div>
          <div class="card-body">
            <div class="report-billing-grid">
              <div class="stat-item">
                <span class="stat-label">Bill / Invoice No</span>
                <span class="stat-value tabular-nums"><strong>${escapeHTML(r.bills?.bill_no || '—')}</strong></span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Subtotal</span>
                <span class="stat-value tabular-nums">₹ ${r.bills?.subtotal ?? r.bills?.total_amount ?? r.bills?.total ?? 0}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Discount Applied</span>
                <span class="stat-value tabular-nums">₹ ${r.bills?.discount ?? 0}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Net Payable</span>
                <span class="stat-value font-bold text-primary tabular-nums">₹ ${r.bills?.net_amount ?? r.bills?.total_amount ?? r.bills?.total ?? 0}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Amount Paid</span>
                <span class="stat-value text-success font-bold tabular-nums">₹ ${r.bills?.paid_amount ?? 0}</span>
              </div>
              <div class="stat-item">
                <span class="stat-label">Balance Due</span>
                <span class="stat-value tabular-nums ${(r.bills?.balance_amount || 0) > 0 ? 'text-danger font-bold' : ''}">₹ ${r.bills?.balance_amount ?? 0}</span>
              </div>
            </div>
          </div>
        </div>

        <div class="form-actions sticky-actions">
          <button type="button" id="btn-save-progress" class="btn btn-outline btn-lg">${uiIcon('save', 16)} Save progress</button>
          <button type="button" id="btn-complete-report" class="btn btn-primary btn-lg">${uiIcon('check-circle', 16)} Mark as completed &amp; print</button>
        </div>
      </form>
    </div>`;

  // Attach Result Live Flag Listeners
  container.querySelectorAll('.result-value-input').forEach(input => {
    input.addEventListener('input', () => evaluateLiveFlag(input));
  });

  // Rapid Operator Navigation: Enter or ArrowDown moves to next result field; ArrowUp moves to previous
  const resultInputs = Array.from(container.querySelectorAll('.result-value-input'));
  resultInputs.forEach((input, index) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === 'ArrowDown') {
        e.preventDefault();
        const nextInput = resultInputs[index + 1];
        if (nextInput) {
          nextInput.focus();
          nextInput.select?.();
        } else {
          // If on last input, move focus to clinical notes
          const notesElem = document.getElementById('report-clinical-notes');
          if (notesElem) {
            notesElem.focus();
          }
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        const prevInput = resultInputs[index - 1];
        if (prevInput) {
          prevInput.focus();
          prevInput.select?.();
        }
      }
    });
  });

  // Automatically focus the first input on load for rapid technician data entry
  if (resultInputs.length > 0) {
    setTimeout(() => {
      resultInputs[0].focus();
      resultInputs[0].select?.();
    }, 40);
  }

  container.querySelector('#btn-print-bill-entry')?.addEventListener('click', () => {
    if (r.bills?.id) openReceiptModal(r.bills.id);
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

  const notesEl = document.getElementById('report-clinical-notes');
  const notes = (notesEl?.value || '').trim();
  const inputs = document.querySelectorAll('.result-value-input');

  const updates = [];
  inputs.forEach(input => {
    const id = input.dataset.id;
    const value = input.value.trim();
    const flag = evaluateLiveFlag(input);
    updates.push({ id, value, flag });
  });

  try {
    // 1. Ensure valid auth session if available
    let session = null;
    if (state.supabase.auth?.getSession) {
      try {
        const { data: sessionData, error: sessionErr } = await state.supabase.auth.getSession();
        session = sessionData?.session;
        if (sessionErr || !session) {
          if (state.supabase.auth.refreshSession) {
            const { data: refreshData, error: refreshErr } = await state.supabase.auth.refreshSession();
            if (!refreshErr && refreshData?.session) {
              session = refreshData.session;
              state.user = refreshData.user;
            }
          }
        }
      } catch (authE) {
        console.warn('Auth check warning:', authE);
      }
    }

    // 2. Batch update report_results
    for (const u of updates) {
      if (!u.id) continue;
      const { error: resErr } = await state.supabase
        .from('report_results')
        .update({ value: u.value, flag: u.flag || '' })
        .eq('id', u.id);
      if (resErr) {
        console.error('Failed to update result row:', u.id, resErr);
        throw new Error(resErr.message || 'Failed to update result values');
      }
    }

    // 3. Update report status and notes
    const updatePayload = {
      clinical_notes: notes,
      updated_at: new Date().toISOString()
    };

    if (markCompleted) {
      updatePayload.status = 'Completed';
      updatePayload.completed_at = new Date().toISOString();
      const uid = state.user?.id || session?.user?.id;
      // PostgreSQL requires a valid UUID syntax referencing auth.users(id)
      if (uid && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(uid)) {
        updatePayload.completed_by = uid;
      }
    }

    const { error: repErr } = await state.supabase
      .from('reports')
      .update(updatePayload)
      .eq('id', state.activeReport.id);

    if (repErr) throw repErr;

    // Update in-memory state
    state.activeReport.clinical_notes = notes;
    if (markCompleted) {
      state.activeReport.status = 'Completed';
      state.activeReport.completed_at = updatePayload.completed_at;
    }
    for (const u of updates) {
      const match = state.activeReport.report_results?.find(r => r.id === u.id);
      if (match) {
        match.value = u.value;
        match.flag = u.flag;
      }
    }

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
    showToast('Failed to save report: ' + (err.message || 'Database transaction failed'), 'error');
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
        <div class="modal-dialog modal-xl">
          <div class="modal-header">
            <h3>Diagnostic Bill &amp; Payment Receipt</h3>
            <button class="modal-close" id="modal-close-btn">&times;</button>
          </div>
          <div class="modal-body">
            <div class="receipt-preview-controls mb-3">
              <label>Print Format:</label>
              <select id="receipt-format-select" class="form-control" style="width: auto; display: inline-block;">
                <option value="a4" selected>A4 Diagnostic Bill &amp; Invoice (Letterhead)</option>
                <option value="thermal">80mm Thermal Receipt (POS Roll)</option>
              </select>
            </div>
            <div id="receipt-rendered-content" class="receipt-preview-box">
              <!-- Rendered receipt -->
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-outline" id="receipt-close-btn">Close</button>
            <button class="btn btn-primary" id="btn-do-print-receipt">${uiIcon('printer', 16)} Print Bill / Receipt</button>
          </div>
        </div>
      </div>`;

    const formatSelect = document.getElementById('receipt-format-select');
    const previewBox = document.getElementById('receipt-rendered-content');

    function updatePreview() {
      const format = formatSelect.value;
      previewBox.innerHTML = generateReceiptHTML(bill, state.labSettings, format, false);
    }
    updatePreview();
    formatSelect.addEventListener('change', updatePreview);

    function closeReceipt() {
      modalContainer.innerHTML = '';
      if (state.currentPage === 'reports' && state.reportsSubTab === 'register') {
        state.reportsSubTab = 'pending';
        const main = document.getElementById('main-content');
        if (main) renderReportsModule(main);
      }
    }
    document.getElementById('modal-close-btn').addEventListener('click', closeReceipt);
    document.getElementById('receipt-close-btn').addEventListener('click', closeReceipt);

    document.getElementById('btn-do-print-receipt').addEventListener('click', async () => {
      const format = formatSelect.value;
      const html = generateReceiptHTML(bill, state.labSettings, format, true);
      const res = await window.labflowAPI.printReceipt({ html, format });
      if (res.success) {
        showToast('Bill / Receipt printed successfully', 'success');
        closeReceipt();
      } else {
        showToast('Print error: ' + (res.failureReason || 'Failed'), 'error');
      }
    });
  } catch (err) {
    showToast('Failed to load bill receipt: ' + err.message, 'error');
  }
}

// Helper Barcode and SVG Icons for Diagnostic Bill / Receipt Letterhead
function generateBillBarcode(code) {
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
  return `<svg class="ref-barcode-svg" viewBox="0 0 ${totalWidth} 29" width="${totalWidth}" height="29" preserveAspectRatio="xMidYMid meet" xmlns="http://www.w3.org/2000/svg">
    ${bars.join('')}
    <text x="${(totalWidth / 2).toFixed(1)}" y="27" font-family="monospace" font-size="7.5" font-weight="700" letter-spacing="1" text-anchor="middle" fill="#1e293b">${escapeHTML(textStr)}</text>
  </svg>`;
}

const billCaduceusIcon = `<svg class="ref-cross-svg" viewBox="0 0 60 60" fill="none" xmlns="http://www.w3.org/2000/svg">
  <path d="M18 2C18 0.9 18.9 0 20 0H40C41.1 0 42 0.9 42 2V18H58C59.1 18 60 18.9 60 20V40C60 41.1 59.1 42 58 42H42V58C42 59.1 41.1 60 40 60H20C18.9 60 18 59.1 18 58V42H2C0.9 42 0 41.1 0 40V20C0 18.9 0.9 18 2 18H18V2Z" fill="#006b76"/>
  <line x1="30" y1="10" x2="30" y2="52" stroke="white" stroke-width="2.4" stroke-linecap="round"/>
  <path d="M22 14C24.5 11 27.5 12.5 30 14C32.5 12.5 35.5 11 38 14" stroke="white" stroke-width="1.8" fill="none" stroke-linecap="round"/>
  <circle cx="30" cy="10" r="2.5" fill="white"/>
  <path d="M24 20C24 17 28 17 30 19C32 21 30 25 27 26C24 27 23 30 25 33C27 35 30 35 30 38C30 41 27 43 25 45" stroke="white" stroke-width="1.7" fill="none" stroke-linecap="round"/>
  <path d="M36 20C36 17 32 17 30 19C28 21 30 25 33 26C36 27 37 30 35 33C33 35 30 35 30 38C30 41 33 43 35 45" stroke="white" stroke-width="1.7" fill="none" stroke-linecap="round"/>
</svg>`;

const billMicroscopeIcon = `<svg class="ref-microscope-svg" viewBox="0 0 56 56" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect x="22" y="4" width="12" height="7" rx="2" fill="white"/>
  <rect x="24" y="11" width="8" height="16" rx="2" fill="white"/>
  <path d="M24 27L18 36" stroke="white" stroke-width="3" stroke-linecap="round"/>
  <ellipse cx="16" cy="38" rx="5" ry="3" fill="white"/>
  <rect x="14" y="41" width="24" height="4" rx="2" fill="white"/>
  <path d="M32 27V42" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
  <rect x="10" y="48" width="34" height="5" rx="2.5" fill="white"/>
  <line x1="11" y1="41" x2="45" y2="41" stroke="white" stroke-width="1.5" opacity="0.4"/>
</svg > `;

const billHospitalWaves = `< svg class="ref-waves-svg" viewBox = "0 0 100 12" fill = "none" xmlns = "http://www.w3.org/2000/svg" >
  <path d="M0 6C25 0 25 12 50 6C75 0 75 12 100 6" stroke="#006b76" stroke-width="2" stroke-linecap="round"/>
  <path d="M0 10C25 4 25 16 50 10C75 4 75 16 100 10" stroke="#2dd4bf" stroke-width="1.2" stroke-linecap="round" opacity="0.7"/>
</svg > `;

const billWatermarkSvg = `< div class="report-watermark" aria - hidden="true" >
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
</div > `;

const billMolecularLatticeSvg = `< svg class="molecular-lattice" viewBox = "0 0 120 120" fill = "none" xmlns = "http://www.w3.org/2000/svg" >
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
</svg > `;

function formatBillTimestamp(dateString) {
  if (!dateString) return 'Not recorded';
  const d = new Date(dateString);
  if (!Number.isFinite(d.getTime())) return 'Not recorded';
  const parts = new Intl.DateTimeFormat('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: true, timeZone: 'Asia/Kolkata'
  }).formatToParts(d);
  const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
  return `${ map.day } -${ map.month } -${ map.year } ${ map.hour }:${ map.minute }:${ map.second } ${ (map.dayPeriod || '').toUpperCase() } `.trim();
}

function formatPatientTitle(patients) {
  if (!patients) return '—';
  const name = String(patients.full_name || '').trim();
  if (/^(Mr|Mrs|Ms|Miss|Dr|Master)\.?\s/i.test(name)) return name;
  const prefix = patients.title ? `${ patients.title }.` : (patients.sex === 'Female' ? 'Mrs. ' : 'Mr. ');
  return prefix + name;
}

function generateReceiptHTML(bill, lab, format = 'a4', fullPage = false) {
  const inWords = numberToWords(bill.paid_amount || bill.total);
  const labName = (lab.lab_name && lab.lab_name !== 'Anand Diagnostic Center') ? lab.lab_name : 'Anand Laboratory';
  const labAddr = (lab.address && !lab.address.includes('Vijayanagar')) ? lab.address : 'Silk Filature Quarters Road, Ward No. 14, Sidlaghatta – 562105, Chikkaballapur (Dist.)';
  const labPhone = lab.phone || '6361303305';
  const labEmail = 'anandhealthcaresdl@gmail.com';
  const patientDisplayName = formatPatientTitle(bill.patients);
  const billTimeStr = formatBillTimestamp(bill.created_at);

  if (format === 'thermal') {
    const itemsRows = (bill.bill_items || []).map(item => `
    < tr >
        <td>${escapeHTML(item.test_name)}</td>
        <td class="text-right">${formatCurrency(item.price)}</td>
      </tr >
    `).join('');

    return `
    < !DOCTYPE html >
      <html>
        <head>
          <meta charset="utf-8">
            <style>
              @page {size: 80mm auto; margin: 2mm; }
              body {font - family: monospace, sans-serif; width: 72mm; margin: 0 auto; font-size: 11px; line-height: 1.3; color: #000; }
              .center {text - align: center; }
              .text-right {text - align: right; }
              .bold {font - weight: bold; }
              .divider {border - top: 1px dashed #000; margin: 4px 0; }
              .double-divider {border - top: 2px solid #000; margin: 4px 0; }
              table {width: 100%; border-collapse: collapse; font-size: 11px; }
              th, td {padding: 2px 0; }
              .words {font - size: 10px; font-style: italic; margin-top: 4px; }
              .signature-box {margin - top: 16px; text-align: right; }
            </style>
        </head>
        <body>
          <div class="center bold" style="font-size: 13px; text-transform: uppercase;">DR. ANAND HOSPITAL</div>
          <div class="center bold" style="font-size: 14px; color: #006b76;">${escapeHTML(labName)}</div>
          <div class="center" style="font-size: 9px;">${escapeHTML(labAddr)}</div>
          <div class="center" style="font-size: 9px;">Phone: ${escapeHTML(labPhone)} | ${escapeHTML(labEmail)}</div>
          <div class="center" style="margin: 4px 0;">${generateBillBarcode(bill.bill_no)}</div>
          <div class="double-divider"></div>
          <div class="center bold">DIAGNOSTIC PAYMENT RECEIPT</div>
          <div class="divider"></div>
          <div>Bill / Receipt: <strong>${escapeHTML(bill.bill_no)}</strong></div>
          <div>Date &amp; Time: ${billTimeStr}</div>
          <div>Patient: <strong>${escapeHTML(patientDisplayName)}</strong></div>
          <div>ID / Sex / Age: ${bill.patients?.patient_no || '—'} / ${bill.patients?.sex || '—'} / ${bill.patients?.age_value || ''}${bill.patients?.age_unit || 'Y'}</div>
          <div>Ref Doctor: ${escapeHTML(bill.doctors?.name || 'SELF')}</div>
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
            <p><strong>Lab Technician</strong><br><small>Technician Sign</small></p>
          </div>
          <div class="center" style="margin-top: 10px; font-size: 9px;">Thank you for choosing ${escapeHTML(labName)}</div>
        </body>
      </html>`;
  }

  // A4 Format with EXACT same letterhead and layout as diagnostic report
  const billLetterhead = `
        < header class="report-brand" id = "ref-letterhead-header" >
      <div class="ref-brand-left">
        <div class="ref-caduceus-icon">${billCaduceusIcon}</div>
        <div class="ref-hospital-text">
          <div class="ref-hospital-title">DR. ANAND</div>
          <div class="ref-hospital-sub">HOSPITAL</div>
          <div class="ref-hospital-wave-box">${billHospitalWaves}</div>
        </div>
      </div>
      <div class="ref-brand-sep"></div>
      <div class="ref-brand-center">
        <h2 class="ref-lab-name">
          <span class="ref-name-word1">Anand</span> <span class="ref-name-word2">Laboratory</span>
        </h2>
        <p class="ref-lab-address">${escapeHTML(labAddr)}</p>
      </div>
      <div class="ref-header-swoosh-corner">
        <div class="ref-microscope-emblem">${billMicroscopeIcon}</div>
      </div>
    </header > `;

  const billPatientDetails = `
    < section class="report-patient-block" aria - label="Patient and billing details" >
      <div class="ref-patient-layout">
        <div class="ref-patient-col ref-pat-left">
          <div class="ref-pat-row"><span class="ref-field-label">Name</span><span class="ref-field-colon">:</span><span class="ref-field-val"><strong class="ref-pat-fullname">${escapeHTML(patientDisplayName)}</strong></span></div>
          <div class="ref-pat-row"><span class="ref-field-label">Age/Gender</span><span class="ref-field-colon">:</span><span class="ref-field-val">${bill.patients?.age_value || '—'} ${bill.patients?.age_unit || 'Y'} / ${bill.patients?.sex || '—'}</span></div>
          <div class="ref-pat-row"><span class="ref-field-label">Patient No</span><span class="ref-field-colon">:</span><span class="ref-field-val">${escapeHTML(bill.patients?.patient_no || '—')}</span></div>
          <div class="ref-pat-row"><span class="ref-field-label">Refered By</span><span class="ref-field-colon">:</span><span class="ref-field-val">${escapeHTML(bill.doctors?.name || 'SELF')}</span></div>
        </div>
        <div class="ref-patient-col ref-pat-right">
          <div class="ref-barcode-container">
            ${generateBillBarcode(bill.bill_no)}
          </div>
          <div class="ref-pat-row"><span class="ref-field-label">Bill No</span><span class="ref-field-colon">:</span><span class="ref-field-val"><strong>${escapeHTML(bill.bill_no)}</strong></span></div>
          <div class="ref-pat-row"><span class="ref-field-label">Billing Date</span><span class="ref-field-colon">:</span><span class="ref-field-val">${billTimeStr}</span></div>
          <div class="ref-pat-row"><span class="ref-field-label">Payment Status</span><span class="ref-field-colon">:</span><span class="ref-field-val"><strong style="color: ${bill.payment_status === 'Paid' ? '#0d9488' : bill.payment_status === 'Partial' ? '#d97706' : '#dc2626'}">${escapeHTML(bill.payment_status)}</strong></span></div>
        </div>
      </div>
    </section > `;

  const billItemsTable = `
    < table class="report-results-table bill-items-table" >
      <colgroup>
        <col style="width: 8%">
          <col style="width: 52%">
            <col style="width: 20%">
              <col style="width: 20%">
              </colgroup>
              <thead>
                <tr>
                  <th>SL.</th>
                  <th>TEST DESCRIPTION</th>
                  <th>SPECIMEN</th>
                  <th style="text-align: right;">AMOUNT (₹)</th>
                </tr>
              </thead>
              <tbody>
                ${(bill.bill_items || []).map((item, idx) => `
          <tr class="report-result-row">
            <td>${idx + 1}</td>
            <td><strong>${escapeHTML(item.test_name)}</strong></td>
            <td>${escapeHTML(item.test_sample_type || 'Blood')}</td>
            <td class="report-result-value" style="text-align: right;">${formatCurrency(item.price)}</td>
          </tr>
        `).join('')}
              </tbody>
            </table>`;

            const billSummary = `
            <div class="bill-summary-container">
              <div class="bill-words-box">
                <div class="bill-words-label">Amount in Words:</div>
                <div class="bill-words-text">${escapeHTML(inWords)}</div>
                <div class="bill-terms-note">
                  <p>• Computer-generated diagnostic tax invoice &amp; payment receipt.</p>
                  <p>• Reports will be issued only against presentation of this bill.</p>
                </div>
              </div>
              <table class="bill-calc-table">
                <tr>
                  <td>Subtotal:</td>
                  <td class="text-right">${formatCurrency(bill.subtotal)}</td>
                </tr>
                ${bill.discount > 0 ? `
        <tr style="color: #006b76;">
          <td>Discount:</td>
          <td class="text-right">-${formatCurrency(bill.discount)}</td>
        </tr>
        ` : ''}
                <tr class="bill-total-row">
                  <td><strong>Total Amount:</strong></td>
                  <td class="text-right"><strong>${formatCurrency(bill.total)}</strong></td>
                </tr>
                <tr style="color: #006b76; font-weight: 700;">
                  <td>Amount Paid:</td>
                  <td class="text-right">${formatCurrency(bill.paid_amount)}</td>
                </tr>
                ${bill.balance > 0 ? `
        <tr style="color: #b91c1c; font-weight: 800;">
          <td>Balance Due:</td>
          <td class="text-right">${formatCurrency(bill.balance)}</td>
        </tr>
        ` : `
        <tr style="color: #15803d; font-weight: 700;">
          <td>Balance Due:</td>
          <td class="text-right">₹0.00 (Cleared)</td>
        </tr>
        `}
                <tr>
                  <td>Payment Mode:</td>
                  <td class="text-right">${escapeHTML(bill.payments?.[0]?.mode || 'Cash')}</td>
                </tr>
              </table>
            </div>`;

            const billSignatures = `
            <section class="report-reviewers" id="ref-signatures-block">
              <div class="report-reviewer" style="font-size: 8.5pt; color: #475569;">
                <div>Patient / Attendant Sign: __________________</div>
              </div>
              <div class="report-reviewer report-reviewer-authorizer ref-tech-block">
                <div class="ref-tech-sign-box">
                  <div class="ref-tech-teal-bar"></div>
                  <div class="ref-tech-labels">
                    <strong class="ref-tech-title">Lab Technician</strong>
                    <span class="ref-tech-sub">Authorized Billing Sign</span>
                  </div>
                </div>
              </div>
            </section>`;

            const billBottomRibbon = `
            <div class="ref-bottom-ribbon">
              <div class="ref-ribbon-content">
                <span class="ref-ribbon-title">Anand Laboratory &amp; General Stores</span>
                <span class="ref-ribbon-email">
                  <svg viewBox="0 0 24 24" width="12" height="12" fill="currentColor"><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 4-8 5-8-5V6l8 5 8-5v2z" /></svg>
                  ${escapeHTML(labEmail)}
                </span>
                <span class="ref-ribbon-divider">|</span>
                <span class="ref-ribbon-phone">
                  <svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M6.62 10.79a15.05 15.05 0 006.59 6.59l2.2-2.2a1 1 0 011.02-.24 11.41 11.41 0 003.58.57 1 1 0 011 1V20a1 1 0 01-1 1A17 17 0 013 4a1 1 0 011-1h3.5a1 1 0 011 1 11.41 11.41 0 00.57 3.58 1 1 0 01-.24 1.02l-2.2 2.2z" /></svg>
                  ${escapeHTML(labPhone)}
                </span>
              </div>
            </div>`;

            const billBody = `
            <div class="report report-document">
              <article class="report-page" aria-label="Diagnostic Bill &amp; Tax Invoice">
                ${billWatermarkSvg}
                <div class="molecular-lattice-tr" aria-hidden="true">${billMolecularLatticeSvg}</div>
                <div class="molecular-lattice-bl" aria-hidden="true">${billMolecularLatticeSvg}</div>
                ${billLetterhead}
                ${billPatientDetails}
                <div class="report-document-title">
                  <span>DIAGNOSTIC BILL &amp; TAX INVOICE</span>
                  <b>OFFICIAL PAYMENT RECEIPT</b>
                </div>
                ${billItemsTable}
                ${billSummary}
                <div class="report-end-marker">****End Of Bill / Receipt****</div>
                ${billSignatures}
                ${billBottomRibbon}
              </article>
            </div>`;

            if (!fullPage) return billBody;

            return `
            <!DOCTYPE html>
            <html>
              <head>
                <meta charset="utf-8">
                  <title>Bill - ${escapeHTML(bill.bill_no)}</title>
                  <link rel="stylesheet" href="./dist/report.css">
                    <style>
                      @page {size: A4; margin: 10mm; }
                      body {margin: 0; padding: 0; background: #ffffff; }
                    </style>
                  </head>
                  <body>
                    ${billBody}
                  </body>
                </html>`;
}

                // -------------------------------------------------------------
                // Report Printing with 3 Letterhead Styles
                // -------------------------------------------------------------
                async function openReportPrintPreview(reportId) {
  try {
    const {data: report, error } = await state.supabase
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
                labName: (state.labSettings.lab_name && state.labSettings.lab_name !== 'Anand Diagnostic Center') ? state.labSettings.lab_name : 'Anand Laboratory',
                address: (state.labSettings.address && !state.labSettings.address.includes('Vijayanagar')) ? state.labSettings.address : 'Silk Filature Quarters Road, Ward No. 14, Sidlaghatta – 562105, Chikkaballapur (Dist.)',
                phone: state.labSettings.phone || '6361303305',
                email: 'anandhealthcaresdl@gmail.com',
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
                      ${report.bills?.id ? `
              <button class="btn btn-outline" id="btn-modal-print-bill">${uiIcon('credit-card', 14)} Print Bill / Receipt</button>
            ` : ''}
                      <button class="btn btn-outline" id="btn-export-pdf">${uiIcon('download', 14)} Export PDF</button>
                      <button class="btn btn-primary" id="btn-print-report-now">${uiIcon('printer', 14)} Print Clinical Report</button>
                    </div>
                  </div>
                </div>`;

                const tplSelect = document.getElementById('report-template-select');
                const viewContainer = document.getElementById('report-rendered-view');

                function renderActiveHTML() {
      const template = tplSelect.value;
                const html = renderReport(orderAdapter, settingsAdapter, {template});
                viewContainer.innerHTML = html;
                return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Report ${orderAdapter.id}</title><link rel="stylesheet" href="./report.css"></head><body>${html}</body></html>`;
    }

                  renderActiveHTML();
                  tplSelect.addEventListener('change', renderActiveHTML);

    document.getElementById('modal-close-btn').addEventListener('click', () => modalContainer.innerHTML = '');
    document.getElementById('btn-close-rep-modal').addEventListener('click', () => modalContainer.innerHTML = '');

    document.getElementById('btn-modal-print-bill')?.addEventListener('click', () => {
      if (report.bills?.id) openReceiptModal(report.bills.id);
    });

    document.getElementById('btn-print-report-now').addEventListener('click', async () => {
      const fullHtml = renderActiveHTML();
                  const res = await window.labflowAPI.printReport({html: fullHtml });
                  if (res.success) {
                    showToast('Report printed successfully', 'success');
      } else {
                    showToast('Print failed: ' + (res.failureReason || 'Error'), 'error');
      }
    });

    document.getElementById('btn-export-pdf').addEventListener('click', async () => {
      const fullHtml = renderActiveHTML();
                  const filename = `Report-${orderAdapter.id}-${orderAdapter.name.replace(/\s+/g, '_')}.pdf`;
                  const res = await window.labflowAPI.printToPDF({html: fullHtml, defaultFilename: filename });
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
        <h1>Laboratory Settings &amp; Compliance</h1>
        <p>Lab profile, doctors, referral sources, test catalog pricing, helpdesk and privacy compliance</p>
      </div>
      <div class="module-tabs settings-tabs-scroll">
        <button class="tab-btn ${state.settingsSubTab === 'profile' ? 'active' : ''}" id="tab-set-profile">Lab Details &amp; Letterhead</button>
        <button class="tab-btn ${state.settingsSubTab === 'doctors' ? 'active' : ''}" id="tab-set-doctors">Doctors Directory</button>
        <button class="tab-btn ${state.settingsSubTab === 'referrals' ? 'active' : ''}" id="tab-set-referrals">Referral Sources</button>
        <button class="tab-btn ${state.settingsSubTab === 'catalog' ? 'active' : ''}" id="tab-set-catalog">Test Catalog &amp; Pricing</button>
        <button class="tab-btn ${state.settingsSubTab === 'security' ? 'active' : ''}" id="tab-set-security">Account Security</button>
        <button class="tab-btn ${state.settingsSubTab === 'support' ? 'active' : ''}" id="tab-set-support">Support &amp; Helpdesk</button>
        <button class="tab-btn ${state.settingsSubTab === 'privacy' ? 'active' : ''}" id="tab-set-privacy">Privacy &amp; Compliance</button>
      </div>
    </div>
    <div class="module-body" id="settings-body"></div>`;

  document.getElementById('tab-set-profile').addEventListener('click', () => {state.settingsSubTab = 'profile'; renderSettingsModule(container); });
  document.getElementById('tab-set-doctors').addEventListener('click', () => {state.settingsSubTab = 'doctors'; renderSettingsModule(container); });
  document.getElementById('tab-set-referrals').addEventListener('click', () => {state.settingsSubTab = 'referrals'; renderSettingsModule(container); });
  document.getElementById('tab-set-catalog').addEventListener('click', () => {state.settingsSubTab = 'catalog'; renderSettingsModule(container); });
  document.getElementById('tab-set-security').addEventListener('click', () => {state.settingsSubTab = 'security'; renderSettingsModule(container); });
  document.getElementById('tab-set-support').addEventListener('click', () => {state.settingsSubTab = 'support'; renderSettingsModule(container); });
  document.getElementById('tab-set-privacy').addEventListener('click', () => {state.settingsSubTab = 'privacy'; renderSettingsModule(container); });

                  const body = document.getElementById('settings-body');
                  if (state.settingsSubTab === 'profile') renderLabProfileSettings(body);
                  else if (state.settingsSubTab === 'doctors') renderDoctorsSettings(body);
                  else if (state.settingsSubTab === 'referrals') renderReferralsSettings(body);
                  else if (state.settingsSubTab === 'catalog') renderCatalogSettings(body);
                  else if (state.settingsSubTab === 'security') renderSecuritySettings(body);
                  else if (state.settingsSubTab === 'support') renderSupportPage(body);
                  else if (state.settingsSubTab === 'privacy') renderPrivacyPolicyPage(body);
}

                  function renderLabProfileSettings(container) {
  const lab = state.labSettings;
                  container.innerHTML = `
                  <form id="lab-profile-form">
                    <!-- 1. Identity -->
                    <div class="card mb-4">
                      <div class="card-header">
                        <h3>1. Laboratory Identity</h3>
                      </div>
                      <div class="card-body">
                        <div class="form-row">
                          <div class="form-group col-6">
                            <label>Laboratory Name *</label>
                            <input type="text" id="lab-name" value="${escapeHTML(lab.lab_name || '')}" required />
                          </div>
                          <div class="form-group col-6">
                            <label>Registration / License No.</label>
                            <input type="text" id="lab-reg" value="${escapeHTML(lab.registration_no || '')}" />
                          </div>
                        </div>
                        <div class="form-row">
                          <div class="form-group col-12">
                            <label>Tagline / Motto</label>
                            <input type="text" id="lab-tagline" value="${escapeHTML(lab.tagline || '')}" />
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- 2. Contact Details -->
                    <div class="card mb-4">
                      <div class="card-header">
                        <h3>2. Contact Details</h3>
                      </div>
                      <div class="card-body">
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
                            <label>Working Hours</label>
                            <input type="text" id="lab-hours" value="${escapeHTML(lab.working_hours || '')}" />
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- 3. Letterhead & Printing -->
                    <div class="card mb-4">
                      <div class="card-header">
                        <h3>3. Letterhead &amp; Printing</h3>
                      </div>
                      <div class="card-body">
                        <div class="form-row">
                          <div class="form-group col-12">
                            <label>Default Letterhead Theme</label>
                            <select id="lab-template">
                              ${REPORT_TEMPLATES.map(t =>
                                `<option value="${t.id}" ${t.id === lab.letterhead_template ? 'selected' : ''}>${t.name} (${t.description})</option>`
                              ).join('')}
                            </select>
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
                      </div>
                    </div>
                  </form>`;

  document.getElementById('lab-profile-form').addEventListener('submit', async (e) => {
                    e.preventDefault();
                  const payload = {
                    lab_name: document.getElementById('lab-name').value.trim(),
                  tagline: document.getElementById('lab-tagline').value.trim(),
                  address: document.getElementById('lab-address').value.trim(),
                  phone: document.getElementById('lab-phone').value.trim(),
                  email: document.getElementById('lab-email').value.trim(),
                  registration_no: document.getElementById('lab-reg').value.trim(),
                  letterhead_template: document.getElementById('lab-template').value,
                  working_hours: document.getElementById('lab-hours').value.trim(),
                  report_footer: document.getElementById('lab-footer').value.trim(),
                  updated_at: new Date().toISOString()
    };

                  try {
      const {error} = await state.supabase.from('lab_settings').upsert({id: lab.id, ...payload });
                  if (error) throw error;
                  state.labSettings = {...lab, ...payload };
                  showToast('Lab profile updated successfully', 'success');
                  renderApp();
    } catch (err) {
                    showToast('Failed to save settings: ' + err.message, 'error');
    }
  });
}

                  function renderDoctorsSettings(container) {
  const doctors = state.doctors || [];
                  container.innerHTML = `
                  <div class="card">
                    <div class="card-header d-flex justify-between align-center">
                      <div>
                        <h3>Referring Doctors Directory</h3>
                        <p class="muted mt-1">Manage external medical consultants and referring physicians for diagnostic billing.</p>
                      </div>
                      <button class="btn btn-primary btn-sm" id="btn-add-doc-modal">+ Add Doctor</button>
                    </div>
                    <div class="card-body">
                      ${doctors.length === 0 ? `
          <div class="empty-state text-center p-4">
            <p class="muted mb-2">No referring doctors registered yet.</p>
            <p><small class="muted">Click <strong>+ Add Doctor</strong> above to register consulting physicians.</small></p>
          </div>
        ` : `
          <table class="data-table">
            <thead>
              <tr>
                <th>Doctor Name</th>
                <th>Qualifications</th>
                <th>Phone</th>
                <th class="text-center">Status</th>
                <th class="text-center">Actions</th>
              </tr>
            </thead>
            <tbody>
              ${doctors.map(d => `
                <tr>
                  <td><strong>${escapeHTML(d.name)}</strong></td>
                  <td>${escapeHTML(d.qualification || '—')}</td>
                  <td>${escapeHTML(d.phone || '—')}</td>
                  <td class="text-center">
                    <span class="badge ${d.active ? 'badge-paid' : 'badge-unpaid'}">${d.active ? 'Active' : 'Inactive'}</span>
                  </td>
                  <td class="text-center">
                    <div class="table-actions justify-center">
                      <button class="btn btn-outline btn-xs btn-toggle-doctor" data-id="${d.id}" data-active="${d.active}">
                        ${d.active ? 'Deactivate' : 'Activate'}
                      </button>
                      <button class="btn btn-outline-danger btn-xs btn-delete-doctor" data-id="${d.id}" data-name="${escapeHTML(d.name)}" title="Delete doctor">
                        ${uiIcon('trash', 12)} Delete
                      </button>
                    </div>
                  </td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `}
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

  container.querySelectorAll('.btn-delete-doctor').forEach(btn => {
                    btn.addEventListener('click', async () => {
                      const id = btn.dataset.id;
                      const name = btn.dataset.name;
                      if (confirm(`Are you sure you want to delete ${name}?`)) {
                        const { error } = await state.supabase.from('doctors').delete().eq('id', id);
                        if (error) {
                          showToast('Could not delete doctor: ' + error.message, 'error');
                        } else {
                          showToast(`Doctor ${name} deleted successfully`, 'success');
                          await loadReferenceData();
                          renderDoctorsSettings(container);
                        }
                      }
                    });
  });
}

                  function renderReferralsSettings(container) {
  const labs = state.referralLabs || [];
                  const hosps = state.referralHospitals || [];
                  container.innerHTML = `
                  <div class="form-row">
                    <div class="col-6">
                      <div class="card">
                        <div class="card-header d-flex justify-between align-center">
                          <h3>Referral Laboratories</h3>
                          <button class="btn btn-primary btn-sm" id="btn-add-lab-modal">+ Add Lab</button>
                        </div>
                        <div class="card-body">
                          ${labs.length === 0 ? `
              <div class="empty-state text-center p-3">
                <p class="muted">No referral laboratories registered.</p>
              </div>
            ` : `
              <table class="data-table">
                <thead><tr><th>Name</th><th class="text-center">Status</th><th class="text-center">Action</th></tr></thead>
                <tbody>
                  ${labs.map(l => `
                    <tr>
                      <td><strong>${escapeHTML(l.name)}</strong></td>
                      <td class="text-center"><span class="badge ${l.active ? 'badge-paid' : 'badge-unpaid'}">${l.active ? 'Active' : 'Inactive'}</span></td>
                      <td class="text-center">
                        <button class="btn btn-outline-danger btn-xs btn-delete-lab" data-id="${l.id}" data-name="${escapeHTML(l.name)}" title="Delete lab">
                          ${uiIcon('trash', 12)}
                        </button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}
                        </div>
                      </div>
                    </div>
                    <div class="col-6">
                      <div class="card">
                        <div class="card-header d-flex justify-between align-center">
                          <h3>Referral Hospitals</h3>
                          <button class="btn btn-primary btn-sm" id="btn-add-hosp-modal">+ Add Hospital</button>
                        </div>
                        <div class="card-body">
                          ${hosps.length === 0 ? `
              <div class="empty-state text-center p-3">
                <p class="muted">No referral hospitals registered.</p>
              </div>
            ` : `
              <table class="data-table">
                <thead><tr><th>Name</th><th class="text-center">Status</th><th class="text-center">Action</th></tr></thead>
                <tbody>
                  ${hosps.map(h => `
                    <tr>
                      <td><strong>${escapeHTML(h.name)}</strong></td>
                      <td class="text-center"><span class="badge ${h.active ? 'badge-paid' : 'badge-unpaid'}">${h.active ? 'Active' : 'Inactive'}</span></td>
                      <td class="text-center">
                        <button class="btn btn-outline-danger btn-xs btn-delete-hosp" data-id="${h.id}" data-name="${escapeHTML(h.name)}" title="Delete hospital">
                          ${uiIcon('trash', 12)}
                        </button>
                      </td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            `}
                        </div>
                      </div>
                    </div>
                  </div>`;

                  document.getElementById('btn-add-lab-modal').addEventListener('click', openAddReferralLabModal);
                  document.getElementById('btn-add-hosp-modal').addEventListener('click', openAddReferralHospitalModal);

  container.querySelectorAll('.btn-delete-lab').forEach(btn => {
                    btn.addEventListener('click', async () => {
                      const id = btn.dataset.id;
                      const name = btn.dataset.name;
                      if (confirm(`Are you sure you want to delete ${name}?`)) {
                        const { error } = await state.supabase.from('referral_labs').delete().eq('id', id);
                        if (error) showToast('Error deleting lab: ' + error.message, 'error');
                        else {
                          showToast(`Referral lab ${name} deleted`, 'success');
                          await loadReferenceData();
                          renderReferralsSettings(container);
                        }
                      }
                    });
  });

  container.querySelectorAll('.btn-delete-hosp').forEach(btn => {
                    btn.addEventListener('click', async () => {
                      const id = btn.dataset.id;
                      const name = btn.dataset.name;
                      if (confirm(`Are you sure you want to delete ${name}?`)) {
                        const { error } = await state.supabase.from('referral_hospitals').delete().eq('id', id);
                        if (error) showToast('Error deleting hospital: ' + error.message, 'error');
                        else {
                          showToast(`Referral hospital ${name} deleted`, 'success');
                          await loadReferenceData();
                          renderReferralsSettings(container);
                        }
                      }
                    });
  });
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
      const {error} = await state.supabase.auth.updateUser({password: p1 });
                  if (error) throw error;
                  showToast('Password updated successfully', 'success');
                  document.getElementById('change-pwd-form').reset();
    } catch (err) {
                    showToast('Password change failed: ' + err.message, 'error');
    }
  });
}

                  function renderSupportPage(container) {
                    container.innerHTML = `
    <div class="support-page-wrapper">
      <div class="card mb-4">
        <div class="card-header d-flex justify-between align-center">
          <div>
            <h3>${uiIcon('phone', 18)} Clinical Helpdesk &amp; Technical Support</h3>
            <p class="text-secondary mt-1">Official assistance and care for ${escapeHTML(state.labSettings.lab_name || 'Anand Laboratory')} &amp; Dr. Anand Hospital staff</p>
          </div>
          <span class="badge badge-paid">Support Active</span>
        </div>
        <div class="card-body">
          <div class="support-contact-rows">
            <div class="support-contact-row">
              <span class="sc-label">Toll-Free Helpdesk</span>
              <span class="sc-val"><a href="tel:8123649448" class="tabular-nums font-bold">8123649448</a></span>
              <span class="sc-desc small-muted">24x7 Priority technical assistance for billing, printing &amp; sync</span>
            </div>
            <div class="support-contact-row">
              <span class="sc-label">Official Email</span>
              <span class="sc-val"><a href="mailto:hello@opti-x.in" class="font-bold">hello@opti-x.in</a></span>
              <span class="sc-desc small-muted">Guaranteed response within 2 hours for catalog and technical escalations</span>
            </div>
            <div class="support-contact-row">
              <span class="sc-label">Direct Lab Line</span>
              <span class="sc-val"><a href="tel:${escapeHTML(state.labSettings.phone || '6361303305')}" class="tabular-nums font-bold">${escapeHTML(state.labSettings.phone || '6361303305')}</a></span>
              <span class="sc-desc small-muted">${escapeHTML(state.labSettings.lab_name || 'Anand Laboratory')} dispatch &amp; sample desk</span>
            </div>
            <div class="support-contact-row">
              <span class="sc-label">Physical Address</span>
              <span class="sc-val">${escapeHTML(state.labSettings.address || 'Silk Filature Quarters Road, Ward No. 14, Sidlaghatta – 562105, Chikkaballapur (Dist.)')}</span>
              <span class="sc-desc small-muted">Dr. Anand Hospital &amp; Anand Diagnostic Center</span>
            </div>
          </div>
        </div>
      </div>

      <div class="grid grid-2 mb-4">
        <div class="card">
          <div class="card-header">
            <h3>${uiIcon('clock', 16)} Laboratory Operating Hours</h3>
          </div>
          <div class="card-body">
            <ul class="support-key-val-list">
              <li><span>Monday – Saturday:</span> <strong class="tabular-nums">7:00 AM – 9:00 PM</strong></li>
              <li><span>Sunday:</span> <strong class="tabular-nums">8:00 AM – 2:00 PM</strong></li>
              <li><span>Configured Schedule:</span> <strong class="tabular-nums">${escapeHTML(state.labSettings.working_hours || '7:00 AM – 9:00 PM (All 7 Days)')}</strong></li>
              <li><span>Emergency &amp; Critical Samples:</span> <span class="badge badge-paid">24 / 7 on Call</span></li>
            </ul>
          </div>
        </div>

        <div class="card">
          <div class="card-header">
            <h3>${uiIcon('database', 16)} Diagnostic Engine Status</h3>
          </div>
          <div class="card-body">
            <ul class="support-key-val-list">
              <li><span>Cloud Database (PostgreSQL):</span> <strong class="text-success">${uiIcon('check-circle', 14)} Connected &amp; Synced</strong></li>
              <li><span>Local Credential Vault:</span> <strong class="text-success">${uiIcon('check-circle', 14)} SafeStorage AES-256 Enabled</strong></li>
              <li><span>Letterhead Vector Ready:</span> <strong class="text-success">${uiIcon('check-circle', 14)} Dr. Anand Hospital Print Ready</strong></li>
              <li><span>Software Release:</span> <strong>Opti-X Labs Enterprise v2.4.0 (Hospital LIS)</strong></li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  `;
}

                  function renderPrivacyPolicyPage(container) {
                    container.innerHTML = `
    <div class="privacy-page-wrapper">
      <div class="card">
        <div class="card-header bg-subtle d-flex justify-between align-center">
          <div>
            <h3>${uiIcon('shield-check', 18)} Patient Health Data Privacy &amp; Governance Policy</h3>
            <p class="muted mt-1">Compliance with Digital Personal Data Protection Act (DPDPA 2023) and DISHA Guidelines</p>
          </div>
          <span class="badge badge-paid">Clinical Compliance Verified</span>
        </div>
        <div class="card-body privacy-body-content">
          <h4>1. Purpose and Scope</h4>
          <p>
            Anand Diagnostic Laboratory ("Anand Laboratory") and Dr. Anand Hospital, powered by the Opti-X Labs Clinical Information System,
            are committed to maintaining the confidentiality, integrity, and availability of all electronic health records (EHR), patient demographic
            data, and pathology diagnostic findings.
          </p>

          <h4>2. Regulatory Compliance</h4>
          <p>
            This system complies with:
          </p>
          <ul>
            <li><strong>Digital Personal Data Protection Act (DPDPA), 2023:</strong> Ensuring patient rights to data privacy, lawful processing, purpose specification, and secure data storage.</li>
            <li><strong>Digital Information Security in Healthcare Act (DISHA):</strong> Strict controls preventing unauthorized transmission, sharing, or secondary use of diagnostic pathology records.</li>
            <li><strong>Indian Council of Medical Research (ICMR) Ethical Guidelines:</strong> Preserving diagnostic laboratory quality standards and patient record confidentiality.</li>
          </ul>

          <h4>3. Data Protection and Encryption Safeguards</h4>
          <p>
            All diagnostic test values, patient records, and financial invoices processed within this application are protected by multiple enterprise-grade security layers:
          </p>
          <ul>
            <li><strong>Hardware SafeStorage:</strong> All local operator sessions and cryptographic tokens are protected via Chromium SafeStorage using OS-level AES-256 encryption.</li>
            <li><strong>Transport Security:</strong> Data exchanged with the cloud database is secured over TLS 1.3 cryptographic protocols with modern cipher suites.</li>
            <li><strong>Row-Level Security (RLS):</strong> Multi-tenant isolation prevents cross-organization access to clinical reports or patient records.</li>
          </ul>

          <h4>4. Record Retention Policy</h4>
          <p>
            In accordance with clinical laboratory regulatory mandates in India, diagnostic reports, numerical readings, and clinical notes are retained for a minimum statutory period of 3 years from the date of specimen receipt.
          </p>

          <h4>5. Data Protection Officer (DPO) &amp; Grievance Officer</h4>
          <p>
            For patient record access requests, correction of demographic details, or technical privacy questions, contact our designated privacy desk:
          </p>
          <div class="dpo-contact-card">
            <div><strong>Clinical Privacy &amp; Data Officer:</strong> Opti-X Labs Compliance Desk</div>
            <div><strong>Official Email:</strong> <a href="mailto:hello@opti-x.in">hello@opti-x.in</a></div>
            <div><strong>Toll-Free Grievance Helpline:</strong> <a href="tel:8123649448">8123649448</a></div>
            <div><strong>Registered Address:</strong> Silk Filature Quarters Road, Ward No. 14, Sidlaghatta – 562105, Chikkaballapur (Dist.), Karnataka</div>
          </div>
        </div>
      </div>
    </div>
  `;
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
      const {data, error} = await state.supabase.from('doctors').insert({name, qualification, phone}).select().single();
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
      const {data, error} = await state.supabase.from('referral_labs').insert({name}).select().single();
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
      const {data, error} = await state.supabase.from('referral_hospitals').insert({name}).select().single();
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
      const {data, error} = await state.supabase.rpc('collect_bill_payment', {
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

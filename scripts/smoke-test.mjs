import fs from 'node:fs';
import path from 'node:path';
import http from 'node:http';

const BASE_URL = process.env.LABFLOW_URL || 'http://127.0.0.1:3000';

// Read .env if present for credentials
let envConfig = {};
const envPath = path.resolve('.env');
if (fs.existsSync(envPath)) {
  const envContent = fs.readFileSync(envPath, 'utf8');
  for (const line of envContent.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx !== -1) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      envConfig[key] = val;
    }
  }
}

const USERNAME = envConfig.LAB_USERNAME || 'anandlab';
const PASSWORD = envConfig.LAB_PASSWORD || 'LFR@26-1103';
const DOMAIN = envConfig.LAB_EMAIL_DOMAIN || 'labflow.local';
const EMAIL = `${USERNAME}@${DOMAIN}`;

async function runSmokeTests() {
  let inProcessServer = null;
  let testUrl = BASE_URL;

  try {
    const probe = await fetch(`${BASE_URL}/api/config`, { signal: AbortSignal.timeout(1000) });
    if (!probe.ok && probe.status !== 200) throw new Error('Not ready');
  } catch {
    const distDir = path.resolve('dist');
    const mimeTypes = {
      '.html': 'text/html; charset=utf-8',
      '.js': 'text/javascript; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.png': 'image/png',
      '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg',
      '.ico': 'image/x-icon',
      '.json': 'application/json',
      '.svg': 'image/svg+xml',
      '.woff2': 'font/woff2'
    };

    inProcessServer = http.createServer((req, res) => {
      let reqPath = req.url.split('?')[0];
      if (reqPath === '/api/config') {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*'
        });
        const supabaseUrl = envConfig.SUPABASE_URL || process.env.SUPABASE_URL || '';
        const supabaseAnonKey = envConfig.SUPABASE_PUBLISHABLE_KEY || envConfig.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
        res.end(JSON.stringify({ supabaseUrl, supabaseAnonKey }));
        return;
      }
      if (reqPath === '/' || reqPath === '') reqPath = '/index.html';
      if (reqPath === '/favicon.ico') reqPath = '/assets/favicon.ico';
      let filePath = path.join(distDir, reqPath);
      if (!fs.existsSync(filePath) && reqPath === '/assets/favicon.ico') {
        filePath = path.resolve('assets', 'icon.ico');
      }
      if (!fs.existsSync(filePath)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        res.end('Not Found');
        return;
      }
      const ext = path.extname(filePath);
      const contentType = mimeTypes[ext] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' });
      fs.createReadStream(filePath).pipe(res);
    });

    await new Promise((resolve) => {
      inProcessServer.listen(0, '127.0.0.1', () => {
        const addr = inProcessServer.address();
        testUrl = `http://127.0.0.1:${addr.port}`;
        resolve();
      });
    });
  }

  console.log(`\n======================================================`);
  console.log(` LABFLOW DIAGNOSTICS - PRODUCTION SMOKE TEST RUNNER`);
  console.log(` Target Server: ${testUrl}`);
  console.log(` Target Operator: ${EMAIL}`);
  console.log(`======================================================\n`);

  let passed = 0;
  let failed = 0;

  async function check(name, fn) {
    try {
      await fn();
      console.log(`  ✔ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`  ❌ [FAIL] ${name}: ${err.message}`);
      failed++;
    }
  }

  try {
    // 1. Root page availability
    await check('GET / returns 200 OK with HTML content', async () => {
      const res = await fetch(`${testUrl}/`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      const text = await res.text();
      if (!text.includes('Labflow Diagnostics')) throw new Error('Missing title in HTML');
    });

    // 2. Config endpoint returns public credentials only
    let configData = null;
    await check('GET /api/config returns valid public Supabase config', async () => {
      const res = await fetch(`${testUrl}/api/config`);
      if (!res.ok) throw new Error(`Status ${res.status}`);
      configData = await res.json();
      if (!configData.supabaseUrl) throw new Error('Missing supabaseUrl');
      if (!configData.supabaseAnonKey) throw new Error('Missing supabaseAnonKey');
      if (configData.supabaseAnonKey.startsWith('sb_secret')) {
        throw new Error('CRITICAL SECURITY: Secret key leaked in public config!');
      }
    });

    // 3. Static asset delivery
    await check('Static assets (/style.css, /app.js, /report.js, /catalog.js) serve correctly', async () => {
      for (const asset of ['/style.css', '/app.js', '/report.js', '/catalog.js']) {
        const res = await fetch(`${testUrl}${asset}`);
        if (!res.ok) throw new Error(`Failed to load ${asset}: ${res.status}`);
      }
    });

  // 4. Supabase Auth and Data Connectivity
  if (configData && configData.supabaseUrl && configData.supabaseAnonKey) {
    let accessToken = null;

    await check('Supabase Auth: Sign in with operator credentials', async () => {
      const loginRes = await fetch(`${configData.supabaseUrl}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: {
          'apikey': configData.supabaseAnonKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ email: EMAIL, password: PASSWORD })
      });
      if (!loginRes.ok) {
        const errJson = await loginRes.json().catch(() => ({}));
        throw new Error(`Login failed (${loginRes.status}): ${errJson.error_description || errJson.msg || 'Unknown'}`);
      }
      const authData = await loginRes.json();
      if (!authData.access_token) throw new Error('No access_token returned');
      accessToken = authData.access_token;
    });

    if (accessToken) {
      await check('Supabase Query: Test catalog query with RLS active', async () => {
        const res = await fetch(`${configData.supabaseUrl}/rest/v1/tests?select=count`, {
          headers: {
            'apikey': configData.supabaseAnonKey,
            'Authorization': `Bearer ${accessToken}`,
            'Range-Unit': 'items',
            'Range': '0-0',
            'Prefer': 'count=exact'
          }
        });
        if (!res.ok) throw new Error(`Supabase query failed: ${res.status} ${res.statusText}`);
        const range = res.headers.get('content-range');
        console.log(`      Active Catalog Count: ${range}`);
      });

      await check('Supabase Query: Active lab settings configuration', async () => {
        const res = await fetch(`${configData.supabaseUrl}/rest/v1/lab_settings?select=lab_name,address,phone&limit=1`, {
          headers: {
            'apikey': configData.supabaseAnonKey,
            'Authorization': `Bearer ${accessToken}`
          }
        });
        if (!res.ok) throw new Error(`Lab settings query failed: ${res.status}`);
        const data = await res.json();
        if (!data || data.length === 0) throw new Error('lab_settings table is empty');
        console.log(`      Active Laboratory: ${data[0].lab_name}`);
      });
    }
  }
  } finally {
    if (inProcessServer) {
      inProcessServer.close();
    }
  }

  console.log(`\n------------------------------------------------------`);
  console.log(` Post-Deploy Smoke Test Result: ${passed} passed, ${failed} failed`);
  console.log(`------------------------------------------------------\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runSmokeTests().catch(err => {
  console.error('Smoke test runner fatal error:', err);
  process.exit(1);
});

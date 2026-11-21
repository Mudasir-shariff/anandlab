import fs from 'node:fs';
import path from 'node:path';

// Read .env
const envText = fs.readFileSync(path.resolve('.env'), 'utf-8');
const env = {};
envText.split('\n').forEach(line => {
  const match = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?\s*$/);
  if (match) {
    let value = match[2] || '';
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (value.startsWith("'") && value.endsWith("'")) value = value.slice(1, -1);
    env[match[1]] = value.trim();
  }
});

const SUPABASE_URL = env.SUPABASE_URL;
const SUPABASE_KEY = env.SUPABASE_SECRET_KEY || env.SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials in .env');
  process.exit(1);
}

const tables = [
  'lab_settings',
  'doctors',
  'referral_labs',
  'referral_hospitals',
  'tests',
  'test_parameters',
  'patients',
  'bills',
  'bill_items',
  'payments',
  'reports',
  'report_results'
];

async function backup() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = path.resolve('backups', `backup-${timestamp}`);
  fs.mkdirSync(backupDir, { recursive: true });

  const summary = {};

  for (const table of tables) {
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?select=*`, {
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`
        }
      });
      if (!res.ok) {
        console.error(`Failed to fetch ${table}: ${res.status} ${res.statusText}`);
        summary[table] = { status: 'error', code: res.status };
        continue;
      }
      const data = await res.json();
      fs.writeFileSync(path.join(backupDir, `${table}.json`), JSON.stringify(data, null, 2));
      summary[table] = { status: 'ok', count: data.length };
      console.log(`Backed up ${table}: ${data.length} rows`);
    } catch (err) {
      console.error(`Error backing up ${table}:`, err.message);
      summary[table] = { status: 'error', error: err.message };
    }
  }

  fs.writeFileSync(path.join(backupDir, 'summary.json'), JSON.stringify(summary, null, 2));
  console.log(`Backup completed to ${backupDir}`);
}

backup();

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const envPath = path.resolve(__dirname, '..', '.env');

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
      if (!process.env[key]) process.env[key] = val;
    }
  }
}

const supabaseUrl = process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabase = createClient(supabaseUrl, secretKey);

async function check() {
  console.log('Checking database tables in Supabase...');
  const tables = ['lab_settings', 'doctors', 'tests', 'test_parameters', 'patients', 'bills', 'bill_items', 'payments', 'reports'];
  
  for (const t of tables) {
    const { data, error } = await supabase.from(t).select('*').limit(1);
    if (error) {
      console.log(`❌ Table '${t}' error: ${error.message}`);
    } else {
      console.log(`✔ Table '${t}' is ready (${data.length} rows found)`);
    }
  }

  // Check tests catalog count
  const { count, error: countErr } = await supabase.from('tests').select('*', { count: 'exact', head: true });
  if (!countErr) {
    console.log(`\nTests catalog count: ${count} panels loaded.`);
  }
}

check().catch(console.error);

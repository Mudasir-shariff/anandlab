import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';
import { TESTS, PARAMETERS } from '../dist/catalog.js';

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

if (!supabaseUrl || !secretKey) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SECRET_KEY required');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, secretKey);

async function main() {
  console.log('Synchronizing 38 tests with Anand Diagnostic Center pricing to Supabase...');

  // 1. Fetch existing tests
  const { data: existingTests, error: fetchErr } = await supabase.from('tests').select('id, code');
  if (fetchErr) throw fetchErr;

  const validCodes = Object.keys(TESTS);

  // 2. Remove tests that are NOT in the 38 list
  for (const et of existingTests) {
    if (!validCodes.includes(et.code)) {
      console.log(`Deleting obsolete test: ${et.code}`);
      await supabase.from('test_parameters').delete().eq('test_id', et.id);
      await supabase.from('tests').delete().eq('id', et.id);
    }
  }

  // 3. Upsert the 38 tests and their parameters
  let count = 0;
  for (const [code, meta] of Object.entries(TESTS)) {
    // Upsert test
    const { data: testRow, error: testErr } = await supabase
      .from('tests')
      .upsert({
        code,
        name: meta.name,
        department: meta.department,
        sample_type: meta.sample,
        price: meta.price,
        active: true
      }, { onConflict: 'code' })
      .select('id')
      .single();

    if (testErr) {
      console.error(`Error saving test ${code}:`, testErr.message);
      continue;
    }

    const testId = testRow.id;

    // Delete existing parameters for this test
    await supabase.from('test_parameters').delete().eq('test_id', testId);

    // Insert parameters
    const paramRows = meta.parameters.map((pKey, idx) => {
      const p = PARAMETERS[pKey] || { name: pKey, unit: '', reference: '' };
      return {
        test_id: testId,
        code: pKey,
        name: p.name,
        unit: p.unit || '',
        reference_range: p.reference || '',
        reference_range_m: p.referenceM || null,
        reference_range_f: p.referenceF || null,
        min_val: p.min !== undefined ? p.min : null,
        max_val: p.max !== undefined ? p.max : null,
        critical_min: p.criticalMin !== undefined ? p.criticalMin : null,
        critical_max: p.criticalMax !== undefined ? p.criticalMax : null,
        sort_order: idx + 1
      };
    });

    if (paramRows.length > 0) {
      const { error: pErr } = await supabase.from('test_parameters').insert(paramRows);
      if (pErr) console.error(`Error inserting parameters for ${code}:`, pErr.message);
    }

    count++;
    console.log(`✔ [${count}/38] Synced: ${code} - ${meta.name} (₹${meta.price})`);
  }

  // Also update lab name in lab_settings to Anand Diagnostic Center
  await supabase.from('lab_settings').update({
    lab_name: 'Anand Diagnostic Center'
  }).neq('id', '00000000-0000-0000-0000-000000000000');

  console.log('\n=============================================');
  console.log(`SUCCESS: ${count} tests synchronized in Supabase.`);
  console.log('Lab name updated to: Anand Diagnostic Center');
  console.log('=============================================\n');
}

main().catch(console.error);

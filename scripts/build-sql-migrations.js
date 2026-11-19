import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TESTS, PARAMETERS } from '../dist/catalog.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const migrationsDir = path.resolve(__dirname, '..', 'supabase', 'migrations');

let sql = `-- ====================================================================
-- LABFLOW / ANAND DIAGNOSTIC CENTER: SEED DATA 003
-- Initial Lab Settings, Default Referrers, and 38 Clinical Test Panels
-- ====================================================================

-- 1. Initial Lab Settings
INSERT INTO public.lab_settings (
    lab_name,
    tagline,
    address,
    phone,
    email,
    registration_no,
    pathologist_name,
    pathologist_qualification,
    lab_incharge,
    lab_incharge_qualification,
    letterhead_template,
    report_footer,
    working_hours
) VALUES (
    'Anand Diagnostic Center',
    'Precision Diagnostics · Clinical Excellence',
    '#42, 10th Main, Vijayanagar, Bangalore - 560040',
    '+91 98450 12345',
    'contact@ananddiagnostic.in',
    'KA-BLR-LAB-2026-089',
    'Dr. Ramesh Kumar',
    'MD (Pathology), DCP',
    'S. Nagaraj',
    'B.Sc MLT (Senior Technologist)',
    'classic',
    'Results relate only to the specimen tested. Please correlate clinically with symptoms and history.',
    'Mon – Sat: 7:00 AM – 8:30 PM | Sun: 7:00 AM – 1:00 PM'
)
ON CONFLICT DO UPDATE SET lab_name = EXCLUDED.lab_name;

-- 2. Referring Doctors (Empty by default - registered by laboratory staff)
-- 3. Referral Labs & Hospitals (Empty by default - registered by laboratory staff)

-- 4. 38 Test Panels & Parameters
DO $$
DECLARE
    v_test_id UUID;
BEGIN
`;

let idx = 0;
for (const [code, meta] of Object.entries(TESTS)) {
  idx++;
  const safeName = meta.name.replace(/'/g, "''");
  sql += `    -- ${idx}. ${code}
    INSERT INTO public.tests (code, name, department, sample_type, price, active)
    VALUES ('${code}', '${safeName}', '${meta.department}', '${meta.sample}', ${meta.price.toFixed(2)}, true)
    ON CONFLICT (code) DO UPDATE SET name = EXCLUDED.name, price = EXCLUDED.price, department = EXCLUDED.department, sample_type = EXCLUDED.sample_type
    RETURNING id INTO v_test_id;

    DELETE FROM public.test_parameters WHERE test_id = v_test_id;
    INSERT INTO public.test_parameters (test_id, code, name, unit, reference_range, reference_range_m, reference_range_f, min_val, max_val, critical_min, critical_max, sort_order) VALUES
`;

  const pRows = meta.parameters.map((pKey, pIdx) => {
    const p = PARAMETERS[pKey] || { name: pKey, unit: '', reference: '' };
    const pName = p.name.replace(/'/g, "''");
    const ref = (p.reference || '').replace(/'/g, "''");
    const refM = p.referenceM ? `'${p.referenceM.replace(/'/g, "''")}'` : 'NULL';
    const refF = p.referenceF ? `'${p.referenceF.replace(/'/g, "''")}'` : 'NULL';
    const minVal = p.min !== undefined ? p.min : 'NULL';
    const maxVal = p.max !== undefined ? p.max : 'NULL';
    const cMin = p.criticalMin !== undefined ? p.criticalMin : 'NULL';
    const cMax = p.criticalMax !== undefined ? p.criticalMax : 'NULL';
    return `        (v_test_id, '${pKey}', '${pName}', '${p.unit || ''}', '${ref}', ${refM}, ${refF}, ${minVal}, ${maxVal}, ${cMin}, ${cMax}, ${pIdx + 1})`;
  });

  sql += pRows.join(',\n') + ';\n\n';
}

sql += `END $$;
`;

const file003 = path.join(migrationsDir, '003_seed_catalog.sql');
fs.writeFileSync(file003, sql, 'utf8');
console.log('Saved 003_seed_catalog.sql successfully.');

// Combine into all_in_one_setup.sql
const file001 = path.join(migrationsDir, '001_initial_schema.sql');
const file002 = path.join(migrationsDir, '002_functions_and_rpc.sql');
const fileAll = path.join(migrationsDir, 'all_in_one_setup.sql');

const content001 = fs.readFileSync(file001, 'utf8');
const content002 = fs.readFileSync(file002, 'utf8');
const contentAll = `${content001}\n\n${content002}\n\n${sql}`;

fs.writeFileSync(fileAll, contentAll, 'utf8');
console.log('Saved all_in_one_setup.sql with complete 38 tests.');

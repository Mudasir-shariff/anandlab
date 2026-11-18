import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createClient } from '@supabase/supabase-js';

// Load environment variables from .env if present
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
      if (!process.env[key]) {
        process.env[key] = val;
      }
    }
  }
}

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const username = process.env.LAB_USERNAME || 'anandlab';
const password = process.env.LAB_PASSWORD;

if (!supabaseUrl || !serviceRoleKey) {
  console.error('ERROR: SUPABASE_URL and SUPABASE_SECRET_KEY (or SUPABASE_SERVICE_ROLE_KEY) must be set in .env');
  process.exit(1);
}

if (!password) {
  console.error('ERROR: LAB_PASSWORD must be set in .env');
  process.exit(1);
}

const emailDomain = process.env.LAB_EMAIL_DOMAIN || 'labflow.local';
const email = `${username.toLowerCase()}@${emailDomain}`;

console.log(`Connecting to Supabase at: ${supabaseUrl}`);
console.log(`Provisioning laboratory user: ${username} (${email})...`);

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function main() {
  try {
    // 1. Check if user already exists
    const { data: usersData, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;

    const existing = usersData.users.find(u => u.email?.toLowerCase() === email.toLowerCase());

    if (existing) {
      console.log(`User ${email} already exists (ID: ${existing.id}). Updating password and confirming email...`);
      const { error: updateError } = await supabase.auth.admin.updateUserById(existing.id, {
        password: password,
        email_confirm: true,
        user_metadata: { username, role: 'lab_staff' }
      });
      if (updateError) throw updateError;
      console.log('User password and verification updated successfully.');
    } else {
      console.log(`Creating user ${email}...`);
      const { data: createData, error: createError } = await supabase.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: true,
        user_metadata: { username, role: 'lab_staff' }
      });
      if (createError) throw createError;
      console.log(`User created successfully (ID: ${createData.user.id}).`);
    }

    console.log('\n=============================================');
    console.log('SUCCESS: Laboratory staff account is active.');
    console.log(`Staff username: ${username}`);
    console.log('Ready for Electron login.');
    console.log('=============================================\n');
  } catch (err) {
    console.error('Failed to provision user:', err.message || err);
    process.exit(1);
  }
}

main();

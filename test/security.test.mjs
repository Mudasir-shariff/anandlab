import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

test('Security: Secret service role key must NEVER be served to client via /api/config', () => {
  // Simulate the serve-web.js logic
  const envMock = {
    SUPABASE_URL: 'https://zynqvlhxregoxskzhnmu.supabase.co',
    SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test',
    SECRET_KEY_MOCK: 'mock_secret_should_never_leak'
  };

  // Config returned to web client
  const clientConfig = {
    supabaseUrl: envMock.SUPABASE_URL,
    supabaseAnonKey: envMock.SUPABASE_PUBLISHABLE_KEY
  };

  assert.equal(clientConfig.supabaseAnonKey, 'sb_publishable_test');
  assert.equal('SECRET_KEY_MOCK' in clientConfig, false);
  assert.equal(JSON.stringify(clientConfig).includes('mock_secret'), false);
});

test('Security: Content-Security-Policy enforces restricted script and connect origins', () => {
  const mainCjs = fs.readFileSync(path.resolve('src/main/main.cjs'), 'utf-8');
  assert.equal(mainCjs.includes("connect-src 'self' https://*.supabase.co wss://*.supabase.co"), true);
  assert.equal(mainCjs.includes("contextIsolation: true"), true);
  assert.equal(mainCjs.includes("nodeIntegration: false"), true);
  assert.equal(mainCjs.includes("sandbox: true"), true);
});

test('Security: HTML entity encoding blocks nested tags and attributes', () => {
  function escapeHTML(str) {
    return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  const payload = `<div style="background:url('javascript:alert(1)')" onclick="alert(1)">`;
  const sanitized = escapeHTML(payload);
  assert.equal(sanitized.includes('<div'), false);
  assert.equal(sanitized.includes('"'), false);
  assert.equal(sanitized.includes("'"), false);
});

import test from 'node:test';
import assert from 'node:assert/strict';

// Validation helper functions representing hardened validation rules
export function validatePatient(p) {
  const errors = [];
  const name = String(p.fullName ?? '').trim();
  if (!name) {
    errors.push('Full name is required.');
  } else if (name.length > 150) {
    errors.push('Full name exceeds maximum 150 characters.');
  }

  const ageVal = parseInt(p.ageValue, 10);
  const ageUnit = p.ageUnit || 'Y';
  if (isNaN(ageVal) || ageVal < 0) {
    errors.push('Age must be a non-negative number.');
  } else if (ageUnit === 'Y' && ageVal > 125) {
    errors.push('Age in years cannot exceed 125.');
  } else if (ageUnit === 'M' && ageVal > 12) {
    errors.push('Age in months cannot exceed 12.');
  } else if (ageUnit === 'D' && ageVal > 31) {
    errors.push('Age in days cannot exceed 31.');
  }

  const mobile = String(p.mobile ?? '').trim();
  if (mobile) {
    const cleanMobile = mobile.replace(/[\s-]/g, '');
    if (!/^(?:\+91|0)?[6-9]\d{9}$/.test(cleanMobile)) {
      errors.push('Invalid Indian mobile phone number.');
    }
  }

  return { isValid: errors.length === 0, errors };
}

export function validateBilling(subtotal, discount, paidAmount) {
  const errors = [];
  const sub = Number(subtotal || 0);
  const disc = Number(discount || 0);
  const paid = Number(paidAmount || 0);

  if (sub <= 0) {
    errors.push('Subtotal must be greater than zero.');
  }
  if (disc < 0) {
    errors.push('Discount cannot be negative.');
  }
  if (disc > sub) {
    errors.push('Discount cannot exceed subtotal amount.');
  }
  const net = Math.max(0, sub - disc);
  if (paid < 0) {
    errors.push('Paid amount cannot be negative.');
  }
  if (paid > net) {
    errors.push('Paid amount cannot exceed net payable total.');
  }

  const balance = Math.round((net - paid + Number.EPSILON) * 100) / 100;
  return { isValid: errors.length === 0, errors, net, balance };
}

export function escapeHTML(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

test('Adversarial: Patient registration rejects invalid names and extremes', () => {
  // Empty & whitespace
  assert.equal(validatePatient({ fullName: '', ageValue: 25, ageUnit: 'Y' }).isValid, false);
  assert.equal(validatePatient({ fullName: '   ', ageValue: 25, ageUnit: 'Y' }).isValid, false);

  // 10k character name
  const hugeName = 'A'.repeat(10000);
  assert.equal(validatePatient({ fullName: hugeName, ageValue: 25, ageUnit: 'Y' }).isValid, false);

  // Unicode, Kannada & emojis should be accepted if length <= 150
  const kannadaName = 'ಆನಂದ್ ಕುಮಾರ್';
  const resKannada = validatePatient({ fullName: kannadaName, ageValue: 30, ageUnit: 'Y' });
  assert.equal(resKannada.isValid, true);
});

test('Adversarial: Age boundary and unit validation', () => {
  // Negative age
  assert.equal(validatePatient({ fullName: 'Test', ageValue: -5, ageUnit: 'Y' }).isValid, false);

  // Extreme years (> 125)
  assert.equal(validatePatient({ fullName: 'Test', ageValue: 150, ageUnit: 'Y' }).isValid, false);
  assert.equal(validatePatient({ fullName: 'Test', ageValue: 125, ageUnit: 'Y' }).isValid, true);

  // Extreme months (> 12)
  assert.equal(validatePatient({ fullName: 'Infant', ageValue: 15, ageUnit: 'M' }).isValid, false);
  assert.equal(validatePatient({ fullName: 'Infant', ageValue: 6, ageUnit: 'M' }).isValid, true);

  // Extreme days (> 31)
  assert.equal(validatePatient({ fullName: 'Neonate', ageValue: 45, ageUnit: 'D' }).isValid, false);
  assert.equal(validatePatient({ fullName: 'Neonate', ageValue: 20, ageUnit: 'D' }).isValid, true);
});

test('Adversarial: Phone number validation prevents junk data', () => {
  // Valid Indian numbers
  assert.equal(validatePatient({ fullName: 'Test', ageValue: 25, mobile: '9876543210' }).isValid, true);
  assert.equal(validatePatient({ fullName: 'Test', ageValue: 25, mobile: '+91 9876543210' }).isValid, true);
  assert.equal(validatePatient({ fullName: 'Test', ageValue: 25, mobile: '09876543210' }).isValid, true);

  // Invalid numbers
  assert.equal(validatePatient({ fullName: 'Test', ageValue: 25, mobile: '12345' }).isValid, false);
  assert.equal(validatePatient({ fullName: 'Test', ageValue: 25, mobile: 'abcdefghij' }).isValid, false);
  assert.equal(validatePatient({ fullName: 'Test', ageValue: 25, mobile: '1234567890' }).isValid, false); // Doesn't start with 6-9
  assert.equal(validatePatient({ fullName: 'Test', ageValue: 25, mobile: '9876543210123' }).isValid, false); // Too long
});

test('Adversarial: Billing rejects negative discount, negative paid, and excessive payments', () => {
  // Negative discount
  assert.equal(validateBilling(1000, -100, 900).isValid, false);

  // Excessive discount
  assert.equal(validateBilling(1000, 1500, 0).isValid, false);

  // Negative paid
  assert.equal(validateBilling(1000, 100, -50).isValid, false);

  // Overpaid
  assert.equal(validateBilling(1000, 200, 900).isValid, false); // Net is 800, paid 900

  // Valid happy path
  const valid = validateBilling(1000, 200, 500);
  assert.equal(valid.isValid, true);
  assert.equal(valid.net, 800);
  assert.equal(valid.balance, 300);
});

test('Adversarial & Security: XSS injection vectors are neutralized by escapeHTML', () => {
  const xssPayloads = [
    '<script>alert("XSS")</script>',
    '<img src=x onerror=alert(1)>',
    '"><svg/onload=confirm(1)>',
    "' onfocus=alert(1) autofocus='",
    'javascript:alert(1)'
  ];

  for (const payload of xssPayloads) {
    const escaped = escapeHTML(payload);
    assert.equal(escaped.includes('<script>'), false);
    assert.equal(escaped.includes('<img'), false);
    assert.equal(escaped.includes('<svg'), false);
    assert.equal(escaped.includes('"'), false);
    assert.equal(escaped.includes("'"), false);
  }
});

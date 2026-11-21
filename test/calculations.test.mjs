import test from 'node:test';
import assert from 'node:assert/strict';

// Test numberToWords logic matching app.js
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

function roundCurrency(val) {
  return Math.round((Number(val || 0) + Number.EPSILON) * 100) / 100;
}

test('Calculations: numberToWords matches standard Indian numbering', () => {
  assert.equal(numberToWords(0), 'Rupees Zero Only');
  assert.equal(numberToWords(450), 'Rupees Four Hundred Fifty Only');
  assert.equal(numberToWords(1000), 'Rupees One Thousand Only');
  assert.equal(numberToWords(15750), 'Rupees Fifteen Thousand Seven Hundred Fifty Only');
  assert.equal(numberToWords(105000), 'Rupees One Lakh Five Thousand Only');
  assert.equal(numberToWords(12500000), 'Rupees One Crore Twenty Five Lakh Only');
  assert.equal(numberToWords(99.99), 'Rupees Ninety Nine Only'); // Floor behavior verified
});

test('Calculations: Currency arithmetic rounding avoids floating point errors', () => {
  // Classic 0.1 + 0.2 = 0.30000000000000004
  const unrounded = 0.1 + 0.2;
  assert.notEqual(unrounded, 0.3);
  assert.equal(roundCurrency(unrounded), 0.3);

  // Subtotal minus discount equals net
  const subtotal = 1450.50;
  const discount = 150.25;
  const net = roundCurrency(subtotal - discount);
  assert.equal(net, 1300.25);

  // Balance due calculation
  const paid = 500.00;
  const balance = roundCurrency(net - paid);
  assert.equal(balance, 800.25);

  // Overpayment check
  const excessivePaid = 1500.00;
  const isOverpaid = excessivePaid > net;
  assert.equal(isOverpaid, true);
});

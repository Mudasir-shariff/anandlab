import test from 'node:test';
import assert from 'node:assert/strict';
import { TESTS, PARAMETERS, makeDemoOrders, reportNotes } from '../dist/catalog.js';

const codes = [
  'CBC', 'BLOOD_GROUP', 'WIDAL', 'CRP', 'PLATELET', 'AEC', 'ESR', 'MALARIA',
  'MANTOUX', 'CHIKUNGUNYA', 'HIV', 'HBSAG', 'VDRL', 'HSV', 'URINE_ROUTINE',
  'PREGNANCY', 'FBS', 'PPBS', 'RA_FACTOR', 'ASLO', 'HBA1C', 'LFT',
  'URIC_ACID', 'THYROID_PROFILE', 'LIPID_PROFILE', 'UREA', 'ELECTROLYTES',
  'CREATININE', 'FSH', 'LH', 'PROLACTIN', 'TESTOSTERONE', 'IRON_PROFILE',
  'ANA_PROFILE', 'DENGUE', 'AMYLASE', 'LIPASE', 'CALCIUM'
];

const parametersFor = order => [...new Set(order.tests.flatMap(code => TESTS[code].parameters))];

test('catalog contains the 38 requested tests and matches exact Anand Diagnostic pricing', () => {
  assert.equal(codes.length, 38);
  assert.deepEqual(Object.keys(TESTS), codes);
  assert.equal(TESTS.CBC.price, 300);
  assert.equal(TESTS.BLOOD_GROUP.price, 70);
  assert.equal(TESTS.WIDAL.price, 200);
  assert.equal(TESTS.CRP.price, 300);
  assert.equal(TESTS.PLATELET.price, 150);
  assert.equal(TESTS.AEC.price, 300);
  assert.equal(TESTS.ESR.price, 100);
  assert.equal(TESTS.MALARIA.price, 250);
  assert.equal(TESTS.MANTOUX.price, 400);
  assert.equal(TESTS.CHIKUNGUNYA.price, 800);
  assert.equal(TESTS.HIV.price, 450);
  assert.equal(TESTS.HBSAG.price, 300);
  assert.equal(TESTS.VDRL.price, 200);
  assert.equal(TESTS.HSV.price, 400);
  assert.equal(TESTS.URINE_ROUTINE.price, 100);
  assert.equal(TESTS.PREGNANCY.price, 100);
  assert.equal(TESTS.FBS.price, 50);
  assert.equal(TESTS.PPBS.price, 50);
  assert.equal(TESTS.RA_FACTOR.price, 150);
  assert.equal(TESTS.ASLO.price, 350);
  assert.equal(TESTS.HBA1C.price, 500);
  assert.equal(TESTS.LFT.price, 450);
  assert.equal(TESTS.URIC_ACID.price, 250);
  assert.equal(TESTS.THYROID_PROFILE.price, 450);
  assert.equal(TESTS.LIPID_PROFILE.price, 500);
  assert.equal(TESTS.UREA.price, 140);
  assert.equal(TESTS.ELECTROLYTES.price, 500);
  assert.equal(TESTS.CREATININE.price, 150);
  assert.equal(TESTS.FSH.price, 350);
  assert.equal(TESTS.LH.price, 350);
  assert.equal(TESTS.PROLACTIN.price, 600);
  assert.equal(TESTS.TESTOSTERONE.price, 600);
  assert.equal(TESTS.IRON_PROFILE.price, 1500);
  assert.equal(TESTS.ANA_PROFILE.price, 3500);
  assert.equal(TESTS.DENGUE.price, 600);
  assert.equal(TESTS.AMYLASE.price, 500);
  assert.equal(TESTS.LIPASE.price, 400);
  assert.equal(TESTS.CALCIUM.price, 450);

  for (const [code, panel] of Object.entries(TESTS)) {
    assert(panel.name && panel.sample && panel.department && Number.isFinite(panel.price), code);
    assert.equal(new Set(panel.parameters).size, panel.parameters.length, `${code} duplicates a parameter`);
    assert(reportNotes[code], `${code} lacks report guidance note`);
    for (const key of panel.parameters) {
      const p = PARAMETERS[key];
      assert(p && p.name && p.reference, `${code}: missing metadata for ${key}`);
      assert(Number.isFinite(p.min) && Number.isFinite(p.max) && p.min <= p.max, `${key}: invalid interval`);
    }
  }
});

test('fresh review and approved demo orders stay complete after catalog expansion', () => {
  for (const order of makeDemoOrders()) {
    assert.equal(order.amount, order.tests.reduce((sum, code) => sum + TESTS[code].price, 0));
    if (!['Review', 'Approved'].includes(order.status)) continue;
    for (const key of parametersFor(order)) assert(order.results[key] !== undefined, `${order.id}: missing ${key}`);
  }
});

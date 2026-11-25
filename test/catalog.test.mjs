import test from 'node:test';
import assert from 'node:assert/strict';
import { TESTS, PARAMETERS, makeDemoOrders, reportNotes, filterNotesForSelectedTests } from '../dist/catalog.js';

const codes = [
  'CBC', 'HB', 'BLOOD_GROUP', 'WIDAL', 'CRP', 'PLATELET', 'AEC', 'ESR', 'MALARIA',
  'MANTOUX', 'CHIKUNGUNYA', 'HIV', 'HBSAG', 'VDRL', 'HSV', 'URINE_ROUTINE',
  'PREGNANCY', 'FBS', 'PPBS', 'RA_FACTOR', 'ASLO', 'HBA1C', 'LFT',
  'URIC_ACID', 'THYROID_PROFILE', 'LIPID_PROFILE', 'UREA', 'ELECTROLYTES',
  'CREATININE', 'FSH', 'LH', 'PROLACTIN', 'TESTOSTERONE', 'IRON_PROFILE',
  'ANA_PROFILE', 'DENGUE', 'AMYLASE', 'LIPASE', 'CALCIUM'
];

const parametersFor = order => [...new Set(order.tests.flatMap(code => TESTS[code].parameters))];

test('catalog contains the 39 tests and matches exact Anand Diagnostic pricing', () => {
  assert.equal(codes.length, 39);
  assert.deepEqual(Object.keys(TESTS), codes);
  assert.equal(TESTS.CBC.price, 300);
  assert.equal(TESTS.HB.price, 150);
  assert.equal(TESTS.HB.name, 'Hemoglobin (Hb)');
  assert.equal(TESTS.HB.department, 'Hematology');
  assert.equal(TESTS.HB.sample, 'EDTA Whole Blood');
  assert.deepEqual(TESTS.HB.parameters, ['hb']);
  assert.equal(PARAMETERS.hb.unit, 'g/dL');
  assert.equal(PARAMETERS.hb.minM, 13.5);
  assert.equal(PARAMETERS.hb.maxM, 17.5);
  assert.equal(PARAMETERS.hb.minF, 12.0);
  assert.equal(PARAMETERS.hb.maxF, 15.5);
  assert.equal(PARAMETERS.hb.criticalMin, 7.0);
  assert.equal(PARAMETERS.hb.criticalMax, 21.0);
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

test('dynamic interpretation: canceling a test from print excludes its clinical interpretation', () => {
  const allTests = ['CBC', 'FBS', 'LFT'];
  const fullNotes = allTests.map(k => reportNotes[k]).join('\n\n');

  // Cancel CBC, only print FBS and LFT
  const res1 = filterNotesForSelectedTests(fullNotes, ['FBS', 'LFT'], allTests);
  assert(!res1.includes(reportNotes.CBC), 'Canceled CBC interpretation must be excluded');
  assert(res1.includes(reportNotes.FBS), 'Selected FBS interpretation must be retained');
  assert(res1.includes(reportNotes.LFT), 'Selected LFT interpretation must be retained');

  // Cancel FBS and LFT, only print CBC
  const res2 = filterNotesForSelectedTests(fullNotes, ['CBC'], allTests);
  assert(res2.includes(reportNotes.CBC), 'Selected CBC interpretation must be retained');
  assert(!res2.includes(reportNotes.FBS), 'Canceled FBS interpretation must be excluded');
  assert(!res2.includes(reportNotes.LFT), 'Canceled LFT interpretation must be excluded');

  // All tests selected keeps all notes
  const resAll = filterNotesForSelectedTests(fullNotes, allTests, allTests);
  assert.equal(resAll, fullNotes);

  // Custom labeled notes: canceling test removes labeled note
  const customNotes = 'CBC: Hemoglobin low.\n\nFBS: Glucose normal.\n\nReview clinically in 1 week.';
  const resCustom = filterNotesForSelectedTests(customNotes, ['FBS'], ['CBC', 'FBS']);
  assert(!resCustom.includes('CBC:'), 'Canceled CBC note must be excluded');
  assert(resCustom.includes('FBS: Glucose normal.'), 'Selected FBS note must be retained');
  assert(resCustom.includes('Review clinically in 1 week.'), 'General clinical remark must be preserved');
});


import test from 'node:test';
import assert from 'node:assert/strict';
import { TESTS, PARAMETERS, makeDemoOrders, reportNotes } from '../dist/catalog.js';

const codes = ['CBC','LFT','KFT','HBA1C','TSH','LIPID','GLUCOSE','THYROID','ESR','CRP','URIC_ACID','CALCIUM','ELECTROLYTES','IRON','VITD'];
const parametersFor = order => [...new Set(order.tests.flatMap(code => TESTS[code].parameters))];

test('catalog contains the fifteen requested panels and preserves existing prices', () => {
  assert.deepEqual(Object.keys(TESTS), codes);
  assert.deepEqual(Object.fromEntries(codes.slice(0,6).map(code => [code,TESTS[code].price])), { CBC:450,LFT:700,KFT:650,HBA1C:550,TSH:400,LIPID:750 });
  assert.equal(TESTS.CBC.parameters.length,15);
  assert(TESTS.CBC.parameters.includes('rdw_cv'));
  assert(TESTS.CBC.parameters.includes('rdw_sd'));
  for(const [code,panel] of Object.entries(TESTS)) {
    assert(panel.name && panel.sample && panel.department && Number.isFinite(panel.price),code);
    assert.equal(new Set(panel.parameters).size,panel.parameters.length,`${code} duplicates a result`);
    assert(reportNotes[code],`${code} lacks report guidance`);
    for(const key of panel.parameters) {
      const p=PARAMETERS[key];
      assert(p && p.name && p.unit && p.reference,`${code}: missing metadata for ${key}`);
      assert(Number.isFinite(p.min) && Number.isFinite(p.max) && p.min <= p.max,`${key}: invalid interval`);
    }
  }
});

test('fresh review and approved demo orders stay complete after catalog expansion', () => {
  for(const order of makeDemoOrders()) {
    assert.equal(order.amount,order.tests.reduce((sum,code)=>sum+TESTS[code].price,0));
    if(!['Review','Approved'].includes(order.status)) continue;
    for(const key of parametersFor(order)) assert(Number.isFinite(order.results[key]),`${order.id}: missing ${key}`);
  }
});

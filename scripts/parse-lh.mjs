import fs from 'node:fs';

const path = fs.existsSync('lighthouse-report.json') ? 'lighthouse-report.json' : 'labflow/lighthouse-report.json';
const r = JSON.parse(fs.readFileSync(path, 'utf8'));

console.log('=== LIGHTHOUSE CATEGORIES ===');
for (const [k, v] of Object.entries(r.categories)) {
  console.log(`${v.title}: ${Math.round(v.score * 100)}%`);
}

console.log('\n=== FAILING AUDITS (score < 1) ===');
for (const [k, a] of Object.entries(r.audits)) {
  if (a.score !== null && a.score < 1) {
    console.log(`[${a.score === 0 ? 'FAIL' : 'WARN'}] ${k}: ${a.title} (score: ${a.score})`);
    if (a.explanation) console.log(`   Explanation: ${a.explanation}`);
    if (a.displayValue) console.log(`   Value: ${a.displayValue}`);
    if (a.details && a.details.items && a.details.items.length) {
      console.log(`   Details: ${JSON.stringify(a.details.items.slice(0, 3))}`);
    }
  }
}

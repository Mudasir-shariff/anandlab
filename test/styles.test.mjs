import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

// Inspect rule scope without a browser so a misplaced print brace cannot hide
// application styling again. Ignore braces inside comments and quoted values.
function topLevelRules(source){
  const rules=[];let depth=0,start=0,quote=null,comment=false;
  for(let i=0;i<source.length;i++){
    const c=source[i],next=source[i+1];
    if(comment){if(c==='*'&&next==='/'){comment=false;i++;}continue;}
    if(quote){if(c==='\\'){i++;continue;}if(c===quote)quote=null;continue;}
    if(c==='/'&&next==='*'){comment=true;i++;continue;}
    if(c==='"'||c==="'"){quote=c;continue;}
    if(c==='{'){
      if(depth===0)rules.push({selector:source.slice(start,i).replace(/\/\*[\s\S]*?\*\//g,'').trim(),bodyStart:i+1});
      depth++;
    }
    if(c==='}'){
      assert(depth>0,'Unexpected CSS closing brace');depth--;
      if(depth===0){rules.at(-1).body=source.slice(rules.at(-1).bodyStart,i);start=i+1;}
    }
  }
  assert.equal(depth,0,'Unclosed CSS rule');assert.equal(quote,null,'Unclosed CSS string');assert.equal(comment,false,'Unclosed CSS comment');
  return rules;
}

test('Report Studio screen layout stays outside print-only rules',()=>{
  const rules=topLevelRules(readFileSync(new URL('../dist/style.css',import.meta.url),'utf8'));
  for(const [selector,display] of [['.report-intro','flex'],['.report-template-grid','grid'],['.report-library','grid']]){
    const rule=rules.find(rule=>rule.selector===selector);
    assert(rule,`${selector} must be a top-level screen rule`);
    assert.match(rule.body,new RegExp(`display\\s*:\\s*${display}`));
  }
  const print=rules.filter(rule=>rule.selector==='@media print');
  assert(print.length>0,'A print style block must exist');
  assert(print.some(rule=>rule.body.includes('.modal-foot')),'Print must hide app controls');
});

test('Standalone report styling has balanced screen and print scopes',()=>{
  const rules=topLevelRules(readFileSync(new URL('../dist/report.css',import.meta.url),'utf8'));
  assert(rules.some(rule=>rule.selector.includes('.report.report-document')));
  assert(rules.some(rule=>rule.selector==='@media print'));
});

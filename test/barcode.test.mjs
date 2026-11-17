import test from 'node:test';
import assert from 'node:assert/strict';
import { renderBarcode } from '../dist/barcode.js';
const bars=svg=>[...svg.matchAll(/<rect x="(\d+)" y="0" width="([13])" height="(\d+)"\/>/g)].map(match=>({x:Number(match[1]),width:Number(match[2]),height:Number(match[3])}));
function elementsForSymbol(allBars,index) {
 const current=allBars.slice(index*5,index*5+5),elements=[];
 current.forEach((bar,position)=>{elements.push(bar.width);if(position<4)elements.push(current[position+1].x-bar.x-bar.width);});
 return elements.map(width=>width===3?'w':width===1?'n':'?').join('');
}
test('Known Code39 symbols use the standard start/stop, zero, A and hyphen patterns',()=>{
 const svg=renderBarcode('0A-'),encoded=bars(svg);
 assert.equal(encoded.length,25);
 assert.equal(elementsForSymbol(encoded,0),'nwnnwnwnn');
 assert.equal(elementsForSymbol(encoded,1),'nnnwwnwnn');
 assert.equal(elementsForSymbol(encoded,2),'wnnnnwnnw');
 assert.equal(elementsForSymbol(encoded,3),'nwnnnnwnw');
 assert.equal(elementsForSymbol(encoded,4),'nwnnwnwnn');
});
test('All 43 standard symbols have nine alternating elements and exactly three wide elements',()=>{
 for(const character of '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%'){
  const encoded=bars(renderBarcode(character));const pattern=elementsForSymbol(encoded,1);
  assert.equal(pattern.length,9);assert(!pattern.includes('?'));assert.equal([...pattern].filter(value=>value==='w').length,3);
 }
});
test('Quiet zones, one-module inter-character gaps and physical dimensions remain correct',()=>{
 const value='LF-A1B2C3D4-S01-R01',svg=renderBarcode(value),encoded=bars(svg);
 const [,rawWidth,rawHeight]=svg.match(/viewBox="0 0 (\d+) (\d+)"/),width=Number(rawWidth),height=Number(rawHeight);
 assert.equal(width,16*(value.length+2)+19);
 assert.equal(encoded[0].x,10);const last=encoded.at(-1);assert.equal(width-last.x-last.width,10);
 for(let index=0;index<value.length+1;index++){
  const lastBar=encoded[index*5+4],firstNext=encoded[(index+1)*5];assert.equal(firstNext.x-lastBar.x-lastBar.width,1);
 }
 assert(svg.includes(`width="${Number((width*.254).toFixed(3))}mm"`));
 assert(svg.includes(`height="${Number((height*.254).toFixed(3))}mm"`));
 assert(svg.includes('shape-rendering="crispEdges"'));assert(svg.includes('max-width:none'));assert(svg.includes(`style="display:block;width:${Number((width*.254).toFixed(3))}mm;`));assert(svg.includes('stroke:none;stroke-width:0'));
});
test('Human label escaping cannot inject SVG or alter the encoded specimen value',()=>{
 const svg=renderBarcode('LF-123-S01-R01','<script>alert("x")</script> & label');
 assert(!svg.includes('<script>'));assert(svg.includes('&lt;script&gt;'));assert(svg.includes('&amp; label'));
 assert(svg.includes('data-barcode-value="LF-123-S01-R01"'));
});
test('Unsupported values fail explicitly rather than producing a fake or truncated barcode',()=>{
 for(const value of ['',null,123,'lowercase','LF_123','LF*123','LF-हिंदी','A'.repeat(41),'LF-123\n'])assert.throws(()=>renderBarcode(value),RangeError);
 assert.throws(()=>renderBarcode('LF-123',null),RangeError);
 assert.throws(()=>renderBarcode('LF-123','label\nnew line'),RangeError);
 assert(renderBarcode('A'.repeat(40)).includes('specimen-barcode'));
});

/**
 * Standard Code39 (ISO/IEC 16388) wide-element bit patterns.
 * Nine alternating bars/spaces per symbol, three wide elements, wide:narrow 3:1.
 * No optional Mod43 check digit is appended. Configure/validate the scanner accordingly.
 */
const ALPHABET='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ-. $/+%';
const ENCODINGS=Object.freeze([
  0x034,0x121,0x061,0x160,0x031,0x130,0x070,0x025,0x124,0x064,
  0x109,0x049,0x148,0x019,0x118,0x058,0x00d,0x10c,0x04c,0x01c,
  0x103,0x043,0x142,0x013,0x112,0x052,0x007,0x106,0x046,0x016,
  0x181,0x0c1,0x1c0,0x091,0x190,0x0d0,0x085,0x184,0x0c4,
  0x0a8,0x0a2,0x08a,0x02a
]);
const START_STOP=0x094;
const escape=value=>String(value).replace(/[&<>"']/g,character=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
const millimetres=value=>Number((value*.254).toFixed(3));

/** Return a genuine, vector Code39 symbol with 10X quiet zones and readable text. */
export function renderBarcode(value,label=value) {
  if(typeof value!=='string'||!value.length||value.length>40)throw new RangeError('Code39 value must contain 1–40 supported characters.');
  if([...value].some(character=>!ALPHABET.includes(character)))throw new RangeError('Code39 supports uppercase letters, digits, space and-. $/+%; asterisk is reserved for start/stop.');
  if(typeof label!=='string'||label.length>160||/[\u0000-\u001f\u007f]/.test(label))throw new RangeError('Barcode label must be readable text of at most 160 characters.');
  const patterns=[START_STOP,...[...value].map(character=>ENCODINGS[ALPHABET.indexOf(character)]),START_STOP];
  const symbolWidth=patterns.length*15+(patterns.length-1);
  const barHeight=Math.max(50,Math.ceil(symbolWidth*.15));
  const width=symbolWidth+20,height=barHeight+22;
  const bars=[];
  let position=10;
  patterns.forEach((pattern,symbolIndex)=>{
    for(let element=0;element<9;element++) {
      const elementWidth=(pattern&(1<<(8-element)))?3:1;
      if(element%2===0)bars.push(`<rect x="${position}" y="0" width="${elementWidth}" height="${barHeight}"/>`);
      position+=elementWidth;
    }
    if(symbolIndex<patterns.length-1)position++;
  });
  return `<svg class="specimen-barcode" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${millimetres(width)}mm" height="${millimetres(height)}mm" role="img" aria-label="Code39: ${escape(value)}" data-barcode-value="${escape(value)}" style="display:block;width:${millimetres(width)}mm;height:${millimetres(height)}mm;max-width:none;flex-shrink:0;stroke:none;stroke-width:0"><title>Code39: ${escape(value)}</title><rect x="0" y="0" width="${width}" height="${height}" fill="#fff"/><g fill="#000" shape-rendering="crispEdges">${bars.join('')}</g><text x="${width/2}" y="${barHeight+16}" text-anchor="middle" font-family="monospace" font-size="11" fill="#000">${escape(label)}</text></svg>`;
}

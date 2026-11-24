import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const srcLab = 'C:/Users/DELL/.gemini/antigravity/brain/0e8879f1-716f-437a-8fbe-1188b96b5f9f/.user_uploaded/media_1795531609605_4ae1e7b3.png';
const srcHospital = 'C:/Users/DELL/.gemini/antigravity/brain/0e8879f1-716f-437a-8fbe-1188b96b5f9f/.user_uploaded/media_1795531620111_507a4c1f.jpg';

const ROOT = 'C:/Users/DELL/Downloads/labflow-source/labflow';
const assetsDir = path.resolve(ROOT, 'dist/assets');
if (!fs.existsSync(assetsDir)) fs.mkdirSync(assetsDir, { recursive: true });

fs.copyFileSync(srcHospital, path.join(assetsDir, 'hospital-logo.jpg'));
fs.copyFileSync(srcLab, path.join(assetsDir, 'lab-logo.png'));

// Hospital logo base64
const hospBuf = fs.readFileSync(srcHospital);
const hospDataUrl = `data:image/jpeg;base64,${hospBuf.toString('base64')}`;

// Let's use Chrome headless to crop the microscope PNG to remove the bottom shutterstock watermark
// and save as a pristine clean PNG
const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const cropScriptHtml = `<!DOCTYPE html>
<html>
<body>
<img id="srcImg" src="file:///${srcLab.replace(/\\/g, '/')}" />
<canvas id="cropCanvas" width="260" height="230"></canvas>
<script>
window.onload = () => {
  const img = document.getElementById('srcImg');
  const canvas = document.getElementById('cropCanvas');
  const ctx = canvas.getContext('2d');
  // Crop only the top 225px where the microscope is, ignoring the bottom watermark text
  ctx.drawImage(img, 0, 0, 260, 225, 0, 0, 260, 225);
  const dataUrl = canvas.toDataURL('image/png');
  const div = document.createElement('div');
  div.id = 'output';
  div.textContent = dataUrl;
  document.body.appendChild(div);
};
</script>
</body>
</html>`;

const tempHtmlPath = path.resolve(ROOT, 'work/crop-temp.html');
fs.mkdirSync(path.dirname(tempHtmlPath), { recursive: true });
fs.writeFileSync(tempHtmlPath, cropScriptHtml, 'utf8');

const dump = spawnSync(chromePath, [
  '--headless',
  '--disable-gpu',
  '--no-sandbox',
  '--dump-dom',
  tempHtmlPath
], { encoding: 'utf8', timeout: 15000 });

let labDataUrl = '';
const match = dump.stdout.match(/<div id="output">(data:image\/png;base64,[^<]+)<\/div>/);
if (match) {
  labDataUrl = match[1];
  const b64Data = labDataUrl.replace(/^data:image\/png;base64,/, '');
  fs.writeFileSync(path.join(assetsDir, 'lab-logo-clean.png'), Buffer.from(b64Data, 'base64'));
  console.log('Successfully cropped and saved clean lab logo (watermark removed)!');
} else {
  // fallback to raw lab image
  const labBuf = fs.readFileSync(srcLab);
  labDataUrl = `data:image/png;base64,${labBuf.toString('base64')}`;
  console.log('Using raw lab image data URL');
}

// Generate an assets export file for report.js
const logosJs = `// Automatically generated logo data URLs
export const HOSPITAL_LOGO_SRC = ${JSON.stringify(hospDataUrl)};
export const LAB_LOGO_SRC = ${JSON.stringify(labDataUrl)};
`;
fs.writeFileSync(path.resolve(ROOT, 'dist/report-logos.js'), logosJs, 'utf8');
console.log('Successfully generated dist/report-logos.js');

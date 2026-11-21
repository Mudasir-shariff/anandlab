import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const cssPath = path.resolve(__dirname, '..', 'dist', 'report.css');
const outPath = path.resolve(__dirname, '..', 'dist', 'report-css.js');

const css = fs.readFileSync(cssPath, 'utf8');
const fileContent = `// Automatically generated from dist/report.css
export const REPORT_CSS = ${JSON.stringify(css)};
`;

fs.writeFileSync(outPath, fileContent, 'utf8');
console.log('Successfully generated dist/report-css.js (' + Buffer.byteLength(fileContent) + ' bytes)');

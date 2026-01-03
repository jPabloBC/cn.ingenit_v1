const fs = require('fs');
const path = require('path');
const csv = require('csv-parser');
const XLSX = require('xlsx');
const { Readable } = require('stream');

function detectSeparatorFromString(str) {
  if (!str || typeof str !== 'string') return ',';
  const lines = str.split(/\r?\n/);
  let first = '';
  for (const l of lines) {
    if (l && l.trim()) { first = l; break; }
  }
  if (!first) return ',';
  const commaCount = (first.match(/,/g) || []).length;
  const semiCount = (first.match(/;/g) || []).length;
  return semiCount > commaCount ? ';' : ',';
}

async function parseCsvFile(p) {
  const sample = fs.readFileSync(p, { encoding: 'utf8' }).slice(0, 64 * 1024);
  const sep = detectSeparatorFromString(sample);
  console.log(`Parsing ${path.basename(p)} using separator='${sep}'`);
  return new Promise((resolve, reject) => {
    const rows = [];
    fs.createReadStream(p)
      .pipe(csv({ separator: sep }))
      .on('data', (r) => rows.push(r))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

async function parseXlsxFile(p) {
  console.log(`Parsing XLSX ${path.basename(p)}`);
  const wb = XLSX.readFile(p);
  const sheet = wb.SheetNames[0];
  return XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: '' });
}

(async () => {
  const base = path.join(__dirname, '..', 'test-data');
  try {
    const comma = path.join(base, 'comma.csv');
    const semi = path.join(base, 'semi.csv');
    const xlsxPath = path.join(base, 'sample.xlsx');

    // create sample xlsx from comma.csv
    const wb = XLSX.utils.book_new();
    const csvRows = await parseCsvFile(comma);
    const ws = XLSX.utils.json_to_sheet(csvRows);
    XLSX.utils.book_append_sheet(wb, ws, 'Sheet1');
    XLSX.writeFile(wb, xlsxPath);

    const rowsComma = await parseCsvFile(comma);
    console.log('comma.csv rows:', rowsComma);

    const rowsSemi = await parseCsvFile(semi);
    console.log('semi.csv rows:', rowsSemi);

    const rowsXlsx = await parseXlsxFile(xlsxPath);
    console.log('sample.xlsx rows:', rowsXlsx);

    console.log('All parsing tests passed.');
  } catch (e) {
    console.error('Parsing test failed:', e);
    process.exit(1);
  }
})();

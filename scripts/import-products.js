/**
 * Import products from a CSV file into data/products.json.
 * Usage: node scripts/import-products.js [path/to/products.csv]
 * Default CSV path: products.csv in project root.
 *
 * CSV format (first row = headers):
 *   name, code, category, subcategory, units_per_case, case_price, image_url
 * - image_url is optional; if missing, catalog uses a placeholder based on code.
 * - category/subcategory values are used as-is (e.g. beverages, snacks, household).
 * - Numbers: units_per_case and case_price must be valid numbers.
 */
const fs = require('fs');
const path = require('path');

const projectRoot = path.join(__dirname, '..');
const defaultCsvPath = path.join(projectRoot, 'products.csv');
const outPath = path.join(projectRoot, 'data', 'products.json');

const csvPath = process.argv[2] || defaultCsvPath;

function parseCsvLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (c === '"') {
      inQuotes = !inQuotes;
    } else if ((c === ',' && !inQuotes) || (c === '\r' && !inQuotes)) {
      result.push(current.trim());
      current = '';
      if (c === '\r') break;
    } else {
      current += c;
    }
  }
  result.push(current.trim());
  return result;
}

function parseCsv(content) {
  const lines = content.split(/\n/).filter((l) => l.trim());
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]).map((h) => h.toLowerCase().replace(/\s+/g, '_'));
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i]);
    const row = {};
    headers.forEach((h, j) => {
      let v = values[j] != null ? values[j].trim() : '';
      if (h === 'units_per_case' || h === 'case_price') v = parseFloat(v) || 0;
      row[h] = v;
    });
    if (row.name && row.code) rows.push(row);
  }
  return rows;
}

function toProduct(row) {
  return {
    name: String(row.name || ''),
    code: String(row.code || ''),
    category: String(row.category || '').toLowerCase().replace(/\s+/g, '-'),
    subcategory: String(row.subcategory || '').toLowerCase().replace(/\s+/g, '-'),
    units_per_case: Number(row.units_per_case) || 0,
    case_price: Number(row.case_price) || 0,
    ...(row.image_url ? { image_url: String(row.image_url).trim() } : {}),
  };
}

try {
  const content = fs.readFileSync(csvPath, 'utf8');
  const rows = parseCsv(content);
  const products = rows.map(toProduct);
  const dataDir = path.dirname(outPath);
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(products, null, 2), 'utf8');
  console.log(`Imported ${products.length} products to ${outPath}`);
} catch (err) {
  if (err.code === 'ENOENT') {
    console.error('CSV file not found:', csvPath);
    console.error('Create a products.csv with headers: name, code, category, subcategory, units_per_case, case_price, image_url');
  } else {
    console.error(err.message);
  }
  process.exit(1);
}

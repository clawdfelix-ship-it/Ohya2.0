const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');

test('Vercel function excludes CDN-hosted images and ExcelJS browser bundles', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const apiBuild = config.builds.find(build => build.src === 'api/index.js');
  assert.equal(apiBuild.use, '@vercel/node');
  const patterns = apiBuild.config.excludeFiles;
  assert.ok(patterns.includes('public/**'), 'public assets must not be duplicated into the serverless function');
  assert.ok(patterns.includes('node_modules/exceljs/dist/**'), 'ExcelJS browser bundles must stay out of the serverless function');
  assert.ok(config.builds.some(build => build.src === 'public/**/*' && build.use === '@vercel/static'));
  assert.ok(config.routes.some(route => route.src === '/images/(.*)' && route.dest === '/public/images/$1'));
  assert.equal(config.crons.length, 6);
});

test('order workbook loads the Node.js ExcelJS entry point', () => {
  const source = fs.readFileSync(path.join(root, 'utils/orderExcelExport.js'), 'utf8');
  assert.match(source, /require\('exceljs\/lib\/exceljs\.nodejs'\)/);
});

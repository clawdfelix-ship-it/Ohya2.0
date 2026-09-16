const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function assertNoEarlyErrorReturnAfterBegin(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  for (let i = 0; i < lines.length; i += 1) {
    if (!lines[i].includes("await client.query('BEGIN')")) continue;

    let sawRollback = false;
    for (let j = i + 1; j < Math.min(lines.length, i + 40); j += 1) {
      const line = lines[j];
      if (line.includes("await client.query('ROLLBACK')")) sawRollback = true;
      if (line.includes("await client.query('COMMIT')")) break;
      if (line.includes('} catch')) break;
      if (line.includes('return res.status(')) {
        assert.ok(
          sawRollback,
          `${path.basename(filePath)} has return before rollback near line ${j + 1}`
        );
      }
    }
  }
}

test('transactional admin routes roll back before returning errors', () => {
  for (const relPath of [
    '../routes/admin.js',
    '../routes/logistics.js',
    '../routes/products-full.js',
    '../routes/orders.js',
  ]) {
    assertNoEarlyErrorReturnAfterBegin(path.join(__dirname, relPath));
  }
});

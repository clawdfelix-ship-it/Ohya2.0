const test = require('node:test');
const assert = require('node:assert/strict');

test('extractDescriptionFromDetailHtml extracts strong text before set contents', () => {
  const { extractDescriptionFromDetailHtml } = require('../scripts/fetch-mzakka-description');

  const html = `
    <html><body>
      <strong>アナルはもう恥ずかしいことではありません。</strong>
      <strong>スイングしながら振動する上級者向け！</strong>
      <strong>【セット内容】</strong>
      <p>should not be included</p>
    </body></html>
  `;

  const out = extractDescriptionFromDetailHtml(html);
  assert.match(out, /アナルはもう恥ずかしい/);
  assert.match(out, /スイング/);
  assert.doesNotMatch(out, /セット内容/);
});


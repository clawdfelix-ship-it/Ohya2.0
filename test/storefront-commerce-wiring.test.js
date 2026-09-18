const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readView(fileName) {
  return fs.readFileSync(path.join(__dirname, '..', 'views', fileName), 'utf8');
}

function readPublic(fileName) {
  return fs.readFileSync(path.join(__dirname, '..', 'public', 'js', fileName), 'utf8');
}

test('product page uses shared csrf-protected cart client for logged-in users', () => {
  const view = readView('product.ejs');

  // 頁面提供身份 + CSRF + 商品 JSON island，並載入共享 cart client
  assert.match(view, /meta name="csrf-token" content="<%= csrfToken \|\| '' %>"/);
  assert.match(view, /data-logged-in="<%= user \? '1' : '0' %>"/);
  assert.match(view, /<script id="mz-product" type="application\/json">/);
  assert.match(view, /<script src="\/js\/cart-client\.js"><\/script>/);
  assert.match(view, /MZCart\.add\(/);

  // 真正嘅 fetch + CSRF header 喺共享 client 入面
  const client = readPublic('cart-client.js');
  assert.match(client, /['"]\/api\/cart\/add['"]/);
  assert.match(client, /headers\.set\(['"]csrf-token['"], csrfToken\(\)\)/);
});

test('cart page uses server cart and order APIs with csrf token', () => {
  const view = readView('cart.ejs');

  assert.match(view, /meta name="csrf-token" content="<%= csrfToken \|\| '' %>"/);
  assert.match(view, /data-logged-in="<%= user \? '1' : '0' %>"/);
  assert.match(view, /requestJson\('\/api\/cart'/);
  assert.match(view, /requestJson\('\/api\/orders'/);
  assert.match(view, /syncGuestCartToServer/);
  assert.match(view, /headers\.set\('csrf-token', csrfToken\)/);
});

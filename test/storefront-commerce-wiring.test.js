const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

function readView(fileName) {
  return fs.readFileSync(path.join(__dirname, '..', 'views', fileName), 'utf8');
}

test('product page uses csrf-protected server cart API for logged-in users', () => {
  const view = readView('product.ejs');

  assert.match(view, /meta name="csrf-token" content="<%= csrfToken \|\| '' %>"/);
  assert.match(view, /data-logged-in="<%= user \? '1' : '0' %>"/);
  assert.match(view, /fetch\('\/api\/cart\/add'/);
  assert.match(view, /headers:\s*\{[\s\S]*'csrf-token': csrfToken/);
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

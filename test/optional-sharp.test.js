const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

function getRoutePaths(app) {
  const stack = app && app._router && Array.isArray(app._router.stack) ? app._router.stack : [];
  return stack
    .map((layer) => layer && layer.route && layer.route.path)
    .filter((p) => typeof p === 'string');
}

test('app still loads when sharp is unavailable (serverless-safe import)', () => {
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'sharp') {
      const err = new Error('sharp unavailable');
      err.code = 'MODULE_NOT_FOUND';
      throw err;
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    const appPath = path.join(__dirname, '..', 'app.js');
    delete require.cache[appPath];
    const app = require(appPath);
    assert.equal(typeof app, 'function');
    const paths = getRoutePaths(app);
    assert.ok(paths.includes('/image/:hash'));
  } finally {
    Module._load = originalLoad;
  }
});


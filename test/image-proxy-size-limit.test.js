const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');

const app = require('../api');

function makeFakeReq() {
  const req = new EventEmitter();
  req.setTimeout = () => req;
  req.destroy = () => {
    req.destroyed = true;
  };
  return req;
}

function makeFakeRes({ statusCode = 200, headers = {} } = {}) {
  const res = new EventEmitter();
  res.statusCode = statusCode;
  res.headers = headers;
  res.destroy = () => {
    res.destroyed = true;
  };
  res.resume = () => {
    res.resumed = true;
  };
  return res;
}

test('image proxy rejects when declared content-length exceeds limit', async () => {
  const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
  const fakeGet = (url, opts, cb) => {
    const req = makeFakeReq();
    const res = makeFakeRes({
      statusCode: 200,
      headers: { 'content-length': String(MAX_IMAGE_BYTES + 1) },
    });
    process.nextTick(() => cb(res));
    return req;
  };

  await assert.rejects(
    () => app.__test.fetchRemoteImage('https://example.invalid/img', { get: fakeGet }),
    /Image too large/
  );
});

test('image proxy rejects when streaming body exceeds limit', async () => {
  const fakeGet = (url, opts, cb) => {
    const req = makeFakeReq();
    const res = makeFakeRes({ statusCode: 200, headers: {} });
    process.nextTick(() => {
      cb(res);
      res.emit('data', Buffer.alloc(8 * 1024 * 1024));
      res.emit('data', Buffer.alloc(8 * 1024 * 1024));
    });
    return req;
  };

  await assert.rejects(
    () => app.__test.fetchRemoteImage('https://example.invalid/img', { get: fakeGet }),
    /Image too large/
  );
});


'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { spawnSync } = require('node:child_process');

const root = path.join(__dirname, '..');
const canonical = 'https://www.ohyagroups.com';

function trackedFiles(patterns) {
  const result = spawnSync('git', ['grep', '-Il', '-E', patterns, '--', 'app.js', 'api', 'lib', 'public', 'routes', 'utils', 'views', 'vercel.json'], { cwd: root, encoding: 'utf8' });
  if (result.status !== 0 && result.status !== 1) throw new Error(result.stderr || 'git grep failed');
  return result.stdout.split('\n').filter(Boolean);
}

test('no live SEO source still contains ohyagroups.net', () => {
  const offenders = trackedFiles('ohyagroups\\.net');
  assert.deepEqual(offenders, []);
});

test('canonical helper and EJS standalone fallback use www.com', () => {
  const original = process.env.SEO_CANONICAL_BASE;
  delete process.env.SEO_CANONICAL_BASE;
  try {
    delete require.cache[require.resolve('../utils/seo')];
    assert.equal(require('../utils/seo').CANONICAL_BASE, canonical);
    assert.equal(require('../utils/seo').canonicalFor('/products'), `${canonical}/products`);
  } finally {
    delete require.cache[require.resolve('../utils/seo')];
    if (original === undefined) delete process.env.SEO_CANONICAL_BASE;
    else process.env.SEO_CANONICAL_BASE = original;
  }

  const ejs = require('ejs');
  const html = ejs.render(fs.readFileSync(path.join(root, 'views/partials/seo-meta.ejs'), 'utf8'), {
    title: 'Test', seo: { canonical: '/products', ogImage: '/img/logo.png' },
  });
  assert.match(html, new RegExp(`<link rel="canonical" href="${canonical.replaceAll('.', '\\.')}/products">`));
  assert.match(html, new RegExp(`<meta property="og:url" content="${canonical.replaceAll('.', '\\.')}/products">`));
  assert.match(html, new RegExp(`<meta property="og:image" content="${canonical.replaceAll('.', '\\.')}/img/logo.png">`));
  assert.doesNotMatch(html, /ohyagroups\.net/);
});

test('robots, llms, and route schema literals all target www.com', () => {
  const robots = fs.readFileSync(path.join(root, 'public/robots.txt'), 'utf8');
  const llms = fs.readFileSync(path.join(root, 'public/llms.txt'), 'utf8');
  assert.match(robots, new RegExp(`^Sitemap: ${canonical.replaceAll('.', '\\.')}/sitemap.xml$`, 'm'));
  assert.doesNotMatch(robots, /ohyagroups\.net/);
  assert.ok(llms.includes(`${canonical}/products`));
  assert.doesNotMatch(llms, /ohyagroups\.net/);

  const app = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
  assert.ok(app.includes(`url: '${canonical}'`));
  assert.ok(app.includes(`logo: '${canonical}/img/logo.png'`));
  assert.ok(app.includes(`urlTemplate: '${canonical}/products?q={search_term_string}'`));
  assert.doesNotMatch(app, /ohyagroups\.net/);
});

test('legacy .env.example documents the new SEO canonical origin', () => {
  const example = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  if (/^SEO_CANONICAL_BASE=/m.test(example)) {
    assert.match(example, /^SEO_CANONICAL_BASE=https:\/\/www\.ohyagroups\.com$/m);
  }
});

test('Vercel routes send only migration hosts through the app before static rewrites', () => {
  const config = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const routes = config.routes;
  const migrationRule = routes.find((route) => route.has && route.has[0] && route.has[0].type === 'host');
  assert.ok(migrationRule, 'custom-domain migration route is missing');
  assert.ok(routes.indexOf(migrationRule) < routes.findIndex((route) => route.dest === '/public/$1'));
  assert.equal(migrationRule.src, '/(.*)');
  assert.equal(migrationRule.dest, '/api/index.js');
  assert.equal(migrationRule.status, undefined);
  assert.equal(migrationRule.continue, undefined);
  const json = JSON.stringify(config.routes);
  assert.doesNotMatch(json, /ohya2-0\.vercel\.app|git-master.*vercel\.app/);
  assert.equal(config.redirects, undefined);
});

test('Vercel route regexes are anchored host allowlists and do not match lookalikes', () => {
  const { routes } = JSON.parse(fs.readFileSync(path.join(root, 'vercel.json'), 'utf8'));
  const rule = routes.find((route) => route.has && route.has[0] && route.has[0].type === 'host');
  const hostPattern = new RegExp(rule.has[0].value, 'i');
  for (const host of ['ohyagroups.net', 'www.ohyagroups.net', 'ohyagroups.com']) assert.match(host, hostPattern);
  for (const host of ['www.ohyagroups.com', 'ohya2-0.vercel.app', 'www.ohyagroups.net.evil.example', 'evilohyagroups.net']) assert.doesNotMatch(host, hostPattern);
});

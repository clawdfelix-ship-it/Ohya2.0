const fs = require('node:fs');
const path = require('node:path');
const { Pool } = require('pg');

function decodeHtmlEntities(s) {
  return String(s || '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function stripTags(s) {
  return String(s || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ');
}

function normalizeText(s) {
  return decodeHtmlEntities(s)
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function extractMzakkaDescription(html) {
  const start = html.indexOf('<!--p04');
  const end = html.indexOf('<!--p06');
  const slice = start >= 0 && end > start ? html.slice(start, end) : html;

  const withBreaks = slice.replace(/<br\s*\/?>/gi, '\n');

  const paras = [];
  const re = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  let m;
  while ((m = re.exec(withBreaks))) {
    const raw = m[1] || '';
    const text = normalizeText(stripTags(raw));
    if (!text) continue;
    if (text === '商品説明') continue;
    if (text === '開発秘話') continue;
    paras.push(text);
  }

  const out = normalizeText(paras.join('\n\n'));
  return out;
}

function extractPrimaryItemId(html) {
  const m = String(html || '').match(/item_id=([A-Za-z0-9_-]+)/);
  return m ? String(m[1]) : null;
}

function parseArgs(argv) {
  const args = {
    dir: path.join(
      process.env.HOME || '',
      '.openclaw/workspace-coding-qwen/mzakka-clone/mzakka.com/mzakka.com/products'
    ),
    limit: 0,
    dryRun: true,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dir') args.dir = String(argv[++i] || '').trim();
    else if (a === '--limit') args.limit = Number(argv[++i] || 0);
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--apply') args.dryRun = false;
  }

  return args;
}

async function main() {
  require('dotenv').config();

  const args = parseArgs(process.argv);
  if (!args.dir) throw new Error('--dir is required');

  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const pool = new Pool({ connectionString });

  const files = fs
    .readdirSync(args.dir)
    .filter(f => /^item\d+\.html$/i.test(f))
    .sort((a, b) => a.localeCompare(b));

  const limit = Math.max(0, Number(args.limit) || 0);
  const selected = limit ? files.slice(0, limit) : files;

  let scanned = 0;
  let matched = 0;
  let updated = 0;
  let skipped = 0;

  for (const file of selected) {
    scanned++;
    const abs = path.join(args.dir, file);
    const html = fs.readFileSync(abs, 'utf8');

    const itemId = extractPrimaryItemId(html) || file.replace(/\.html$/i, '');
    const slug = `mzakka-${String(itemId).toLowerCase()}`;
    const extracted = extractMzakkaDescription(html);

    if (!extracted || extracted.length < 20) {
      skipped++;
      continue;
    }

    const r = await pool.query(
      `SELECT id, name_zh_hk, description_zh_hk
       FROM products
       WHERE slug = $1
       LIMIT 1`,
      [slug]
    );
    const row = r.rows[0];
    if (!row) {
      skipped++;
      continue;
    }

    matched++;
    const currentName = row.name_zh_hk != null ? String(row.name_zh_hk) : '';
    const currentDesc = row.description_zh_hk != null ? String(row.description_zh_hk) : '';
    const shouldUpdate = !currentDesc || currentDesc.trim() === '' || currentDesc.trim() === currentName.trim();

    if (!shouldUpdate) {
      skipped++;
      continue;
    }

    if (args.dryRun) {
      updated++;
      continue;
    }

    await pool.query(
      `UPDATE products
       SET description_zh_hk = $2
       WHERE slug = $1`,
      [slug, extracted]
    );
    updated++;
  }

  await pool.end();

  const mode = args.dryRun ? 'dry-run' : 'apply';
  console.log(JSON.stringify({ ok: true, mode, scanned, matched, updated, skipped }, null, 2));
}

if (require.main === module) {
  main().catch(err => {
    console.error(String((err && err.message) || err));
    process.exitCode = 1;
  });
}

module.exports = { extractMzakkaDescription, extractPrimaryItemId };


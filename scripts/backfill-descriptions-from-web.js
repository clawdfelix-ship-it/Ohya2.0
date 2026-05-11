const { Pool } = require('pg');
const { fetchHtml, extractDescriptionFromDetailHtml } = (() => {
  const mod = require('./fetch-mzakka-description');
  return {
    fetchHtml: mod.fetchHtml,
    extractDescriptionFromDetailHtml: mod.extractDescriptionFromDetailHtml,
  };
})();

function parseArgs(argv) {
  const args = { limit: 0, apply: false, concurrency: 4, delayMs: 250, reportEvery: 50 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--limit') args.limit = Number(argv[++i] || 0);
    else if (a === '--apply') args.apply = true;
    else if (a === '--dry-run') args.apply = false;
    else if (a === '--concurrency') args.concurrency = Math.max(1, Number(argv[++i] || 4));
    else if (a === '--delay-ms') args.delayMs = Math.max(0, Number(argv[++i] || 250));
    else if (a === '--report-every') args.reportEvery = Math.max(1, Number(argv[++i] || 50));
  }
  return args;
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function itemIdFromSlug(slug) {
  const s = String(slug || '');
  if (!s.startsWith('mzakka-')) return null;
  const id = s.slice('mzakka-'.length);
  return id ? id.toUpperCase() : null;
}

async function main() {
  require('dotenv').config();

  const args = parseArgs(process.argv);
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const pool = new Pool({ connectionString });

  const limit = Math.max(0, Number(args.limit) || 0);
  const candidates = await pool.query(
    `SELECT id, slug
     FROM products
     WHERE slug LIKE 'mzakka-%'
       AND (
         description_zh_hk IS NULL
         OR btrim(description_zh_hk) = ''
         OR btrim(description_zh_hk) = btrim(name_zh_hk)
       )
     ORDER BY id ASC
     ${limit ? 'LIMIT ' + limit : ''}`
  );

  const jobs = candidates.rows.map(r => ({ id: Number(r.id), slug: String(r.slug) }));

  let processed = 0;
  let extracted = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  let idx = 0;

  async function worker() {
    while (idx < jobs.length) {
      const j = jobs[idx++];
      const itemId = itemIdFromSlug(j.slug);
      if (!itemId) {
        skipped++;
        processed++;
        continue;
      }

      const url = `https://mzakka.com/pc/detail/item.php?item_id=${encodeURIComponent(itemId)}`;
      try {
        const html = await fetchHtml(url);
        const desc = extractDescriptionFromDetailHtml(html);
        processed++;

        if (!desc) {
          skipped++;
        } else {
          extracted++;
          if (args.apply) {
            const r = await pool.query('UPDATE products SET description_zh_hk = $2 WHERE id = $1', [j.id, desc]);
            if (r.rowCount > 0) updated++;
          }
        }
      } catch (_) {
        processed++;
        failed++;
      }

      if (args.delayMs) await sleep(args.delayMs);

      if (args.reportEvery && processed % args.reportEvery === 0) {
        console.log(JSON.stringify({ ok: true, processed, extracted, updated, skipped, failed }, null, 2));
      }
    }
  }

  const concurrency = Math.min(jobs.length || 1, Math.max(1, Number(args.concurrency) || 4));
  const workers = Array.from({ length: concurrency }, () => worker());
  await Promise.all(workers);

  await pool.end();

  console.log(
    JSON.stringify(
      { ok: true, mode: args.apply ? 'apply' : 'dry-run', total: jobs.length, processed, extracted, updated, skipped, failed },
      null,
      2
    )
  );
}

if (require.main === module) {
  main().catch(err => {
    console.error(String((err && err.message) || err));
    process.exitCode = 1;
  });
}


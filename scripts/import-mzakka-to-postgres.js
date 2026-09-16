const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const {
  getRootCategoryName,
  makeCategorySlug,
  toProductUpsertInput,
  toSkuUpsertInput,
} = require('../utils/mzakkaImport');

async function dryRunParse({ file, limit = 1 }) {
  const linesReadLimit = Math.max(1, Number(limit) || 1);
  const input = fs.createReadStream(file);
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let linesRead = 0;
  let sample = null;
  for await (const line of rl) {
    if (!line.trim()) continue;
    sample = JSON.parse(line);
    linesRead++;
    if (linesRead >= linesReadLimit) break;
  }
  rl.close();
  return { linesRead, sample };
}

async function *iterJsonlItems({ file, limit = 0 }) {
  const input = fs.createReadStream(file);
  const rl = readline.createInterface({ input, crlfDelay: Infinity });
  let linesRead = 0;
  try {
    for await (const line of rl) {
      if (!line.trim()) continue;
      yield JSON.parse(line);
      linesRead++;
      if (limit && linesRead >= limit) break;
    }
  } finally {
    rl.close();
  }
}

async function *iterRecords({ records, limit = 0 }) {
  const items = Array.isArray(records) ? records : [];
  let linesRead = 0;
  for (const item of items) {
    if (!item) continue;
    yield item;
    linesRead++;
    if (limit && linesRead >= limit) break;
  }
}

function createOwnedPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is not set');
  }
  const { Pool } = require('pg');
  return new Pool({ connectionString });
}

async function runImport({ items, pool, batchSize = 200 }) {
  const categoryCache = new Map();
  let linesRead = 0;
  let productsUpserted = 0;
  let skusUpserted = 0;
  let categoriesUpserted = 0;

  async function upsertCategory(client, rootName) {
    const cached = categoryCache.get(rootName);
    if (cached) return cached;
    const slug = makeCategorySlug(rootName);
    const r = await client.query(
      `INSERT INTO categories (name, name_zh_hk, slug, status)
       VALUES ($1, $2, $3, 'active')
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         name_zh_hk = EXCLUDED.name_zh_hk,
         status = 'active'
       RETURNING id`,
      [rootName, rootName, slug]
    );
    categoriesUpserted++;
    const id = r.rows[0].id;
    categoryCache.set(rootName, id);
    return id;
  }

  let batch = [];

  async function flushBatch() {
    if (batch.length === 0) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const item of batch) {
        const root = getRootCategoryName(item.category);
        const categoryId = await upsertCategory(client, root);
        const p = toProductUpsertInput(item, categoryId);
        const pr = await client.query(
          `INSERT INTO products
            (name, name_zh_hk, slug, description, description_zh_hk, short_description_zh_hk,
             price, original_price, category_id, image_url, gallery_images, status)
           VALUES
            ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::json,$12)
           ON CONFLICT (slug) DO UPDATE SET
             name = EXCLUDED.name,
             name_zh_hk = EXCLUDED.name_zh_hk,
             description = EXCLUDED.description,
             description_zh_hk = EXCLUDED.description_zh_hk,
             short_description_zh_hk = EXCLUDED.short_description_zh_hk,
             price = EXCLUDED.price,
             original_price = EXCLUDED.original_price,
             category_id = EXCLUDED.category_id,
             image_url = EXCLUDED.image_url,
             gallery_images = EXCLUDED.gallery_images,
             status = 'active',
             updated_at = NOW()
           RETURNING id`,
          [
            p.name,
            p.name_zh_hk,
            p.slug,
            p.description,
            p.description_zh_hk,
            p.short_description_zh_hk,
            p.price,
            p.original_price,
            p.category_id,
            p.image_url,
            JSON.stringify(p.gallery_images || []),
            p.status,
          ]
        );
        productsUpserted++;
        const productId = pr.rows[0].id;

        const s = toSkuUpsertInput(item, productId);
        await client.query(
          `INSERT INTO product_skus (product_id, sku, attributes, stock, is_active)
           VALUES ($1, $2, $3::json, $4, $5)
           ON CONFLICT (sku) DO UPDATE SET
             product_id = EXCLUDED.product_id,
             attributes = EXCLUDED.attributes,
             stock = EXCLUDED.stock,
             is_active = EXCLUDED.is_active,
             updated_at = NOW()
           RETURNING id`,
          [s.product_id, s.sku, JSON.stringify(s.attributes), s.stock, s.is_active]
        );
        skusUpserted++;
      }
      await client.query('COMMIT');
    } catch (e) {
      await client.query('ROLLBACK');
      throw e;
    } finally {
      client.release();
      batch = [];
    }
  }

  for await (const item of items) {
    linesRead++;
    batch.push(item);
    if (batch.length >= batchSize) await flushBatch();
  }

  await flushBatch();
  return { mode: 'import', linesRead, categoriesUpserted, productsUpserted, skusUpserted };
}

async function importMzakka({ file, limit = 0, batchSize = 200, dryRun = false, pool }) {
  if (dryRun) {
    const r = await dryRunParse({ file, limit: limit || 1 });
    return { mode: 'dry-run', linesRead: r.linesRead, sample: r.sample };
  }

  const dbPool = pool || createOwnedPool();
  const ownsPool = !pool;
  try {
    return await runImport({
      items: iterJsonlItems({ file, limit }),
      pool: dbPool,
      batchSize,
    });
  } finally {
    if (ownsPool) await dbPool.end();
  }
}

async function importMzakkaRecords({ records, limit = 0, batchSize = 200, dryRun = false, pool }) {
  if (dryRun) {
    const items = Array.isArray(records) ? records.filter(Boolean) : [];
    return {
      mode: 'dry-run',
      linesRead: Math.min(items.length, Math.max(1, Number(limit) || 1)),
      sample: items[0] || null,
    };
  }

  const dbPool = pool || createOwnedPool();
  const ownsPool = !pool;
  try {
    return await runImport({
      items: iterRecords({ records, limit }),
      pool: dbPool,
      batchSize,
    });
  } finally {
    if (ownsPool) await dbPool.end();
  }
}

function parseArgs(argv) {
  const args = { file: null, limit: 0, batchSize: 200, dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') args.file = argv[++i];
    else if (a === '--limit') args.limit = Number(argv[++i] || 0);
    else if (a === '--batch') args.batchSize = Number(argv[++i] || 200);
    else if (a === '--dry-run') args.dryRun = true;
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv);
  const file = args.file || path.join(__dirname, '..', '..', 'mzakka-clone', 'products-metadata.jsonl');
  const result = await importMzakka({ file, limit: args.limit, batchSize: args.batchSize, dryRun: args.dryRun });
  console.log(JSON.stringify({ ok: true, ...result }, null, 2));
}

if (require.main === module) {
  main().catch(err => {
    console.error(String(err && err.message ? err.message : err));
    process.exitCode = 1;
  });
}

module.exports = { dryRunParse, importMzakka, importMzakkaRecords };

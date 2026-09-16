const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const {
  buildCategoryNodes,
  makeCategorySlug,
  toProductUpsertInput,
  toProductMediaRows,
  toProductSectionRows,
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
  let mediaUpserted = 0;
  let sectionsUpserted = 0;

  async function upsertCategory(client, node, parentId = null) {
    const cacheKey = String(node.source_key || `${parentId || 'root'}:${node.name}`);
    const cached = categoryCache.get(cacheKey);
    if (cached) return cached;
    const slug = makeCategorySlug(node.source_key || node.name);
    const r = await client.query(
      `INSERT INTO categories
        (name, name_zh_hk, slug, parent_id, status, sort_order, source, source_key, source_parent_key)
       VALUES ($1, $2, $3, $4, 'active', $5, $6, $7, $8)
       ON CONFLICT (slug) DO UPDATE SET
         name = EXCLUDED.name,
         name_zh_hk = EXCLUDED.name_zh_hk,
         parent_id = EXCLUDED.parent_id,
         sort_order = EXCLUDED.sort_order,
         source = EXCLUDED.source,
         source_key = EXCLUDED.source_key,
         source_parent_key = EXCLUDED.source_parent_key,
         status = 'active'
       RETURNING id`,
      [
        node.name,
        node.name,
        slug,
        parentId,
        Number(node.depth || 0),
        'mzakka',
        node.source_key || null,
        node.source_parent_key || null,
      ]
    );
    categoriesUpserted++;
    const id = r.rows[0].id;
    categoryCache.set(cacheKey, id);
    return id;
  }

  async function replaceProductMedia(client, item, productId) {
    const mediaRows = toProductMediaRows(item, productId);
    await client.query('DELETE FROM mzakka_product_media WHERE product_id = $1', [productId]);
    for (const row of mediaRows) {
      await client.query(
        `INSERT INTO mzakka_product_media
          (product_id, media_url, media_type, alt_text, sort_order, source_key)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [
          row.product_id,
          row.media_url,
          row.media_type,
          row.alt_text,
          row.sort_order,
          row.source_key,
        ]
      );
      mediaUpserted++;
    }
  }

  async function replaceProductSections(client, item, productId) {
    const sectionRows = toProductSectionRows(item, productId);
    await client.query('DELETE FROM mzakka_product_sections WHERE product_id = $1', [productId]);
    for (const row of sectionRows) {
      await client.query(
        `INSERT INTO mzakka_product_sections
          (product_id, section_type, title, sort_order, content_html, content_text, content_json, source_anchor)
         VALUES ($1, $2, $3, $4, $5, $6, $7::json, $8)`,
        [
          row.product_id,
          row.section_type,
          row.title,
          row.sort_order,
          row.content_html,
          row.content_text,
          row.content_json ? JSON.stringify(row.content_json) : null,
          row.source_anchor,
        ]
      );
      sectionsUpserted++;
    }
  }

  let batch = [];

  async function flushBatch() {
    if (batch.length === 0) return;
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      for (const item of batch) {
        const nodes = buildCategoryNodes(item.category);
        let parentId = null;
        let categoryId = null;
        for (const node of nodes) {
          categoryId = await upsertCategory(client, node, parentId);
          parentId = categoryId;
        }
        const p = toProductUpsertInput(item, categoryId);
        const pr = await client.query(
          `INSERT INTO products
            (name, name_zh_hk, slug, description, description_zh_hk, short_description_zh_hk,
             price, original_price, category_id, image_url, gallery_images, status,
             source, source_key, source_url, sync_status, raw_payload)
           VALUES
            ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11::json,$12,$13,$14,$15,$16,$17::json)
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
             source = EXCLUDED.source,
             source_key = EXCLUDED.source_key,
             source_url = EXCLUDED.source_url,
             sync_status = EXCLUDED.sync_status,
             raw_payload = EXCLUDED.raw_payload,
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
            p.source,
            p.source_key,
            p.source_url,
            p.sync_status,
            JSON.stringify(p.raw_payload || {}),
          ]
        );
        productsUpserted++;
        const productId = pr.rows[0].id;

        await replaceProductMedia(client, item, productId);
        await replaceProductSections(client, item, productId);

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
  return {
    mode: 'import',
    linesRead,
    categoriesUpserted,
    productsUpserted,
    skusUpserted,
    mediaUpserted,
    sectionsUpserted,
  };
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

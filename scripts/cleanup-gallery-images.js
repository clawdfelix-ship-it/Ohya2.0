require('dotenv').config();

const { Pool } = require('pg');

function parseArgs(argv) {
  const args = { dryRun: false, limit: 0, maxImages: 12, sample: 3 };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') args.dryRun = true;
    else if (a === '--limit') args.limit = Math.max(0, Number(argv[++i] || 0));
    else if (a === '--max-images') args.maxImages = Math.max(1, Number(argv[++i] || 12));
    else if (a === '--sample') args.sample = Math.max(0, Number(argv[++i] || 3));
  }
  return args;
}

function extractItemPrefix(imageUrl) {
  if (typeof imageUrl !== 'string') return null;
  const m = imageUrl.match(/^(https?:\/\/i\.mzakka\.com\/item\/[^/]+\/)/i);
  return m ? String(m[1]) : null;
}

function parseGalleryImages(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string' && raw.trim()) {
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed;
    } catch (_) {}
  }
  return [];
}

function cleanupGalleryImages({ imageUrl, galleryImages, maxImages = 12 }) {
  const base = extractItemPrefix(imageUrl);
  if (!imageUrl) return [];
  if (!base) return [String(imageUrl)];

  const candidates = [imageUrl, ...parseGalleryImages(galleryImages)];
  const out = [];
  const seen = new Set();

  for (const v of candidates) {
    const u = v != null ? String(v).trim() : '';
    if (!u) continue;
    if (!u.startsWith(base)) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
    if (out.length >= maxImages) break;
  }

  if (out.length === 0) return [String(imageUrl)];
  if (out[0] !== String(imageUrl)) {
    const next = [String(imageUrl), ...out.filter(x => x !== String(imageUrl))];
    return next.slice(0, maxImages);
  }
  return out;
}

function summarizeChange({ id, before, after }) {
  return {
    id: Number(id),
    beforeCount: before.length,
    afterCount: after.length,
    beforeHead: before.slice(0, 5),
    afterHead: after.slice(0, 5),
  };
}

async function main() {
  const args = parseArgs(process.argv);
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const pool = new Pool({ connectionString });
  try {
    const params = [];
    const limitSql = args.limit ? `LIMIT $1` : '';
    if (args.limit) params.push(args.limit);

    const rowsResult = await pool.query(
      `
SELECT id, image_url, gallery_images
FROM products
WHERE image_url IS NOT NULL
  AND gallery_images IS NOT NULL
ORDER BY id ASC
${limitSql}
      `.trim(),
      params
    );

    let scanned = 0;
    let changed = 0;
    let updated = 0;
    const samples = [];

    for (const r of rowsResult.rows) {
      scanned++;
      const imageUrl = r.image_url != null ? String(r.image_url) : null;
      const before = parseGalleryImages(r.gallery_images)
        .map(v => (v != null ? String(v).trim() : ''))
        .filter(Boolean);
      const after = cleanupGalleryImages({ imageUrl, galleryImages: before, maxImages: args.maxImages });

      const beforeJson = JSON.stringify(before);
      const afterJson = JSON.stringify(after);
      if (beforeJson === afterJson) continue;

      changed++;
      if (args.sample && samples.length < args.sample) {
        samples.push(summarizeChange({ id: r.id, before, after }));
      }

      if (!args.dryRun) {
        const res = await pool.query(
          `UPDATE products
           SET gallery_images = $1::json, updated_at = NOW()
           WHERE id = $2`,
          [afterJson, Number(r.id)]
        );
        updated += res.rowCount || 0;
      }
    }

    console.log(
      JSON.stringify(
        {
          ok: true,
          mode: args.dryRun ? 'dry-run' : 'update',
          scanned,
          changed,
          updated: args.dryRun ? 0 : updated,
          maxImages: args.maxImages,
          samples,
        },
        null,
        2
      )
    );
  } finally {
    await pool.end();
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error(String(err && err.message ? err.message : err));
    process.exitCode = 1;
  });
}

module.exports = { parseArgs, cleanupGalleryImages, extractItemPrefix };


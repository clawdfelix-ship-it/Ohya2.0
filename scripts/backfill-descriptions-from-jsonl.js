const fs = require('node:fs');
const path = require('node:path');
const readline = require('node:readline');
const { Pool } = require('pg');

function normalizeText(s) {
  return String(s || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/[ \t]{2,}/g, ' ')
    .trim();
}

function parseArgs(argv) {
  const args = {
    file: path.join(__dirname, '..', '..', 'mzakka-clone', 'products-metadata.jsonl'),
    limit: 0,
    dryRun: true,
    reportEvery: 2000,
  };

  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--file') args.file = String(argv[++i] || '').trim();
    else if (a === '--limit') args.limit = Number(argv[++i] || 0);
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--apply') args.dryRun = false;
    else if (a === '--report-every') args.reportEvery = Math.max(1, Number(argv[++i] || 2000));
  }

  return args;
}

async function main() {
  require('dotenv').config();

  const args = parseArgs(process.argv);
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  if (!args.file) throw new Error('--file is required');
  if (!fs.existsSync(args.file)) throw new Error(`file not found: ${args.file}`);

  const pool = new Pool({ connectionString });

  const rl = readline.createInterface({
    input: fs.createReadStream(args.file, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  });

  const limit = Math.max(0, Number(args.limit) || 0);

  let scanned = 0;
  let candidates = 0;
  let matched = 0;
  let updated = 0;
  let skipped = 0;
  let alreadyOk = 0;
  let notFound = 0;

  for await (const line of rl) {
    if (!line || !line.trim()) continue;
    let obj;
    try {
      obj = JSON.parse(line);
    } catch (_) {
      continue;
    }

    scanned++;
    const id = obj && obj.id != null ? String(obj.id) : '';
    const descRaw = obj && obj.description != null ? String(obj.description) : '';
    const desc = normalizeText(descRaw);

    if (!id || !desc) {
      skipped++;
      if (limit && scanned >= limit) break;
      continue;
    }

    candidates++;
    const slug = `mzakka-${id.toLowerCase()}`;

    if (args.dryRun) {
      const r = await pool.query('SELECT id, name_zh_hk, description_zh_hk FROM products WHERE slug = $1 LIMIT 1', [slug]);
      const row = r.rows[0];
      if (!row) {
        notFound++;
      } else {
        matched++;
        const cur = row.description_zh_hk == null ? '' : String(row.description_zh_hk).trim();
        const name = row.name_zh_hk == null ? '' : String(row.name_zh_hk).trim();
        if (!cur || cur === name) updated++;
        else alreadyOk++;
      }
    } else {
      const r = await pool.query(
        `UPDATE products
         SET description_zh_hk = $2
         WHERE slug = $1
           AND (
             description_zh_hk IS NULL
             OR btrim(description_zh_hk) = ''
             OR btrim(description_zh_hk) = btrim(name_zh_hk)
           )
         RETURNING id`,
        [slug, desc]
      );

      if (!r.rows.length) {
        const exists = await pool.query('SELECT 1 FROM products WHERE slug = $1 LIMIT 1', [slug]);
        if (!exists.rows.length) notFound++;
        else alreadyOk++;
      } else {
        updated++;
      }
    }

    if (args.reportEvery && scanned % args.reportEvery === 0) {
      console.log(
        JSON.stringify(
          {
            ok: true,
            mode: args.dryRun ? 'dry-run' : 'apply',
            scanned,
            candidates,
            updated,
            skipped,
            alreadyOk,
            notFound,
          },
          null,
          2
        )
      );
    }

    if (limit && scanned >= limit) break;
  }

  rl.close();
  await pool.end();

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode: args.dryRun ? 'dry-run' : 'apply',
        scanned,
        candidates,
        updated,
        matched,
        skipped,
        alreadyOk,
        notFound,
      },
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

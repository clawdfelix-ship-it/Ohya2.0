const https = require('node:https');
const zlib = require('node:zlib');
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

function isBadDescriptionLine(t) {
  const s = String(t || '').trim();
  if (!s) return true;
  if (s.includes('<meta')) return true;
  if (s.includes('content=')) return true;
  if (s.includes('商品のページです')) return true;
  if (s.includes('videoタグ')) return true;
  if (s.includes('ブラウザが必要')) return true;
  if (/特価/.test(s)) return true;
  if (/在庫限定/.test(s)) return true;
  if (/点追加/.test(s)) return true;
  if (/商品追加/.test(s)) return true;
  if (/売れ筋/.test(s)) return true;
  if (/好評につき/.test(s)) return true;
  if (/もうじき終了/.test(s)) return true;
  if (/追加しました/.test(s)) return true;
  if (/\d{1,2}\/\d{1,2}まで/.test(s)) return true;
  if (/\d+\s*月\s*\d+\s*日まで/.test(s)) return true;
  if (/\d+\s*月\s*\d+\s*日.*まで/.test(s)) return true;
  if (/セール/.test(s)) return true;
  if (/タイムセール/.test(s)) return true;
  if (/お待たせ/.test(s)) return true;
  if (/％引/.test(s)) return true;
  if (/最大\s*\d+\s*％/.test(s)) return true;
  if (/通販/.test(s) && /M-ZAKKA/.test(s)) return true;
  if (/[0-9][0-9,]*\s*円/.test(s)) return true;
  if (/税込/.test(s)) return true;
  if (/%\s*off/i.test(s)) return true;
  if (/ポイント/.test(s)) return true;
  if (/出荷/.test(s)) return true;
  if (/カートに入れる/.test(s)) return true;
  return false;
}

function fetchHtml(url) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const req = https.request(
      {
        hostname: u.hostname,
        path: u.pathname + u.search,
        method: 'GET',
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept-Encoding': 'gzip, deflate, br',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ja-JP,ja;q=0.9,en-US;q=0.8,en;q=0.7',
        },
        timeout: 20000,
      },
      res => {
        const encoding = String(res.headers['content-encoding'] || '').toLowerCase();
        let stream = res;
        if (encoding === 'gzip') stream = res.pipe(zlib.createGunzip());
        else if (encoding === 'deflate') stream = res.pipe(zlib.createInflate());
        else if (encoding === 'br') stream = res.pipe(zlib.createBrotliDecompress());

        const chunks = [];
        stream.on('data', c => chunks.push(c));
        stream.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
        stream.on('error', reject);
      }
    );

    req.on('timeout', () => {
      req.destroy(new Error('timeout'));
    });
    req.on('error', reject);
    req.end();
  });
}

function extractDescriptionFromDetailHtml(html) {
  const withBreaks = String(html || '').replace(/<br\s*\/?>/gi, '\n');
  const cutAt = withBreaks.indexOf('【セット内容】');
  const scope = cutAt >= 0 ? withBreaks.slice(0, cutAt) : withBreaks;
  const itemNoIdx = scope.indexOf('商品番号');
  const tableEndIdx = itemNoIdx >= 0 ? scope.indexOf('</table>', itemNoIdx) : -1;
  const afterTableScope = tableEndIdx >= 0 ? scope.slice(tableEndIdx + '</table>'.length) : scope;

  const strongs = [];
  const strongRe = /<strong\b[^>]*>([\s\S]*?)<\/strong>/gi;
  let m;
  while ((m = strongRe.exec(afterTableScope))) {
    const t = normalizeText(stripTags(m[1] || ''));
    if (!t) continue;
    strongs.push(t);
  }

  const pick = [];
  for (const t of strongs) {
    if (t.length < 10) continue;
    if (isBadDescriptionLine(t)) continue;
    pick.push(t);
    if (pick.length >= 2) break;
  }

  const out = normalizeText(pick.join('\n\n'));
  if (out) return out;

  const bRe = /<b\b[^>]*>([\s\S]*?)<\/b>/gi;
  while ((m = bRe.exec(afterTableScope))) {
    const t = normalizeText(stripTags(m[1] || ''));
    if (isBadDescriptionLine(t)) continue;
    if (t.includes('【セット内容】')) break;
    if (t.length < 10) continue;
    pick.push(t);
    if (pick.length >= 2) break;
  }

  const out2 = normalizeText(pick.join('\n\n'));
  if (out2) return out2;

  const infoIdx = scope.indexOf('商品情報');
  if (infoIdx >= 0) {
    const infoSlice = scope.slice(infoIdx, infoIdx + 30000);
    const plainInfo = normalizeText(stripTags(infoSlice));
    const linesInfo = plainInfo
      .split('\n')
      .map(s => s.trim())
      .filter(Boolean)
      .filter(s => s !== '商品情報');

    const paras = [];
    for (const t of linesInfo) {
      if (isBadDescriptionLine(t)) continue;
      if (t.length < 20) continue;
      paras.push(t);
      if (paras.length >= 8) break;
    }
    const outInfo = normalizeText(paras.join('\n\n'));
    if (outInfo) return outInfo;
  }

  const plain = normalizeText(stripTags(afterTableScope));
  const lines = plain
    .split('\n')
    .map(s => s.trim())
    .filter(Boolean);

  const endOfTableIdx = (() => {
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('テレビショッピング')) return i;
      if (lines[i].startsWith('定価')) return i;
    }
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('販売価格')) return i;
    }
    return -1;
  })();

  const candidates = [];
  for (let i = endOfTableIdx >= 0 ? endOfTableIdx + 1 : 0; i < lines.length; i++) {
    const t = lines[i];
    if (!t) continue;
    if (/^(商品名|商品番号|販売価格|ポイント|出荷|定価|テレビショッピング)$/.test(t)) continue;
    if (isBadDescriptionLine(t)) continue;
    if (t.length < 10) continue;
    candidates.push(t);
    if (candidates.length >= 3) break;
  }

  const out3 = normalizeText(candidates.join('\n'));
  if (out3) return out3;

  const pRe = /<p\b[^>]*>([\s\S]*?)<\/p>/gi;
  while ((m = pRe.exec(withBreaks))) {
    const t = normalizeText(stripTags(m[1] || ''));
    if (!t) continue;
    if (t === '商品情報') continue;
    if (t.length < 20) continue;
    return t;
  }

  return '';
}

function parseArgs(argv) {
  const args = { productId: null, itemId: null, apply: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--product-id') args.productId = Number(argv[++i] || 0) || null;
    else if (a === '--item-id') args.itemId = String(argv[++i] || '').trim() || null;
    else if (a === '--apply') args.apply = true;
  }
  return args;
}

async function main() {
  require('dotenv').config();

  const args = parseArgs(process.argv);
  const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!connectionString) throw new Error('DATABASE_URL is not set');

  const pool = new Pool({ connectionString });

  let itemId = args.itemId;
  let product = null;

  if (!itemId) {
    if (!args.productId) throw new Error('Provide --product-id or --item-id');
    const r = await pool.query('SELECT id, slug, name_zh_hk, description_zh_hk FROM products WHERE id = $1', [
      args.productId,
    ]);
    product = r.rows[0] || null;
    if (!product) throw new Error('product not found');
    const slug = String(product.slug || '');
    if (!slug.startsWith('mzakka-')) throw new Error('product slug is not mzakka-*');
    itemId = slug.slice('mzakka-'.length);
  }

  const requestItemId = String(itemId).toUpperCase();
  const url = `https://mzakka.com/pc/detail/item.php?item_id=${encodeURIComponent(requestItemId)}`;
  const html = await fetchHtml(url);
  const desc = extractDescriptionFromDetailHtml(html);

  if (!desc) {
    await pool.end();
    console.log(JSON.stringify({ ok: true, itemId, url, extracted: false }, null, 2));
    return;
  }

  if (args.apply) {
    if (product) {
      await pool.query('UPDATE products SET description_zh_hk = $2 WHERE id = $1', [product.id, desc]);
    } else {
      await pool.query('UPDATE products SET description_zh_hk = $2 WHERE slug = $1', [`mzakka-${String(itemId).toLowerCase()}`, desc]);
    }
  }

  await pool.end();
  console.log(
    JSON.stringify(
      {
        ok: true,
        itemId: String(itemId),
        requestItemId,
        url,
        extracted: true,
        updated: Boolean(args.apply),
        description_len: desc.length,
        description_head: desc.slice(0, 120),
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

module.exports = { fetchHtml, extractDescriptionFromDetailHtml };

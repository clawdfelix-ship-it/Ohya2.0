'use strict';

/**
 * mzakka-taxonomy.js
 *
 * Reverse-engineered REAL product taxonomy of mzakka.com.
 *
 * Background (verified against live HTML, 2026-09-19):
 *  - Category page URL: https://mzakka.com/pc/detail/category.php?category=NNN
 *    (the bare /pc/category.php form 404s).
 *  - A category page mixes FOUR different kinds of category links:
 *      1. The 13 real top-level roots (site menu / breadcrumb / drilldown select).
 *      2. Real direct children, rendered in <ul id="sub"> as
 *           <li><a href="#" onclick="return move_category(ID);">NAME</a></li>
 *      3. FACET / promotion group nodes (ランキング, メーカー別, タイプ・サイズ別,
 *         素材別, シリーズ nodes, セール, 新商品, 年間ランキング, ...).
 *      4. The site-wide mega menu (same ~844 links on every page).
 *  - #sub itself mixes real children and facets, so it cannot be trusted raw.
 *  - mzakka's own multi-line <div id="breadcrumb"> on an ITEM page lists every
 *    chain an item belongs to (real chains AND facet chains). On a CATEGORY page
 *    the breadcrumb is a single chain and is authoritative for parentage.
 *  - 1801's editorial intro block (<p><b>group</b></p> ...) exists in the
 *    downloaded HTML inside an HTML comment and is STALE (7 children), whereas
 *    the live group page category=2810 lists 11 (2814..2824). We therefore only
 *    use that block as a secondary hint, never as the child source of truth.
 *
 * The classification decision (real child vs facet) combines:
 *   A. a blacklist of facet-group id/name patterns (ranking, sale, brand,
 *      attribute 別 groups, promotional pseudo categories),
 *   B. a brand dictionary (global #makert1 option ids + a curated maker/brand
 *      id map), because brand nodes appear as direct #sub children
 *      (e.g. 1826 > オカモト 2494) yet are facets,
 *   C. a curated "series/brand style" name heuristic (～シリーズ, known brand
 *      names), and
 *   D. the node page breadcrumb parent check (a real child's category page
 *      breadcrumb starts from one of the 13 roots and has no facet-group node).
 *
 * Pure parsing functions take HTML string in and return plain data, so they can
 * be unit-tested without network access.
 */

const https = require('node:https');
const fs = require('node:fs');
const path = require('node:path');

const BASE = 'https://mzakka.com/pc/detail';

/** The 13 real top-level categories (id -> official name, from site #menu). */
const ROOTS = [
  { id: 1792, name: 'ローション・クリーナー' },
  { id: 1801, name: 'オナホール・おっぱい' },
  { id: 1808, name: 'ダッチ・抱き枕・ドール' },
  { id: 1811, name: 'バイブ・電マ・ディルド' },
  { id: 1820, name: 'ローター・クリ,乳首責め' },
  { id: 1826, name: 'コンドーム' },
  { id: 1831, name: 'アナル' },
  { id: 1837, name: 'サポートグッズ' },
  { id: 1841, name: 'SM・拘束具' },
  { id: 1851, name: 'ラブサプリ,コスメ,匂い' },
  { id: 1852, name: 'コスチューム' },
  { id: 1861, name: '書籍・雑貨' },
  { id: 1865, name: '業務用' },
];
const ROOT_IDS = new Set(ROOTS.map((r) => r.id));
const ROOT_NAMES = new Map(ROOTS.map((r) => [r.id, r.name]));

/**
 * Special / virtual categories that are not product taxonomy.
 *  - 1789/1790/1791 are the site-menu pseudo tops (新商品 / オリジナル / 実演販売).
 *  - 1957 is the global maker-dictionary parent.
 *  - 1862 is the global sale parent.
 */
const SPECIAL_IDS = new Set([1789, 1790, 1791, 1957, 1862]);

/* ------------------------------------------------------------------ *
 * Facet group ids observed live (kept here, also exported in result).
 * Values are the group-node ids under each root.
 * ------------------------------------------------------------------ */
const FACET_GROUP_IDS = {
  ranking: {
    1792: 2111, 1801: 2108, 1808: 2113, 1811: 2116, 1820: 2124,
    1826: 2126, 1831: 2129, 1837: 2132, 1841: 2134, 1851: 2136,
    1852: 2140,
  },
  makerByRoot: { 1801: 1934, 1852: 2025 },
  onaholeTypeGroup: 2810, // タイプ・サイズ別 — REAL container (kept, children real)
  onaholeFacetGroups: {
    feature: 2811, // 特徴・内部構造別
    material: 2812, // 素材別
    package: 2813, // パッケージタイプ別
  },
  globalMaker: 1957,
  globalSale: 1862,
};

/** Exact/group-name blacklist (substring match, Japanese). */
const FACET_NAME_PATTERNS = [
  'ランキング',
  'メーカー別',
  'メーカー、ブランド別',
  'ブランド別',
  '素材別',
  '特徴・内部構造別',
  'パッケージタイプ別',
  'タイプ別',
  'サイズ別',
  '色・味・香り',
  '価格',
  'セール',
  '新商品',
  '新規取扱',
  '注目商品',
  '実演販売',
  '上半期',
  '下半期',
  '軽減税率',
  'すべてのメーカー',
];

/** Promotional / ranking year nodes, e.g. 2026年上半期. */
const YEAR_NODE_RE = /(^|\s)(19|20)\d{2}\s*年/;

/* ------------------------------------------------------------------ *
 * Low level HTML helpers (regex based; mzakka markup is fixed legacy).
 * ------------------------------------------------------------------ */

function decodeEntities(s) {
  return String(s == null ? '' : s)
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&#0?39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .trim();
}

/**
 * Extract the breadcrumb chain of a CATEGORY page.
 * Returns [{id, name, strong}] from Home to current. Current node has no
 * category link (rendered as <strong>), hence its id must be supplied.
 * For an ITEM page the breadcrumb holds multiple <br>-separated chains; use
 * extractItemBreadcrumbChains() there.
 */
function extractCategoryBreadcrumb(html, currentId) {
  const m = String(html).match(/<div[^>]*id="breadcrumb"[^>]*>([\s\S]*?)<\/div>/i);
  if (!m) return [];
  const block = m[1].split(/<br\s*\/?>/i)[0]; // category pages: only one line
  const chain = [];
  const re =
    /category(?:\.php)?\?category=(\d+)[^>]*>(?:<strong>)?([^<]+?)(?:<\/strong>)?<\/a>/gi;
  let mm;
  while ((mm = re.exec(block))) {
    chain.push({ id: Number(mm[1]), name: decodeEntities(mm[2]) });
  }
  // trailing <strong>NAME</strong> = current node name
  const sm = block.match(/<strong[^>]*>([^<]+)<\/strong>/i);
  if (sm) chain.push({ id: Number(currentId), name: decodeEntities(sm[1]), current: true });
  return chain;
}

/**
 * Extract ALL breadcrumb chains from an ITEM page.
 * The item breadcrumb is multi-line (one chain per <br>), each line listing a
 * root ... leaf path. Returns array of chains; each chain is [{id,name}].
 */
function extractItemBreadcrumbChains(html) {
  const m = String(html).match(/<div[^>]*id="breadcrumb"[^>]*>([\s\S]*?)<\/div>/i);
  if (!m) return [];
  const lines = m[1].split(/<br\s*\/?>/i);
  const chains = [];
  for (const line of lines) {
    const seg = [];
    const re =
      /category(?:\.php)?\?category=(\d+)[^>]*>(?:<strong>)?([^<]+?)(?:<\/strong>)?<\/a>/gi;
    let mm;
    while ((mm = re.exec(line))) {
      seg.push({ id: Number(mm[1]), name: decodeEntities(mm[2]) });
    }
    // also capture trailing <strong>
    const sm = line.match(/<strong[^>]*>([^<]+)<\/strong>/i);
    if (sm) seg.push({ id: null, name: decodeEntities(sm[1]) });
    if (seg.length) chains.push(seg);
  }
  return chains;
}

/** Parse every <ul id="sub"> block into ordered {id,name} lists. */
function extractSubBlocks(html) {
  const blocks = [];
  const blockRe = /<ul[^>]*id="sub"[^>]*>([\s\S]*?)<\/ul>/gi;
  let bm;
  while ((bm = blockRe.exec(String(html)))) {
    const items = [];
    const re = /move_category\((\d+)\)[^>]*>([^<]+)</gi;
    let mm;
    while ((mm = re.exec(bm[1]))) {
      items.push({ id: Number(mm[1]), name: decodeEntities(mm[2]) });
    }
    if (items.length) blocks.push(items);
  }
  return blocks;
}

/** Flat ordered #sub candidates (deduped, first occurrence wins). */
function extractSubCandidates(html) {
  const seen = new Set();
  const out = [];
  for (const block of extractSubBlocks(html)) {
    for (const it of block) {
      if (!seen.has(it.id)) {
        seen.add(it.id);
        out.push(it);
      }
    }
  }
  return out;
}

/** Parse the drilldown <select id="cat4"> options (root-local facets+children). */
function extractCat4Options(html) {
  const m = String(html).match(/<select[^>]*id="cat4"[^>]*>([\s\S]*?)<\/select>/i);
  if (!m) return [];
  const out = [];
  const re = /<option[^>]*value="(\d+)"[^>]*>([^<]+)<\/option>/gi;
  let mm;
  while ((mm = re.exec(m[1]))) {
    out.push({ id: Number(mm[1]), name: decodeEntities(mm[2]) });
  }
  return out;
}

/** Parse the global maker dictionary out of #makert1 select. Returns Set<id>. */
function extractMakerIds(html) {
  const m = String(html).match(/id="makert1"[\s\S]*?<\/select>/i);
  const ids = new Set();
  if (!m) return ids;
  const re = /<option[^>]*value="(\d+)"/gi;
  let mm;
  while ((mm = re.exec(m[0]))) {
    const id = Number(mm[1]);
    if (id !== 1957) ids.add(id);
  }
  return ids;
}

/**
 * 1801 editorial intro block. It is embedded inside an HTML comment and stale;
 * exposed for tests / diagnostics. Returns
 *  { groups: [{name, children:[{id,name}]}] }.
 */
function extractOnaholeIntroGroups(html) {
  const s = String(html);
  // Work even though it sits inside <!-- ... -->: do not strip comments first.
  const start = s.indexOf('タイプ・サイズ別');
  const anchor = s.lastIndexOf('<p><b>', start);
  const region = s.slice(anchor > -1 ? anchor : start, (anchor > -1 ? anchor : start) + 20000);
  const groups = [];
  let current = null;
  const re =
    /<p><b>(?:<a[^>]*category(?:\.php)?\?category=(\d+)"[^>]*>([^<]+)<\/a>|([^<]+))<\/b>(?:[\s\S]*?)<\/p>/g;
  let mm;
  while ((mm = re.exec(region))) {
    if (mm[1]) {
      if (current) current.children.push({ id: Number(mm[1]), name: decodeEntities(mm[2]) });
    } else {
      const name = decodeEntities(mm[3]);
      if (!name || name.includes('売れ筋')) break;
      current = { name, children: [] };
      groups.push(current);
    }
  }
  return { groups };
}

/** Extract product item links on a category page: [{itemId, category}]. */
function extractItemLinks(html) {
  const out = [];
  const re = /item\.php\?item_id=([A-Za-z0-9]+)&amp;category=(\d+)|item\.php\?item_id=([A-Za-z0-9]+)&category=(\d+)/g;
  let mm;
  while ((mm = re.exec(String(html)))) {
    out.push({
      itemId: mm[1] || mm[3],
      category: Number(mm[2] || mm[4]),
    });
  }
  return out;
}

/** Pagination: returns {lastPage, perPage, total} parsed from 件中 / 最後 links. */
function extractPaging(html) {
  const totalMatch = String(html).match(/(\d+)件中/);
  const lastMatch = String(html).match(/category=\d+&p1=(\d+)"[^>]*>最後/);
  return {
    total: totalMatch ? Number(totalMatch[1]) : null,
    // p1 is zero-indexed page offset, so lastPage value +1 = page count
    pages: lastMatch ? Number(lastMatch[1]) + 1 : null,
  };
}

/* ------------------------------------------------------------------ *
 * Real-child classification
 * ------------------------------------------------------------------ */

function nameMatchesFacet(name) {
  const s = String(name || '').trim();
  if (YEAR_NODE_RE.test(s)) return true;
  for (const p of FACET_NAME_PATTERNS) if (s.includes(p)) return true;
  // "...シリーズ" series-style labels used as catalogue nodes in SM/アナル.
  // NOTE: not all シリーズ words are facets — 名器シリーズ(2348) is a real
  // onahole type. Handle via curated real/facet maps in classifyChild.
  return false;
}

/**
 * Curated facet/brand node ids discovered by live inspection.
 *  - attribute facet groups + their leaves for 1801
 *  - ranking group ids (per root)
 *  - brand/series-style catalogue nodes that mzakka exposes as #sub children
 *
 * Brand ids in #makert1 are handled dynamically; this map covers the
 * root-specific brand/series nodes NOT present in the global maker dictionary
 * (verified individually: these pages are a single maker/series collection).
 */
const CURATED_FACET_IDS = new Set([
  // 1801 facet groups & leaves
  2811, 2825, 2826, 2827, 2829, 2830, 2831, 2832, 2833, 2835, 2838, 2840, 2841, // 特徴・内部構造別
  2812, 2843, 2845, 2847, // 素材別
  2813, 2851, 2852, 2853, 2856, // パッケージタイプ別
  1934, // メーカー別 (1801)
  2025, // メーカー、ブランド別 (1852)
  // promo / virtual
  2108, 2111, 2113, 2116, 2124, 2126, 2129, 2132, 2134, 2136, 2140, // ranking groups
  2736, // 軽減税率適用商品 (tax filter)
  // condom brands (also appear as #sub children of 1826)
  2494, 2495, 2496, 2497,
  // onahole brand / maker-style nodes
  1807, // TENGA
  2350, // ペペ (lotion brand node)
  1817, // LELO (vibe brand node)
  2410, // 海外ブランド (rotor brand aggregate)
  // SM series/brand catalogue nodes
  2094, 2042, 2043, 2041, 2044, 2161, 2159, 2625,
  // アナル brand/series catalogue nodes
  2765, 2342, // PRO-Eシリーズ / メテオール
  // バイブ brand series node
  1812, // オルガスター (Precious product line)
  // ローター brand series node
  2352, // 飛っ子 (KISS-ME-LOVE line)
  // コスチューム brand node
  2480, // むにむに製作所
  // L3 brand/series lines (verified by item breadcrumb -> single maker)
  2323, // LOVE BODY (A-ONE doll line, under ダッチ)
  2620, // エンジェリックドール (Tamatoys line)
  2320, // 空気少女★宇佐羽えあシリーズ (Tokyo Libido)
  // (2368 ダッチ用オナホール kept: it is a real accessory type, not a brand)
  1901, // フェアリー (Precious デンマ brand line)
  2173, // シルフィー (Tokyo Design デンマ brand line)
  2383, // アラブシリーズ (KISS-ME-LOVE dildo line)
  2325, // DANDY CLUB (A-ONE men's lingerie line)
  2411, // 激安ローター (budget promo sub-list under エッグ)
]);

/**
 * Nodes explicitly confirmed REAL even though their name smells facet-y
 * (～シリーズ that are genuinely product types, etc.).
 */
const CURATED_REAL_IDS = new Set([
  2348, // 名器シリーズ (real onahole type)
  2810, // タイプ・サイズ別 group (real container for 1801)
]);

/**
 * Decide whether a #sub candidate of `rootId` is a REAL child.
 *
 * @param {{id:number,name:string}} cand
 * @param {object} ctx
 * @param {Set<number>} [ctx.makerIds] global maker dictionary ids
 * @param {number} rootId
 * @returns {{real:boolean, reason:string}}
 */
function classifyChild(cand, rootId, ctx = {}) {
  const makerIds = ctx.makerIds || new Set();
  if (CURATED_REAL_IDS.has(cand.id)) return { real: true, reason: 'curated-real' };
  if (ROOT_IDS.has(cand.id) || SPECIAL_IDS.has(cand.id))
    return { real: false, reason: 'root-or-special' };
  if (CURATED_FACET_IDS.has(cand.id)) return { real: false, reason: 'curated-facet' };
  if (makerIds.has(cand.id)) return { real: false, reason: 'maker-dict' };
  if (nameMatchesFacet(cand.name)) return { real: false, reason: 'facet-name' };
  return { real: true, reason: 'default-real' };
}

/**
 * Extract REAL direct children of a root category from its page HTML.
 *
 * @returns {{children:Array<{id,name}>, dropped:Array<{id,name,reason}>}}
 */
function extractRootChildren(html, rootId, ctx = {}) {
  const candidates = extractSubCandidates(html);
  const children = [];
  const dropped = [];
  for (const cand of candidates) {
    const verdict = classifyChild(cand, rootId, ctx);
    if (verdict.real) children.push(cand);
    else dropped.push({ ...cand, reason: verdict.reason });
  }
  return { children, dropped, candidates };
}

/* ------------------------------------------------------------------ *
 * Downloader (polite: global fetch, sequential, >=800ms delay)
 * ------------------------------------------------------------------ */

const DEFAULT_UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * Create a cached, polite fetcher.
 * @param {object} opts
 * @param {string} opts.cacheDir  directory to cache raw HTML (keyed by type+id)
 * @param {boolean} opts.refresh  ignore cache and re-download
 * @param {number} opts.delayMs   delay between HTTP requests
 */
function createFetcher({ cacheDir, refresh = false, delayMs = 850 } = {}) {
  if (cacheDir) fs.mkdirSync(cacheDir, { recursive: true });
  let last = 0;

  async function get(url, key) {
    const file = cacheDir && key ? path.join(cacheDir, `${key}.html`) : null;
    if (file && !refresh && fs.existsSync(file)) {
      return fs.readFileSync(file, 'utf8');
    }
    const wait = delayMs - (Date.now() - last);
    if (wait > 0) await sleep(wait);
    last = Date.now();
    const res = await fetch(url, {
      headers: {
        'User-Agent': DEFAULT_UA,
        Accept:
          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'ja-JP,ja;q=0.9,en;q=0.8',
      },
      redirect: 'follow',
    });
    if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
    const body = await res.text();
    if (file) fs.writeFileSync(file, body);
    return body;
  }

  return {
    categoryPage(id, p1 = 0) {
      const url = `${BASE}/category.php?category=${id}${p1 ? `&p1=${p1}` : ''}`;
      return get(url, p1 ? `cat-${id}-p${p1}` : `cat-${id}`);
    },
    itemPage(itemId) {
      return get(`${BASE}/item.php?item_id=${itemId}`, `item-${itemId}`);
    },
    raw(url, key) {
      return get(url, key);
    },
  };
}

/**
 * Build lookup structures from the taxonomy JSON produced by
 * build-mzakka-taxonomy.js:
 *  - byId: Map<id, {id,name,depth,parentId,rootId,isLeaf}>
 *  - realIds: Set of every real node id
 */
function indexTaxonomy(data) {
  const byId = new Map();
  const realIds = new Set();
  function add(node, depth, parentId, rootId) {
    const isLeaf = !node.children || node.children.length === 0;
    byId.set(node.id, { id: node.id, name: node.name, depth, parentId, rootId, isLeaf });
    realIds.add(node.id);
    (node.children || []).forEach((c) => add(c, depth + 1, node.id, rootId));
  }
  data.roots.forEach((r) => add(r, 1, null, r.id));
  return { byId, realIds };
}

/**
 * Resolve a single canonical real LEAF for an item from its page HTML.
 *
 * Rule (validated on live item breadcrumbs): keep only breadcrumb chains whose
 * every node is a real taxonomy id, then pick the deepest; ties (same depth)
 * are broken by preferring the chain whose root/L2 comes first in taxonomy
 * order and, for 1801, the タイプ・サイズ別 chain. Returns
 *  { leaf:{id,name}, path:[...], alternates:[...] } or { leaf:null, reason }.
 */
function resolveCanonicalLeaf(itemHtml, index) {
  const chains = extractItemBreadcrumbChains(itemHtml);
  let realChains = [];
  for (const chain of chains) {
    const ids = chain.map((s) => s.id).filter((x) => x != null);
    if (!ids.length) continue;
    if (!ids.every((id) => index.realIds.has(id))) continue;
    // chain must start at a root
    if (!ROOT_IDS.has(ids[0])) continue;
    realChains.push({ ids, order: realChains.length });
  }
  if (!realChains.length) return { leaf: null, reason: 'no-real-chain' };

  // 業務用(1865) is a cross-cutting B2B supplier root: a condom/lotion/rotor
  // also sold in bulk keeps its product-type root. Only use 1865 when it is
  // the sole root available.
  const roots = [...new Set(realChains.map((c) => c.ids[0]))];
  if (roots.length > 1 && roots.includes(1865)) {
    realChains = realChains.filter((c) => c.ids[0] !== 1865);
  }

  // Primary root = the FIRST real chain's root in breadcrumb order. Live
  // inspection shows mzakka emits the primary product-type chain first
  // (promo/facet chains stripped), with accessory/secondary catalogue lines
  // (wig, business-supply, generic その他) appended later.
  const bestRoot = realChains[0].ids[0];
  let inRoot = realChains.filter((c) => c.ids[0] === bestRoot);

  // Deepest chain wins (most specific leaf); onahole prefers the タイプ・サイズ
  //別(2810) chain over the legacy parallel type ids; final tie = first shown.
  const score = (ids) => ids.length * 1000 + (ids.includes(2810) ? 50 : 0);
  inRoot.sort((a, b) => score(b.ids) - score(a.ids) || a.order - b.order);
  const best = inRoot[0].ids;
  // walk to the deepest real node that is a leaf; if best tail is itself a
  // non-leaf group (rare), the item listing category leaf is still the tail.
  const leafId = best[best.length - 1];
  const leafInfo = index.byId.get(leafId);
  return {
    leaf: leafInfo ? { id: leafInfo.id, name: leafInfo.name } : null,
    path: best.map((id) => ({ id, name: (index.byId.get(id) || {}).name })),
    rootId: bestRoot,
    alternates: realChains.filter((c) => c.order !== inRoot[0].order).map((c) => c.ids[c.ids.length - 1]),
  };
}

/** Node 18+ global fetch sanity (kept for older runtimes). */
if (typeof fetch === 'undefined' && typeof globalThis.fetch === 'function') {
  globalThis.fetch = globalThis.fetch;
}

module.exports = {
  BASE,
  ROOTS,
  ROOT_IDS,
  ROOT_NAMES,
  SPECIAL_IDS,
  FACET_GROUP_IDS,
  FACET_NAME_PATTERNS,
  CURATED_FACET_IDS,
  CURATED_REAL_IDS,
  decodeEntities,
  extractCategoryBreadcrumb,
  extractItemBreadcrumbChains,
  extractSubBlocks,
  extractSubCandidates,
  extractCat4Options,
  extractMakerIds,
  extractOnaholeIntroGroups,
  extractItemLinks,
  extractPaging,
  nameMatchesFacet,
  classifyChild,
  extractRootChildren,
  indexTaxonomy,
  resolveCanonicalLeaf,
  createFetcher,
};

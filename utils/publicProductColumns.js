// 公開產品 API 欄位白名單
//
// 背景（2026-11-16 P0）：`/api/products`、`/api/products/:slug`、`/api/products/featured`
// 全部用 `SELECT p.*`，將成個 products row 原樣輸出，包括 HKD 成本 `cost_price`、
// `member_price`、Mzakka 上游完整 `raw_payload`（含 priceYen／供應商商品番號／直連 URL）。
// 呢三條係**無身份驗證嘅公開 endpoint**，任何人可以逐頁拉走全目錄成本資料。
//
// 做法同 SKU 層一致（routes/products-full.js 的 publicSkuCols）：公開層一律用白名單，
// 唔再用 `p.*`。新增欄位要公開，必須喺度明確加入。
//
// 原則：
//  - 永遠唔公開：cost_price、cost_price_jpy、wholesale_price_hkd（成本／批發）
//  - 永遠唔公開：member_price（會員價，未登入唔應該見到）
//  - 永遠唔公開：raw_payload（上游供應商原始 JSON）
//  - 永遠唔公開：digital_file_url（付費數碼內容下載位）
//  - 永遠唔公開：內部同步／發佈控制欄位

const PUBLIC_PRODUCT_COLUMNS = Object.freeze([
  'id',
  'name',
  'name_zh_hk',
  'slug',
  'description',
  'description_zh_hk',
  'short_description',
  'short_description_zh_hk',
  'price',
  'original_price',
  'image_url',
  'gallery_images',
  'video_url',
  'category_id',
  'brand_id',
  'product_type',
  'is_featured',
  'is_digital',
  'enable_reviews',
  'average_rating',
  'review_count',
  'status',
  'source',
  'meta_title',
  'meta_description',
  'publish_at',
  'created_at',
  'updated_at',
]);

// 注意：products 表**冇 stock 欄位**，庫存喺 product_skus（見 app.js SSR 用
// LEFT JOIN (SELECT product_id, SUM(stock) ... ) s）。將 p.stock 放入 SELECT
// 會即時觸發 PostgreSQL "column p.stock does not exist" 並令 API 回 500。
// 2026-11-16 已用 information_schema 核對真實欄位。
// `p.id, p.name, ...` 形式，配合 LEFT JOIN brands/categories 使用。
const PUBLIC_PRODUCT_SELECT = PUBLIC_PRODUCT_COLUMNS.map((c) => `p.${c}`).join(', ');

// 敏感欄位黑名單：只用作測試斷言，確保白名單唔會意外包含佢哋。
const SENSITIVE_PRODUCT_COLUMNS = Object.freeze([
  'cost_price',
  'cost_price_jpy',
  'wholesale_price_hkd',
  'member_price',
  'raw_payload',
  'digital_file_url',
  'sync_status',
  'deleted_at',
  'unpublish_at',
  'meta_keywords',
  'source_key',
  'source_url',
  'has_batch_expiry',
]);

module.exports = {
  PUBLIC_PRODUCT_COLUMNS,
  PUBLIC_PRODUCT_SELECT,
  SENSITIVE_PRODUCT_COLUMNS,
};

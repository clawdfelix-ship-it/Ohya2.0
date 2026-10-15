# 團體服／球衣訂製子系統（Phase 1）Implementation Plan

> **For agentic workers:** Follow this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在現有 `Node.js + Express + EJS + Postgres` repo 內落地一個可獨立上線的 `團體服／球衣訂製子系統`，支援 `足球、籃球、排球、背心、Polo` 五個品類，提供 `模板開始 / 空白款開始`、`2D + 2.5D 即時預覽`、`全隊名單`、`直接下單 + 報價` 雙軌流程，以及最小可用後台。

**Architecture:** 以 `Express` 提供頁面 shell 與 JSON API，前台訂製器採用 `EJS shell + 模組化前端 JS + Canvas compositor`。模板、zone、素材、session、名單、報價與價格規則存入 Postgres。前端以受規則控制的 `半自由編輯器` 讀取模板 metadata 即時合成前後幅效果圖；後端負責素材上傳、session 持久化、價格判斷、報價單與訂單草稿落庫。第一版避免引入第二套大型 frontend toolchain，保留日後把前端遷移至 React/Vite 的資料契約與 API 邊界。

**Tech Stack:** Node.js（CommonJS）+ Express + EJS + Postgres + multer + 原生 Canvas 合成策略（瀏覽器端）+ node:test

---

## File Map（預計新增／修改）

**Create（DB / data layer）**
- `db/migrations/20261015_customizer_phase1.sql`
- `models/customizer/catalog.js`
- `models/customizer/sessions.js`
- `models/customizer/pricing.js`
- `models/customizer/quotes.js`
- `models/customizer/uploads.js`
- `utils/customizer/validation.js`
- `utils/customizer/snapshot.js`

**Create（routes / pages / API）**
- `routes/customizerPages.js`
- `routes/customizerApi.js`
- `routes/adminCustomizerPages.js`

**Create（views）**
- `views/customizer/index.ejs`
- `views/customizer/editor.ejs`
- `views/customizer/quote-success.ejs`
- `views/admin/customizer-templates.ejs`
- `views/admin/customizer-pricing.ejs`
- `views/admin/customizer-quotes.ejs`

**Create（public JS / CSS）**
- `public/css/customizer.css`
- `public/js/customizer/app.js`
- `public/js/customizer/state.js`
- `public/js/customizer/api.js`
- `public/js/customizer/catalog.js`
- `public/js/customizer/editor.js`
- `public/js/customizer/compositor.js`
- `public/js/customizer/panels-colors.js`
- `public/js/customizer/panels-text.js`
- `public/js/customizer/panels-logo.js`
- `public/js/customizer/panels-roster.js`
- `public/js/customizer/pricing.js`
- `public/js/customizer/uploads.js`
- `public/js/admin/customizer-templates.js`
- `public/js/admin/customizer-pricing.js`
- `public/js/admin/customizer-quotes.js`

**Create（tests）**
- `test/customizer-models.test.js`
- `test/customizer-pages.test.js`
- `test/customizer-pricing.test.js`
- `test/customizer-api.test.js`

**Modify（app wiring / shared infra）**
- `app.js`（mount page/API/admin routes，static/upload path，若需要加 body/upload limits）
- `views/partials/head.ejs`（customizer page 專用 CSS/JS hook，如需要）
- `views/admin/layout.ejs`（加入 customizer admin nav）

---

## Delivery Strategy

### 實作原則

- 先把 `資料模型 + API 契約 + 前端狀態` 建穩，再做效果圖與 admin。
- 先支援 `足球、籃球` 的完整模板族驗證流程，然後補齊 `排球、背心、Polo` 模板資料與規則。
- 任何價格無法完整計算的情況，一律可提交，並自動轉 `報價單`，避免卡死前台流程。
- 任何效果圖快照失敗的情況，仍保存設計 JSON，供後台重產。

### 完成定義

- 使用者可從 `/customizer` 進入訂製器。
- 可選品類、模板開始、空白款開始。
- 可完成基本區域配色、圖案、文字、logo 上傳與前後幅預覽。
- 可輸入全隊名單。
- 系統可判斷 `可直接下單` 或 `需報價`。
- 後台可查看模板、價格規則與報價請求。

---

### Task 1: 建立資料表、model 與純函式測試骨架

**Files:**
- Create: `db/migrations/20261015_customizer_phase1.sql`
- Create: `models/customizer/catalog.js`
- Create: `models/customizer/sessions.js`
- Create: `models/customizer/pricing.js`
- Create: `models/customizer/quotes.js`
- Create: `utils/customizer/validation.js`
- Create: `test/customizer-models.test.js`
- Create: `test/customizer-pricing.test.js`

- [ ] **Step 1: 先寫純函式 / model 層 failing tests**

最低限度覆蓋：
- `normalizeTemplateZone()` 會補齊 zone 預設欄位
- `validateRosterItems()` 會檢查姓名 / 號碼 / 尺碼
- `calculatePriceBreakdown()` 可輸出基本價、階梯價、附加費
- `decideFulfillmentPath()` 可回傳 `direct_order` 或 `quote_required`

- [ ] **Step 2: 建 migration**

建立以下資料表：
- `customizer_product_types`
- `customizer_templates`
- `customizer_template_zones`
- `customizer_design_assets`
- `customizer_sessions`
- `customizer_designs`
- `customizer_rosters`
- `customizer_roster_items`
- `customizer_pricing_rules`
- `customizer_quote_requests`
- `customizer_quote_request_assets`
- `customizer_order_drafts`

最低欄位原則：
- 模板與 zone 要有 `status`
- session / quote / order draft 要有 `status`
- 設計 JSON 與快照路徑要分開保存
- `created_at / updated_at` 一律存在

- [ ] **Step 3: 實作最小 model helpers**

需要有：
- catalog：讀品類、模板、zone、素材
- sessions：create / get / saveDesign / saveRoster
- pricing：讀規則、計價、判斷 direct vs quote
- quotes：建立報價請求、附帶上傳素材 metadata

- [ ] **Step 4: 跑 tests 轉 GREEN**

Run:
```bash
npm test
```

---

### Task 2: 建立 public page routes 與 EJS shell

**Files:**
- Create: `routes/customizerPages.js`
- Create: `views/customizer/index.ejs`
- Create: `views/customizer/editor.ejs`
- Create: `views/customizer/quote-success.ejs`
- Modify: `app.js`
- Create: `test/customizer-pages.test.js`

- [ ] **Step 1: 寫 page routing tests**

至少覆蓋：
- `GET /customizer` 回 200
- `GET /customizer/editor` 回 200
- `GET /customizer/editor` 要包含 root marker，例如 `id="customizer-app"`
- `GET /customizer/quote-success` 回 200

- [ ] **Step 2: 建 page router**

頁面規格：
- `/customizer`
  - 顯示品類入口、模板開始、空白款開始 CTA
- `/customizer/editor`
  - 僅 render shell、root 容器、必要 bootstrap JSON
- `/customizer/quote-success`
  - 顯示提交成功與返回入口

- [ ] **Step 3: 在 `app.js` mount routes**

建議路徑：
```js
app.use('/customizer', require('./routes/customizerPages'));
```

- [ ] **Step 4: 加入最小 customizer CSS 與 script hooks**

要求：
- 不污染現有 storefront 頁面
- editor shell 需要左側設定區、中間預覽區、右側摘要區骨架

- [ ] **Step 5: 跑 tests**

Run:
```bash
npm test
```

---

### Task 3: 建 catalog / session / pricing API 契約

**Files:**
- Create: `routes/customizerApi.js`
- Create: `public/js/customizer/api.js`
- Create: `test/customizer-api.test.js`
- Modify: `app.js`

- [ ] **Step 1: 先寫 API tests**

最少覆蓋以下 endpoint：
- `GET /api/customizer/catalog`
- `GET /api/customizer/templates/:id`
- `POST /api/customizer/sessions`
- `PUT /api/customizer/sessions/:id/design`
- `PUT /api/customizer/sessions/:id/roster`
- `POST /api/customizer/pricing/preview`
- `POST /api/customizer/submit`

- [ ] **Step 2: 實作 catalog endpoints**

回傳格式要清楚分層：
- product types
- templates
- zones
- design assets
- default color palettes

- [ ] **Step 3: 實作 session endpoints**

需求：
- 建立匿名 session
- 保存設計 JSON
- 保存 roster
- 讀回 bootstrap payload

- [ ] **Step 4: 實作 pricing preview / submit**

規則：
- 預覽價格回傳 breakdown
- 若規則不足或命中條件，`submit` 自動建立 quote request
- 若可自動處理，`submit` 建立 order draft

- [ ] **Step 5: 前端 API wrapper**

`public/js/customizer/api.js` 提供：
- `fetchCatalog()`
- `fetchTemplate(id)`
- `createSession(payload)`
- `saveDesign(sessionId, payload)`
- `saveRoster(sessionId, payload)`
- `previewPrice(payload)`
- `submitCustomization(payload)`

- [ ] **Step 6: 跑 tests**

Run:
```bash
npm test
```

---

### Task 4: 建前端 state 與 editor shell

**Files:**
- Create: `public/js/customizer/app.js`
- Create: `public/js/customizer/state.js`
- Create: `public/js/customizer/catalog.js`
- Create: `public/js/customizer/editor.js`
- Create: `public/css/customizer.css`
- Modify: `views/customizer/editor.ejs`

- [ ] **Step 1: 建 state container**

最少 state slice：
- `catalog`
- `selectedProductType`
- `selectedTemplate`
- `zones`
- `design`
- `roster`
- `pricing`
- `submission`

- [ ] **Step 2: 建 editor shell 初始化流程**

流程：
1. 讀 query / bootstrap
2. 拉 catalog
3. 建 session
4. 套用 template defaults
5. render 左中右三欄

- [ ] **Step 3: 建基本 UI 區塊**

包括：
- 品類切換
- 模板列表
- 前後幅切換
- 摘要卡
- 提交按鈕區

- [ ] **Step 4: 確保狀態改變不會刷新頁面**

要求：
- 所有編輯行為在 client-side 完成
- autosave 可先做 debounce，失敗時只提示，不重置本地狀態

---

### Task 5: 實作 Canvas compositor 與 2D / 2.5D 預覽

**Files:**
- Create: `public/js/customizer/compositor.js`
- Modify: `public/js/customizer/editor.js`
- Modify: `public/css/customizer.css`

- [ ] **Step 1: 定義 template asset contract**

每個模板至少支援：
- `frontBase`
- `backBase`
- `frontShadow`
- `backShadow`
- `zoneMasks`
- `logoSlots`
- `textSlots`

- [ ] **Step 2: 實作 compositing pipeline**

順序固定：
1. base image
2. zone fills
3. pattern overlays
4. logo images
5. text rendering
6. shadow / highlight overlay

- [ ] **Step 3: 支援前後幅切換**

要求：
- 切換不重建整個 editor
- 保持相同設計 state

- [ ] **Step 4: 建錯誤降級**

若某個 layer 資產載入失敗：
- 顯示 warning
- 保持其餘 layer 正常 render
- 仍可儲存設計 JSON

---

### Task 6: 實作面板能力：顏色、文字、logo、名單

**Files:**
- Create: `public/js/customizer/panels-colors.js`
- Create: `public/js/customizer/panels-text.js`
- Create: `public/js/customizer/panels-logo.js`
- Create: `public/js/customizer/panels-roster.js`
- Create: `public/js/customizer/uploads.js`
- Create: `models/customizer/uploads.js`
- Modify: `routes/customizerApi.js`

- [ ] **Step 1: 顏色 / 圖案面板**

需求：
- zone 可選顏色
- zone 可選 pattern
- 非允許 zone 不顯示控制項

- [ ] **Step 2: 文字面板**

需求：
- 隊名
- 球員名
- 號碼
- 字色
- 基本字型選擇

- [ ] **Step 3: logo 面板 + 上傳**

需求：
- 官方素材可選
- 客戶上傳 PNG / JPG / SVG（如系統可支援）
- 後端記錄解像度與 mime type
- 不合格素材要回傳具體錯誤

- [ ] **Step 4: roster 面板**

需求：
- 可新增 / 刪除球員列
- 每列有姓名、號碼、尺碼
- 可計算總數量與尺碼分佈

- [ ] **Step 5: autosave 接上 session API**

規則：
- 編輯設計時 debounce save design
- 編輯 roster 時 debounce save roster

---

### Task 7: 實作價格預覽與提交決策

**Files:**
- Create: `public/js/customizer/pricing.js`
- Modify: `models/customizer/pricing.js`
- Modify: `routes/customizerApi.js`
- Modify: `public/js/customizer/editor.js`
- Modify: `test/customizer-pricing.test.js`

- [ ] **Step 1: 價格 breakdown 輸出格式固定化**

至少包括：
- 基本價
- 數量階梯調整
- 印名費
- 印號費
- logo 附加費
- 其他附加費
- 小計
- `fulfillmentPath`

- [ ] **Step 2: 前端價格預覽**

觸發條件：
- 模板改變
- 數量改變
- roster 改變
- logo / 文字設定影響附加費時

- [ ] **Step 3: 提交決策**

邏輯：
- 若所有規則齊備且符合 direct 條件，建立 `order draft`
- 其餘情況建立 `quote request`

- [ ] **Step 4: 覆蓋邊界情況**

最少測試：
- 大數量自動轉報價
- 缺價格規則自動轉報價
- 特殊模板自動轉報價
- 標準單可直接產生 order draft

---

### Task 8: 實作最小後台頁面

**Files:**
- Create: `routes/adminCustomizerPages.js`
- Create: `views/admin/customizer-templates.ejs`
- Create: `views/admin/customizer-pricing.ejs`
- Create: `views/admin/customizer-quotes.ejs`
- Create: `public/js/admin/customizer-templates.js`
- Create: `public/js/admin/customizer-pricing.js`
- Create: `public/js/admin/customizer-quotes.js`
- Modify: `views/admin/layout.ejs`
- Modify: `app.js`

- [ ] **Step 1: 建 admin nav entry**

新增入口：
- 模板
- 價格規則
- 報價單

- [ ] **Step 2: 模板管理頁**

第一版只需：
- list templates
- 啟用 / 停用
- 查看 zone 摘要

- [ ] **Step 3: 價格規則頁**

第一版只需：
- list rules
- 新增 / 編輯基本價與階梯
- 設定 direct / quote 條件

- [ ] **Step 4: 報價單頁**

第一版只需：
- list quote requests
- 查看快照
- 查看 roster
- 更新報價狀態與人工價格

---

### Task 9: 補齊五個品類的最小模板資料與種子內容

**Files:**
- Modify: `db/migrations/20261015_customizer_phase1.sql` 或新增 seed script
- Create if needed: `scripts/seed-customizer-phase1.js`
- Modify: `models/customizer/catalog.js`

- [ ] **Step 1: 先落最少可演示模板**

建議最少：
- 足球：2 款
- 籃球：2 款
- 排球：1 款
- 背心：1 款
- Polo：1 款

- [ ] **Step 2: 每款模板有完整資產契約**

必須有：
- front/back base
- shadow
- 至少 3 個可編輯 zones
- 至少 1 個 logo slot
- 至少 1 個 text slot

- [ ] **Step 3: 建空白款模板**

每個品類至少 1 個 `blank` 模板，供空白款開始流程使用。

---

### Task 10: 驗收、回歸與文件補充

**Files:**
- Modify: `test/customizer-*.test.js`
- Modify: `docs/superpowers/specs/2026-10-15-custom-teamwear-customizer-design.md`（如需補充已確認細節）
- Create if needed: `docs/superpowers/plans/implementation-notes-customizer.md`

- [ ] **Step 1: 跑全量測試**

Run:
```bash
npm test
```

- [ ] **Step 2: 手動驗收**

至少覆蓋：
- `/customizer`
- `/customizer/editor`
- 模板開始流程
- 空白款開始流程
- 足球 / 籃球完整提交一次
- 一張 direct order
- 一張 quote request
- admin 查看 quote

- [ ] **Step 3: 檢查錯誤降級**

覆蓋：
- 模板資產缺漏
- logo 上傳失敗
- pricing rule 缺失
- snapshot 失敗

- [ ] **Step 4: 補充 implementation notes**

記錄：
- 已知限制
- 待 Phase 2 接商城的整合點
- 待 Phase 3 升 3D 的 API 邊界

---

## Key Decisions Locked

- 第一版不做真 3D，改用 `Canvas + overlay` 做 2.5D。
- 第一版不引入第二套前端 build system，改用 `EJS shell + public/js/customizer/*`。
- `價格無法完整計算` 不是錯誤，而是 `轉報價`。
- `設計 JSON` 永遠是主資料，快照只是輔助。
- `模板`、`設計`、`roster`、`pricing`、`quote/order` 必須分層，不可混成單一 blob。

## Out Of Scope For This Plan

- 真 3D 模型與自由旋轉
- 設計器多圖層自由拖放
- AI 圖案生成
- 與現有商城共用購物車 / 支付 / 會員登入
- 工廠排產與生產工單

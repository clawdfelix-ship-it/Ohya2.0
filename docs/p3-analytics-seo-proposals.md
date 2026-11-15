# P3 Analytics + SEO 收尾提案

> 日期：2026-11-15  
> 狀態：只係本地提案／實作草案；未 push、未 deploy、未改 production、未新增公開面資料。  
> 範圍：P3 埋點接駁、sitemap 分批覆蓋，以及需 Felix 審批先可以做的公開面方案。

## 提案 A：7 篇指南補商品連結

### 現況

- 已知有 7 篇指南缺少商品連結。
- 本輪**未查、未改**呢 7 篇指南；文章 slug **待另行確認**。
- 未捏造 slug、商品 ID、商品連結、售價、庫存或指南內容。

### 補連結前必須逐篇確認

1. 由 Felix／內容負責人確認 7 篇正式 slug 清單及正確 canonical URL。
2. 確認每篇指南的主題、搜尋意圖同可承接商品，避免只為增加內部連結而硬塞商品。
3. 確認擬連商品 ID／SKU、現時名稱、售價／庫存狀態及商品頁可正常開啟；內容與貨號必須一致。
4. 確認一篇指南應連一件定多件商品，以及每個商品的錨文字同建議位置。
5. 確認不會連到下架、預購失效、無圖、無售價或錯誤分類商品。
6. 確認商品文案只陳述已核實資料，唔會把預購寫成即時現貨，亦唔會寫出未經批准嘅價格或保證。
7. 逐篇由 Felix 審批內容；發佈前做手機／桌面連結檢查、canonical、重定向及 404 檢查。

### 建議執行方式

- 先做 1 篇 pilot：確認選品、錨文字、版面及追蹤事件，再處理餘下 6 篇。
- 每次只發佈已審批文章；保留修改前版本及 rollback 記錄。
- 發佈後檢查內部連結、商品頁 HTTP 狀態、canonical 及 sitemap／robots 覆蓋。

**目前結論：暫未補。slug 待另行確認；未獲 Felix 明確批准前不改公開指南。**

## 提案 B：公開商品評價機制

### 現況

- `product_reviews` 現時為 0，沒有足夠公開評價基礎。
- 本輪只提出方案，**未建立公開評價、未新增 review rows、未新增公開評價區**。

### 建議公開面流程

1. **提交**：只收集評分、简短文字、選擇性顯示名／匿名選項及可驗證訂單 reference；email、電話、地址等 PII 不進入公開評價。
2. **待審核**：所有新評價先入 `pending`，不可即時公開；管理員可查看原文、關聯商品及防濫用訊號。
3. **審核**：只容許有 `reviews:manage`（或同級）權限的 staff 批核；支援 `approved`／`rejected`、原因及 audit trail。不得由評價提交者自行批核。
4. **公開**：公開 API 只讀 `approved` 且商品仍 active 的評價；分頁、排序穩定；預設先顯示最新 approved。
5. **防濫用**：限速、一次性驗證、禁止重複 hash／可疑文字；不收集 UA 指紋作身份判定。伺服器只做必要防護，不以第三方 tracker 補洞。
6. **私隱**：公開頁不顯示 email、電話、地址、完整訂單號；如需確認購買，只顯示不可逆、截短且不可回推訂單的 reference。公開評價文字與顯示名須經內容／私隱審查。
7. **保留與刪除**：公布私隱聲明、保留期、撤回／刪除流程；回覆評價不可暗示政府認可、付款關係或質保承諾。

### 上線前 gate

- Felix 批准資料 schema、公開 API、UI、權限、審核 SLA、私隱聲明及保留期。
- 先以內部／測試資料驗證 approved-only 讀取、權限、分頁、spam 防護及 PII 欄位不可公開。
- 決定是否要求「已付款／已交付」先決條件，以及匿名提交的風險；未決定前不啟用公開收集。

## 提案 C：`is_featured` 精選區公開面

### 現況

- Admin 側 API 已支援 `is_featured`。
- 本輪只提出方案，**未新增公開精選區、未改任何公開商品 flag**。

### 建議公開面規則

1. 精選名單由 admin 手動維護，`is_featured` 只係候選旗標，唔代表自動公開。
2. 公開查詢只取 `status = active`、未刪除、有有效圖片、`price > 0`，並排除「販売終了」商品。
3. 建議每批最多 8–12 件，設定人工排序及顯示期限；到期自動移除或退回待審批，避免長期 stale inventory。
4. 顯示內容只用商品 ID、現有商品資料及既有 canonical 商品 URL；不複製／建立公開 review、公開 testimonial 或其他新公開資料。
5. 每次改精選名單需 audit trail（誰、何時、改哪些 product ID）及 Felix 發佈批准；下架商品即使仍在名單亦不得顯示。
6. 先做內部／preview 驗證，再逐批公開；每批觀察精選 CTR、商品頁跳出率、加購／checkout 漏斗及庫存狀態。

### 上線前 gate

- Felix 決定精選區位置、件數、排序、有效期、供應商／品牌限制及 mobile layout。
- 明確批准公開資料與營運責任後，先新增公開 API／UI；本輪不提前建立。

## 提案 D：sitemap 分批放量計劃

### 本輪實作（只係本地）

- `/sitemap.xml`：sitemap index。
- `/sitemap-pages.xml`：既有靜態頁 + 已發佈指南。
- `/sitemap-products-N.xml`：產品分片，每片最多 5,000 URL。
- 總產品 URL cap env 名：`SEO_SITEMAP_MAX_PRODUCT_URLS`。
- 預設值：`5000`；程式上限：`18000`；非法／非正數值回退至 `5000`。
- SQL 查詢只讀；分片 URL 全部使用 canonical host。

### 品質 gate

新加入候選必須同時符合：

- `status = 'active'`；
- `deleted_at IS NULL`；
- 名稱／中文名不包含「販売終了」；
- 有 `image_url`；
- `price > 0`；
- 至少一項：SKU 有正庫存、產品／SKU 有 `cost_price > 0`、或 `review_count > 0`。

### 保留已索引 5,000 款的做法

- `keep_set` 精確沿用舊 `/sitemap.xml` 的條件及排序：`status = 'active'`、名稱不包含「販売終了」、`ORDER BY id DESC LIMIT 5000`。
- `quality_set` 再用新增品質條件取新候選；兩者 `UNION` 後仍按 `id DESC` 排序及套總 cap。
- 因此預設 cap 仍是 `5000` 時，舊 sitemap 內已索引的 5,000 件不會被新候選移走；只會在 cap 調高時逐步加入更舊但通過品質 gate 的商品。
- 若發現舊 5,000 集合有任何例外，立即停放量並以舊查詢做差異核對；不可用「大概相同」代替集合級比對。

### 放量次序與觀察 gate

| 階段 | `SEO_SITEMAP_MAX_PRODUCT_URLS` | 建議最短觀察期 | 進入下一階段條件 |
|---|---:|---:|---|
| 0（本地／未部署） | 5000 | 本輪全測試 + XML／SQL 測試 | 測試全綠、diff 通過、Felix 批准部署 |
| 1（部署後基線） | 5000 | 7 日 | sitemap fetch 正常、產品 URL 總數 ≤ cap、抽樣 PDP 無新增 5xx／錯誤 canonical、搜尋引擎錯誤率無上升 |
| 2 | 8000 | 14 日 | 發現／索引覆蓋相對 7 日基線無明顯下跌、抽樣有效商品 404／5xx ≤ 1%、伺服器 sitemap latency 與錯誤率無持續惡化 |
| 3 | 12000 | 14 日 | 上述條件持續成立，新增 URL 抽查通過，管理員確認精選／分類／庫存資料無異常 |
| 4 | 18000 | 14 日 | 最終抽查通過；仍保留上限，不預設無限放量 |

### 每批必看指標

- sitemap index／pages／每個 product shard HTTP 200、Content-Type 正確、XML 可解析。
- index 內宣告 shard 數量、每 shard URL 數（≤ 5,000）及總產品 URL 數（≤ env cap）一致。
- sitemap／product shard fetch latency、5xx rate、Vercel function errors／配額。
- 抽樣新增 PDP：200、非錯誤頁、canonical self、沒有意外 noindex、圖片／價格／庫存狀態合理。
- Search Console（需另一次獲批／有權限時）：已發現 URL、被索引 URL、crawl errors、soft 404、sitemap submitted／indexed 狀態；與前一批比較，不以單日波動下結論。
- 商業漏斗只作輔助觀察：搜尋→商品頁 CTR、商品頁→加購率、加購→checkout 開始率、checkout→付款完成率；需分 source／day 睇，樣本細時不可作因果結論。

### Rollback

- 放量只需把 `SEO_SITEMAP_MAX_PRODUCT_URLS` 調返上一階段值（例如 12,000 → 8,000 → 5,000），毋須立即改 code。
- 若發現 sitemap／PDP 錯誤、索引覆蓋下跌或資料品質問題，停止下一批、保留舊值，並做 URL 集合差異核對。
- 未經 Felix 明確批准，本地變更不 push、不 deploy。

## 護欄及未執行事項

- 冇接新支付商、冇改收款資料、冇真實落單／退款。
- 冇加第三方 tracker；事件由自建 API／資料表處理。
- 冇新增公開評價、公開精選區或其他公開面資料。
- 冇 push、冇 deploy、冇讀／寫 production。
- 埋點保持 fail-open；事件只收 `product_id` 及非識別 context，不收 email／IP／user id／UA 指紋。

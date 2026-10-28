// GEO 指南文章 seed：寫 6 篇廣東話香港式選購指南落 blog_posts（status='published'）
// 參考 Flow/18Gifts/Waddy 嘅香港公式：開場貼地 → TOC → 分類解說 → 揀選原則 → 用法貼士 → 推薦
// 內部連結去返我哋自己嘅 category 頁（link juice）
//
// 用法：cd Ohya2.0 && node scripts/seed-guides.js
// 重跑安全：slug 衝突會 UPDATE 內容，唔會 duplicate

require('dotenv').config();
const { Pool } = require('pg');

const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;
if (!connectionString) {
  console.error('❌ 冇 DATABASE_URL / POSTGRES_URL');
  process.exit(1);
}
const pool = new Pool({ connectionString });

const NOW = new Date();

const posts = [
  // ============ 1. 飛機杯 ============
  {
    slug: 'how-to-choose-onahole-2026',
    title: '飛機杯點揀 2026｜新手入門到進階完整指南',
    excerpt: '第一次買飛機杯唔知點入手？我哋用 14 年日本入口經驗，教你由刺激度、軟硬度、尺寸、材質到價位逐樣拆解，新手到進階都搵到啱嘅。',
    meta_title: '飛機杯點揀 2026 | 新手入門指南 | OHYA2.0',
    meta_description: '香港飛機杯點揀？教你由刺激度、軟硬度、尺寸、材質、價位揀啱你嘅日本飛機杯。TENGA、Magic Eyes、Ride Japan 等正貨品牌推薦。',
    publish_at: NOW,
    content: `
<p>買飛機杯其實同買波鞋一樣 — 冇「最好」，只有「最啱你」。我哋喺香港做日本成人用品入口 14 年，見過唔少新手第一次買飛機杯，唔係買咗太刺激嘅款式搞到唔舒服，就係貪平買咗大陸山寨貨，用一次就掉。今次等我哋用最貼地嘅方式，同你拆解點揀一個啱你嘅飛機杯。</p>

<h2>飛機杯有咩分類？</h2>
<p>市面上嘅飛機杯大致分三類，各有優缺：</p>
<h3>1. 一次性飛機杯（即棄款）</h3>
<ul>
  <li>用完即棄，唔使洗，最方便</li>
  <li>多數用凝膠或軟膠造，質感比較簡單</li>
  <li>代表：<strong>TENGA Egg</strong>（扭蛋型）、<strong>TENGA CUP</strong> 系列</li>
  <li>適合：出 trip、Staycation、新手試水溫</li>
</ul>
<h3>2. 可重用飛機杯（基本款）</h3>
<ul>
  <li>可以清洗重用，一般可以用 30–50 次</li>
  <li>多數用 TPE 軟膠或者矽膠</li>
  <li>代表：<strong>Magic Eyes</strong>、<strong>Ride Japan</strong>、<strong>EXE</strong>、<strong>Fleshlight</strong></li>
  <li>適合：想認真玩嘅用家</li>
</ul>
<h3>3. 電動飛機杯</h3>
<ul>
  <li>有震動、吸啜、旋轉等功能，部分可以手機 App 遙控</li>
  <li>價位較高（HK$500–1500+）</li>
  <li>代表：<strong>Lovense Max 2</strong>、<strong>Arcwave Ion</strong></li>
  <li>適合：進階玩家、遠距離情侶</li>
</ul>

<h2>揀飛機杯 5 大原則</h2>
<h3>1. 刺激度</h3>
<p>飛機杯靠內部紋路（直線、螺旋、凸點、仿真黏膜）製造刺激。<strong>新手記住：唔好一開始就玩最刺激嘅款</strong>。你太敏感會辛苦，仲會令日後進階冇咁好玩。由軟身、紋路淺嘅開始，慢慢試出自己鍾意嘅程度。</p>
<h3>2. 軟硬度</h3>
<p>軟身（TPE 軟膠）觸感似真人，但壽命短啲；硬身（矽膠）耐用，但冇咁柔軟。<strong>新手建議揀軟身</strong>，容錯率高。</p>
<h3>3. 尺寸同深度</h3>
<p>睇清楚「插入深度」同「直徑」。亞洲人一般 12–15cm 深度已經夠，太長反而頂到唔舒服。直徑方面，<strong>緊唔係好</strong>，太緊會痛。新手揀「標準」或者「慢玩」系列穩陣。</p>
<h3>4. 像真度</h3>
<p>仿真陰道款觸感最似真人，但外觀會「好肉緊」。同住屋企人或者想低調啲，可以揀外觀簡約嘅（例如 TENGA 嘅設計款），放入櫃筒都唔會畀人認到。</p>
<h3>5. 價位</h3>
<p>入門 HK$100–250、中階 HK$250–500、高階 HK$500+。<strong>新手唔使一開始買最貴</strong>，慢慢升級先係王道。記住：飛機杯係消耗品，用得幾個月就要換。</p>

<h2>新手使用貼士</h2>
<ol>
  <li><strong>一定要用水性潤滑液</strong>。冇潤滑液直接用 = 自虐。記住係「水性」，唔好買錯矽性，矽性會侵蝕玩具。</li>
  <li><strong>第一次可以戴套玩</strong>，降低刺激度，等自己適應先。</li>
  <li><strong>想更似真人</strong>，可以將潤滑液放暖水浸暖先，或者用專用加熱棒。</li>
  <li><strong>用完即刻洗</strong>。用室溫水 + 玩具清潔劑洗，陰乾後上保養粉。唔好放喺度過夜，會滋生細菌。</li>
  <li><strong>唔好諗住一步到位</strong>。由平價入門款開始，慢慢試出自己鍾意嘅類型先升級。</li>
</ol>

<h2>日本品牌推薦</h2>
<ul>
  <li><strong>TENGA</strong> — 日本最出名，設計簡約，品質穩定，新手首選</li>
  <li><strong>Magic Eyes</strong> — 仿真款出色，內部結構設計精巧</li>
  <li><strong>Ride Japan</strong> — 大型半身款出名，進階玩家最愛</li>
  <li><strong>EXE</strong> — 性價比高，中價位好選擇</li>
</ul>

<p>想睇晒我哋嘅飛機杯系列？<a href="/products?category=storefront-onahole">→ 去飛機杯分類頁</a>，香港倉庫現貨，順豐保密包裝到付。</p>

<h2>常見問題</h2>
<h3>飛機杯係咪好污糟？</h3>
<p>只要用完即刻清洗，完全冇問題。記住用玩具專用清潔劑，唔好用普通番梘（會傷矽膠）。</p>
<h3>可以同房仲用嗎？</h3>
<p>唔建議。玩具係個人用品，共用會傳播細菌。想同伴侶玩可以考慮一對設計嘅款式。</p>
<h3>點樣收藏先唔會畀人發現？</h3>
<p>揀外觀簡約嘅款式（例如 TENGA），放入玩具收納袋，放喺櫃筒深處就穩陣。或者考慮即棄款，用完即棄唔使收藏。</p>
`,
  },

  // ============ 2. 潤滑液 ============
  {
    slug: 'lubricant-guide-hong-kong',
    title: '日本潤滑液完全指南｜水性 vs 矽性 vs 溫熱點揀',
    excerpt: '水性、矽性、溫熱、免洗、高黏度... 潤滑液款式多到眼花？一次過話你知邊款適合你，點配玩具，同埋點解一定要用潤滑液。',
    meta_title: '潤滑液點揀 | 水性 vs 矽性比較 | OHYA2.0',
    meta_description: '香港潤滑液選購指南：水性、矽性、溫熱、免洗、高黏度潤滑液點揀？配飛機杯要用邊款？日本正貨入口。',
    publish_at: NOW,
    content: `
<p>好多人買玩具唔記得買潤滑液，結果體驗大打折扣。其實潤滑液唔係「optional 配件」，而係<strong>必需品</strong> — 無論係用飛機杯、真人性行為、定係後庭，潤滑液都係保護你身體嘅重要一環。我哋喺香港做日本入口 14 年，今日同你拆解點揀潤滑液。</p>

<h2>點解一定要用潤滑液？</h2>
<ul>
  <li><strong>減少摩擦</strong>：避免皮膚受傷、紅腫</li>
  <li><strong>提升快感</strong>：滑溜嘅觸感本身就係享受</li>
  <li><strong>保護玩具</strong>：直接摩擦會令玩具表面加速老化</li>
  <li><strong>衛生</strong>：潤滑液形成保護膜，減少細菌直接接觸</li>
</ul>

<h2>三大類潤滑液比較</h2>
<h3>1. 水性潤滑液（最推薦新手）</h3>
<ul>
  <li>✅ 易清洗，用水沖就得</li>
  <li>✅ 唔傷玩具（可配任何材質）</li>
  <li>✅ 可配安全套（唔會破壞乳膠）</li>
  <li>❌ 比較快乾，中途可能要補</li>
  <li>適合：飛機杯、矽膠玩具、安全套使用者、新手</li>
</ul>
<h3>2. 矽性潤滑液</h3>
<ul>
  <li>✅ 超持久，唔使補</li>
  <li>✅ 水中都可以用（沖涼玩水啱晒）</li>
  <li>❌ 唔可以配矽膠玩具（會侵蝕表面，整爛玩具）</li>
  <li>❌ 難清洗，要用梘液</li>
  <li>適合：真人親密行為、水中使用、長時間使用</li>
</ul>
<h3>3. 油性潤滑液</h3>
<ul>
  <li>✅ 最持久</li>
  <li>❌ 唔可以配安全套（會令乳膠破裂）</li>
  <li>❌ 難清洗</li>
  <li>適合：非常少數情況，我哋一般唔推薦</li>
</ul>

<h2>日本潤滑液嘅功能細分</h2>
<p>日本潤滑液除咗基本款，仲有好多功能款：</p>
<ul>
  <li><strong>溫熱型</strong>：搽上去會微微發熱，增加真實感</li>
  <li><strong>清涼型</strong>：薄荷成分，有刺激感</li>
  <li><strong>免洗型</strong>：用完唔使特別清洗，適合懶人</li>
  <li><strong>高黏度</strong>：拉絲效果，視覺同觸感都更似愛液</li>
  <li><strong>飛機杯專用</strong>：特別配方，唔會太稀流失，又唔會太稠影響手感</li>
  <li><strong>後庭專用</strong>：高黏度長效，後庭唔會自己分泌潤滑，一定要用專用款</li>
  <li><strong>大容量（1L+）</strong>：長期用家抵買之選</li>
</ul>

<h2>點配玩具？</h2>
<table>
  <thead><tr><th>玩具材質</th><th>可用潤滑液</th></tr></thead>
  <tbody>
    <tr><td>矽膠（大部分高級玩具）</td><td><strong>只可以水性</strong></td></tr>
    <tr><td>TPE 軟膠（大部分飛機杯）</td><td>水性（推薦）或油性</td></tr>
    <tr><td>玻璃/金屬/ABS 膠</td><td>水性、矽性、油性都可以</td></tr>
    <tr><td>安全套</td><td><strong>只可以水性或矽性</strong></td></tr>
  </tbody>
</table>

<h2>新手推薦</h2>
<p>第一次買，建議揀<strong>中黏度水性款</strong>，適用範圍最廣。如果主要配飛機杯用，可以揀「飛機杯專用」款，配方會更持久。用量方面，每次 5–10ml 已經夠，唔使擠太多。</p>

<p><a href="/products?category=storefront-lotion">→ 去潤滑液分類頁</a>睇晒我哋嘅日本正貨潤滑液，香港倉庫現貨，順豐保密包裝。</p>

<h2>常見問題</h2>
<h3>潤滑液會過期嗎？</h3>
<p>會。開封後一般建議 6–12 個月內用完。留意樽身嘅到期日，過期嘅潤滑液可能變質，引起皮膚敏感。</p>
<h3>可以用唾液代替潤滑液嗎？</h3>
<p>唔建議。唾液好快乾，而且含細菌，唔衛生。</p>
<h3>用潤滑液會唔會引起敏感？</h3>
<p>大部分人唔會，但敏感皮膚建議揀「無香料」「無色素」款。第一次用可以先喺手臂內側試少少，睇有冇反應。</p>
`,
  },

  // ============ 3. 安全套 ============
  {
    slug: 'japan-condom-001-002-003-comparison',
    title: 'Sagami 0.01 vs Okamoto 0.02 vs 0.03｜日本超薄安全套點揀',
    excerpt: '0.01、0.02、0.03 係咩意思？Sagami 同 Okamoto 有咩分別？超薄安全套係咪真係咁好用？一文話你知日本安全套點揀。',
    meta_title: '日本安全套 0.01 vs 0.02 vs 0.03 比較 | OHYA2.0',
    meta_description: 'Sagami 相模 0.01 vs Okamoto 岡本 0.02 0.03 超薄安全套邊款好？日本安全套尺碼點計？香港正貨入口。',
    publish_at: NOW,
    content: `
<p>講起日本安全套，一定離唔開「0.01」、「0.02」、「0.03」呢啲數字。究竟佢哋係咩意思？係咪真係越薄越好？Sagami 同 Okamoto 又有咩分別？等我哋一次過拆解。</p>

<h2>0.01 / 0.02 / 0.03 係咩意思？</h2>
<p>呢啲數字係<strong>安全套嘅厚度，以 mm 計</strong>：</p>
<ul>
  <li><strong>0.03</strong> = 0.03mm（早期超薄款）</li>
  <li><strong>0.02</strong> = 0.02mm（更薄）</li>
  <li><strong>0.01</strong> = 0.01mm（<strong>現時世界最薄</strong>）</li>
</ul>
<p>對比：普通安全套一般係 0.05–0.07mm，所以 0.01 真係薄咗 5–7 倍。戴上去嘅感覺，就好似冇戴一樣。</p>

<h2>Sagami vs Okamoto — 兩大日本品牌</h2>
<h3>Sagami 相模（サガミ）</h3>
<ul>
  <li>發明咗世界首款 0.01mm 安全套（<strong>Sagami Original 0.01</strong>）</li>
  <li>用 <strong>聚氨酯（PU）</strong> 物料，唔係傳統乳膠</li>
  <li>優點：更薄、更透明、導熱快（體溫傳導好）、冇乳膠味、乳膠敏感者可用</li>
  <li>缺點：彈性比乳膠差少少</li>
</ul>
<h3>Okamoto 岡本（オカモト）</h3>
<ul>
  <li>老牌日本安全套廠，0.01 同 0.02 都有</li>
  <li>用 <strong>乳膠</strong>（0.01 款）或者 <strong>聚氨酯</strong>（0.02 款）</li>
  <li>優點：乳膠款彈性好、價錢相對平</li>
  <li>缺點：乳膠款會有少少乳膠味</li>
</ul>

<h2>邊款好？點揀？</h2>
<table>
  <thead><tr><th>型號</th><th>厚度</th><th>材質</th><th>特點</th><th>價位</th></tr></thead>
  <tbody>
    <tr><td>Sagami Original 0.01</td><td>0.01mm</td><td>PU</td><td>最薄、冇味、導熱好</td><td>$$$</td></tr>
    <tr><td>Okamoto 0.01</td><td>0.01mm</td><td>乳膠</td><td>彈性好、平少少</td><td>$$</td></tr>
    <tr><td>Sagami Original 0.02</td><td>0.02mm</td><td>PU</td><td>平衡款</td><td>$$</td></tr>
    <tr><td>Okamoto 0.03</td><td>0.03mm</td><td>乳膠</td><td>入門超薄</td><td>$</td></tr>
  </tbody>
</table>
<p><strong>新手建議</strong>：由 <strong>0.02 或者 0.03</strong> 開始試，體感提升已經好明顯。用得習慣先升級 0.01。</p>

<h2>日本尺碼點計？</h2>
<p>日本安全套嘅尺碼比歐美款細少少，更貼合亞洲人。常見尺碼：</p>
<ul>
  <li><strong>標準（M）</strong>：直徑 33mm 左右 — 大部分亞洲男性啱用</li>
  <li><strong>大碼（L / LL）</strong>：直徑 36mm+ — 比較粗嘅用家</li>
  <li><strong>細碼（S）</strong>：直徑 30mm 左右 — 較緊身，感覺更強</li>
</ul>
<p>揀錯尺碼會點？太緊會唔舒服、易穿；太鬆會滑出嚟、避孕失敗。所以尺碼係<strong>必須要啱</strong>。</p>

<h2>功能款仲有咩揀？</h2>
<ul>
  <li><strong>持久型</strong>：含少量麻醉劑，延長時間</li>
  <li><strong>加潤滑型</strong>：自帶更多潤滑液，免額外補</li>
  <li><strong>顆粒/螺紋</strong>：增加對方刺激</li>
  <li><strong>熱感/涼感</strong>：增加情趣</li>
</ul>

<h2>香港買日本安全套要注意</h2>
<ul>
  <li>⚠️ <strong>認住正貨</strong>：日本安全套假貨好多，特別係 Sagami 0.01。我哋係日本直接入口，正貨保證。</li>
  <li>⚠️ <strong>睇到期日</strong>：安全套過期會變質易穿，買之前記住睇清楚。</li>
  <li>⚠️ <strong>存放</strong>：唔好放喺銀包、車廂等高溫位置，會加速老化。</li>
</ul>

<p><a href="/products?category=storefront-condom">→ 去避孕套分類頁</a>睇晒 Sagami、Okamoto 嘅日本正貨，香港倉庫現貨，順豐保密包裝到付。</p>

<h2>常見問題</h2>
<h3>0.01 係咪真係冇感覺？</h3>
<p>唔係完全冇，但係體感會非常接近冇戴。配合潤滑液用會更好。</p>
<h3>超薄係咪容易穿？</h3>
<p>唔會。Sagami 同 Okamoto 嘅超薄款都經過嚴格測試，強度同普通款一樣，只要正確使用（唔好用指甲拮、注意尺碼），唔會易穿。</p>
<h3>乳膠敏感可以用嗎？</h3>
<p>可以揀 Sagami Original 系列，佢哋用聚氨酯物料，唔含乳膠。</p>
`,
  },
];

// 第 4–6 篇：震動棒、SM 入門、後庭用品
const postsPart2 = [
  // ============ 4. 震動棒 ============
  {
    slug: 'vibrator-beginner-guide-hk',
    title: '震動棒點揀｜震蛋 vs 按摩棒 vs G 點棒新手入門',
    excerpt: '震蛋、按摩棒、G 點棒、兔子棒... 女用震動玩具款式多到唔知點揀？新手由邊款入手好？一次過話你知。',
    meta_title: '震動棒點揀 | 新手入門指南 | OHYA2.0',
    meta_description: '香港震動棒選購指南：震蛋 vs 按摩棒 vs G 點棒 vs 兔子棒點揀？日本正貨靜音防水款推薦，新手入門必睇。',
    publish_at: NOW,
    content: `
<p>女用震動玩具款式真係多到眼花 — 震蛋、按摩棒、G 點棒、兔子棒、吸啜器... 第一次買真係唔知點入手。我哋喺香港做日本入口 14 年，今日同你拆解最常見嘅幾款，幫你搵到最啱嘅第一款。</p>

<h2>常見款式分類</h2>
<h3>1. 震蛋（Bullet / Egg Vibrator）</h3>
<ul>
  <li>最細件嘅震動玩具，通常 5–8cm 長</li>
  <li>主要用嚟刺激外部敏感點（陰蒂、乳頭等）</li>
  <li>✅ 平、細件易收藏、唔入體、新手友善</li>
  <li>❌ 功能比較單一</li>
  <li><strong>新手首推</strong>：價錢平（HK$100–300），唔會有「侵入感」，壓力最細</li>
</ul>
<h3>2. 按摩棒（Wand / AV棒）</h3>
<ul>
  <li>頭大身長，最經典嘅女用玩具（AV 常見款）</li>
  <li>主要用嚟外部按摩，震動範圍大、力度強</li>
  <li>✅ 震動力強、效果快、唔使入體</li>
  <li>❌ 較大部、部分有線款唔方便</li>
  <li>適合：鍾意強力外部刺激嘅用家</li>
</ul>
<h3>3. G 點棒（G-spot Vibrator）</h3>
<ul>
  <li>棒身彎曲，專為刺激 G 點設計</li>
  <li>要入體使用</li>
  <li>✅ 針對 G 點刺激，好多女性嘅最愛</li>
  <li>❌ 需要少少經驗先好用得順</li>
  <li>適合：已經習慣入體玩具嘅用家</li>
</ul>
<h3>4. 兔子棒（Rabbit Vibrator）</h3>
<ul>
  <li>主棒入體 + 分支刺激陰蒂，雙重刺激</li>
  <li>✅ 內外同步刺激，效果最全面</li>
  <li>❌ 價錢較貴、操作複雜少少</li>
  <li>適合：進階用家、想要全面體驗</li>
</ul>
<h3>5. 吸啜器（Clitoral Suction）</h3>
<ul>
  <li>唔係震動，係用氣壓吸啜陰蒂</li>
  <li>近年最紅嘅類型（代表：Womanizer、Satisfyer）</li>
  <li>✅ 感覺同傳統震動完全唔同，好多用家話更易高潮</li>
  <li>❌ 價錢較貴（HK$400–1000+）</li>
</ul>

<h2>揀震動玩具 5 大原則</h2>
<h3>1. 震動模式</h3>
<p>多段變頻好過單一頻率 — 你可以由弱開始慢慢加強。好嘅震動棒會有 7–10 種模式（持續震、間歇震、波浪震等）。</p>
<h3>2. 音量</h3>
<p>香港屋企隔音差，靜音好重要。<strong>日本品牌普遍靜音做得好</strong>，大多數 50 分貝以下（大約係耳語聲）。買之前睇清楚分貝標示。</p>
<h3>3. 防水等級</h3>
<ul>
  <li><strong>IPX7</strong>：可以浸水，沖涼用都得，清洗最方便</li>
  <li><strong>IPX5–6</strong>：防濺水，可以冲洗但唔好浸</li>
  <li><strong>唔防水</strong>：只可以用濕布抹</li>
</ul>
<p>建議揀至少 IPX6 以上，清洗方便好多。</p>
<h3>4. 充電方式</h3>
<p><strong>USB 充電</strong> 最方便（特別係磁吸充電）；傳統換電款而家好少，但旅行用都唔錯。留意充電時間同使用時間比例。</p>
<h3>5. 材質</h3>
<p>一定要揀<strong>醫療級矽膠</strong>或者 ABS 硬膠，唔好買平價 PVC（可能含鄰苯二甲酸酯，對身體有害）。日本品牌全部都用安全材質，放心。</p>

<h2>新手建議路線</h2>
<ol>
  <li><strong>第一步：震蛋</strong>（HK$100–300）試水溫，了解自己鍾意咩力度</li>
  <li><strong>第二步：按摩棒或吸啜器</strong>（HK$300–600）升級外部刺激</li>
  <li><strong>第三步：G 點棒或兔子棒</strong>（HK$400–800）開始入體探索</li>
</ol>

<h2>使用貼士</h2>
<ul>
  <li>第一次用唔好直接開最強，由最弱開始慢慢適應</li>
  <li>配水性潤滑液用，特別係入體款</li>
  <li>使用前後用溫水 + 玩具清潔劑清洗</li>
  <li>唔好同他人共用（衛生問題）</li>
</ul>

<p><a href="/products?category=storefront-vibrators">→ 去震動棒分類頁</a>睇晒日本正貨款式，香港倉庫現貨，順豐保密包裝到付。</p>

<h2>常見問題</h2>
<h3>用震動棒會唔會「上癮」或者令敏感度下降？</h3>
<p>唔會。醫學研究證實適度使用震動玩具唔會影響敏感度。只要你唔係每次都開到最強，身體唔會「適應」到冇晒感覺。</p>
<h3>點收藏先唔會畀人發現？</h3>
<p>而家好多新款設計到好似化妝品或者按摩器（例如吸啜器外形似洗面機），放入櫃筒或者化妝袋都唔會畀人認到。我哋嘅包裝都係保密包裝，屋企人收貨都唔會知入面係咩。</p>
<h3>邊款最靜音？</h3>
<p>吸啜器同細件震蛋普遍最靜音。日本品牌（TENGA 嘅 iroha 系列等）靜音做得特別好。</p>
`,
  },

  // ============ 5. SM 入門 ============
  {
    slug: 'sm-beginner-safety-guide',
    title: 'SM 入門安全指南｜新手道具 + 安全詞必知',
    excerpt: '想試 SM 但唔知點入手？安全詞係咩？邊啲道具新手玩得？香港 SM 用品選購 + 安全須知完整指南。',
    meta_title: 'SM 入門指南 | 新手道具推薦 + 安全須知 | OHYA2.0',
    meta_description: '香港 SM 用品入門：新手道具推薦（眼罩、軟手銬、羽毛棒）、安全詞設定、溝通技巧。日本正貨 BDSM 用品，保密包裝。',
    publish_at: NOW,
    content: `
<p>SM（BDSM）唔係電影入面咁誇張，好多香港情侶都會玩吓輕度嘅 SM 增加情趣。但係安全永遠係第一位 — 玩得好可以增加信任同快感，玩得唔好會受傷甚至影響關係。等我哋由安全講起，再介紹新手道具。</p>

<h2>SM 嘅黃金法則：SSC 原則</h2>
<p>全世界 BDSM 社群都遵循 <strong>SSC</strong>：</p>
<ul>
  <li><strong>Safe（安全）</strong>：唔會造成真正傷害</li>
  <li><strong>Sane（理智）</strong>：雙方清醒狀態下同意</li>
  <li><strong>Consensual（知情同意）</strong>：事前清楚溝通，隨時可以叫停</li>
</ul>
<p>任何時候違反呢三條，就唔係「玩」而係「傷害」。記住：<strong>同意可以隨時收回</strong>，對方叫停就要即刻停。</p>

<h2>安全詞（Safe Word）點設定？</h2>
<p>安全詞係一個預先約定嘅詞語，一講出就<strong>即刻停止所有動作</strong>。點解需要？因為喺角色扮演入面，「唔好」、「停」可能係劇情一部分，唔係真係想停。所以要用一個完全唔會喺情境入面出現嘅詞。</p>
<ul>
  <li>✅ 好嘅安全詞：「菠蘿」、「紅燈」、「企鵝」— 日常情境唔會講</li>
  <li>❌ 差嘅安全詞：「停」、「唔好」、「求下你」— 可能係劇情一部分</li>
</ul>
<p>進階可以用<strong>紅綠燈系統</strong>：</p>
<ul>
  <li>🟢 綠色 = 繼續，好好</li>
  <li>🟡 黃色 = 慢啲 / 輕啲，接近極限</li>
  <li>🔴 紅色 = 即刻停</li>
</ul>

<h2>新手道具推薦（由輕到重）</h2>
<h3>Level 1：感官剝奪（最安全）</h3>
<ul>
  <li><strong>眼罩</strong>：遮住視覺，其他感官即刻放大。最平最易入手，零風險。</li>
  <li><strong>羽毛棒 / 癢癢棒</strong>：輕掃皮膚，製造酥麻感。</li>
  <li>玩法：蒙眼 + 羽毛輕掃，對方估唔到你下一步掂邊度，刺激感倍增。</li>
</ul>
<h3>Level 2：輕度束縛</h3>
<ul>
  <li><strong>魔術貼軟手銬</strong>：<strong>新手一定要揀魔術貼款</strong>，唔好用真金屬手銬。魔術貼一扯就開，緊急時可以即刻解開。</li>
  <li><strong>頸圈（裝飾款）</strong>：心理支配感強，但唔好真係用力拉。</li>
  <li>玩法：手銬固定喺床頭，對方任你擺佈。</li>
</ul>
<h3>Level 3：輕度刺激</h3>
<ul>
  <li><strong>軟皮鞭 / 拍子</strong>：輕拍臀部，製造微痛同聲響。新手唔好用真藤鞭。</li>
  <li><strong>乳夾（可調鬆緊款）</strong>：一定要可以調鬆緊，由最鬆開始。</li>
  <li><strong>低溫蠟燭（SM 專用）</strong>：⚠️ 唔好用普通蠟燭！普通蠟燭溫度太高會燙傷。SM 專用蠟燭用低熔點蠟，滴落皮膚只係溫熱。</li>
</ul>
<h3>進階（有經驗先好玩）</h3>
<ul>
  <li>麻繩捆綁（要學繩縛技巧，綁錯會傷神經）</li>
  <li>口塞（要留意呼吸）</li>
  <li>真金屬手銬（要有匙，唔好遺失）</li>
</ul>

<h2>新手常見錯誤</h2>
<ol>
  <li><strong>冇講安全詞就開始</strong> — 一定要事前約定</li>
  <li><strong>貪得意買真金屬手銬</strong> — 新手用魔術貼款先穩陣</li>
  <li><strong>捆綁太緊</strong> — 繩同皮膚之間要可以插入兩隻手指</li>
  <li><strong>玩完冇 Aftercare</strong> — 見下面</li>
</ol>

<h2>Aftercare 係咩？點解咁重要？</h2>
<p>SM 完之後，被支配嘅一方可能會有情绪波动（荷爾蒙急降）。<strong>Aftercare</strong> 就係事後嘅照顧：</p>
<ul>
  <li>擁抱、冧吓對方</li>
  <li>俾佢飲水、蓋被保暖</li>
  <li>傾吓剛才嘅感受，邊啲鍾意邊啲唔鍾意</li>
</ul>
<p>Aftercare 係建立信任嘅關鍵，唔好忽略。</p>

<p><a href="/products?category=storefront-sm">→ 去 SM 用品分類頁</a>睇晒日本正貨新手道具，香港倉庫現貨，順豐保密包裝到付。</p>

<h2>常見問題</h2>
<h3>玩 SM 係咪心理有問題？</h3>
<p>唔係。研究顯示 SM 愛好者同普通人心理健康冇分別，部分研究仲發現佢哋壓力水平更低。只係一種情趣偏好，同鍾意食辣冇分別。</p>
<h3>點樣同另一半開口話想試？</h3>
<p>揀個輕鬆嘅時刻（唔係床上），直接但溫和咁講：「我最近睇到啲嘢覺得幾有趣，你會唔會想試吓？」俾對方時間考慮，唔好施壓。</p>
<h3>邊個話事？一定要一個 S 一個 M 嗎？</h3>
<p>唔一定。好多情侶會交換角色（Switch），或者兩個都只係鍾意某啲玩法而唔係固定角色。冇規則，雙方開心就得。</p>
`,
  },

  // ============ 6. 後庭用品 ============
  {
    slug: 'anal-toys-beginner-safety-hk',
    title: '後庭用品安全入門｜潤滑液、尺寸、清潔須知',
    excerpt: '後庭玩具想試但怕痛怕危險？新手要知嘅安全知識：點解喇叭底座咁重要、潤滑液點揀、尺寸點循序漸進。',
    meta_title: '後庭用品入門 | 安全須知 + 新手推薦 | OHYA2.0',
    meta_description: '香港後庭用品入門指南：肛塞點揀？點解一定要喇叭底座？後庭潤滑液點用？新手尺寸建議，安全清潔方法。',
    publish_at: NOW,
    content: `
<p>後庭玩具係近年越嚟越多人好奇嘅類別，但係同時都係<strong>最需要注意安全</strong>嘅類別。後庭同陰道完全唔同 — 佢唔會自己分泌潤滑、肌肉結構唔同、仲有一個好多人都唔知嘅風險：<strong>玩具可能會被吸入直腸</strong>。今日同你講清楚點樣安全咁探索。</p>

<h2>後庭玩具嘅鐵則：一定要有喇叭底座</h2>
<p>呢個係<strong>最重要嘅安全知識</strong>，冇之一：</p>
<blockquote>
<p><strong>後庭玩具必須有「喇叭底座」（Flared Base）— 即係底部要比主體闊好多。</strong></p>
</blockquote>
<p>點解？因為直腸嘅肌肉收縮會將物件向內拉。冇喇叭底座嘅玩具（例如普通假陽具、按摩棒）一旦完全進入，可能會被吸入直腸深處，要自己拎返出嚟係幾乎唔可能 — 呢個係急症室嘅常見案例，唔好成為其中一員。</p>
<ul>
  <li>✅ 可以入後庭：專用肛塞（有喇叭底座）、前列腺按摩器（有底座/手把）、後庭拉珠（有拉環）</li>
  <li>❌ 唔可以入後庭：普通假陽具、G 點棒、震蛋（除非有專用底座）</li>
</ul>

<h2>點解後庭一定要潤滑液？</h2>
<p>陰道會自己分泌潤滑，但<strong>後庭完全唔會</strong>。冇潤滑液硬嚟，後果係：</p>
<ul>
  <li>疼痛</li>
  <li>黏膜撕裂（會流血、易感染）</li>
  <li>痔瘡惡化</li>
</ul>
<p>所以潤滑液唔係「令佢更舒服」，而係「保護你唔受傷」嘅必需品。</p>
<h3>後庭潤滑液點揀？</h3>
<ul>
  <li><strong>揀「後庭專用」或者「高黏度」水性潤滑液</strong>：比一般水性更濃稠、更持久</li>
  <li><strong>矽性都得</strong>（更持久），但記住唔可以配矽膠玩具</li>
  <li>用量要比平時多，唔好慳</li>
  <li>中途覺得乾就要補，唔好忍</li>
</ul>

<h2>新手尺寸點循序漸進？</h2>
<p>後庭肌肉係可以訓練嘅，但需要時間：</p>
<ol>
  <li><strong>第一步：手指</strong>（剪短指甲、磨滑邊緣）— 了解自己嘅感覺</li>
  <li><strong>第二步：最細碼肛塞</strong>（直徑 2–2.5cm）— 第一次買玩具嘅尺寸</li>
  <li><strong>第三步：細碼</strong>（2.5–3cm）— 習慣咗先升級</li>
  <li><strong>第四步：中碼</strong>（3–3.5cm）— 進階</li>
</ol>
<p><strong>千祈唔好一開始就買中碼或者大碼</strong>。肌肉撕裂係會留疤同長期疼痛嘅，慢慢嚟先係正道。</p>

<h2>材質點揀？</h2>
<ul>
  <li><strong>醫療級矽膠</strong>：最推薦。柔軟、安全、可以滾水煮消毒</li>
  <li><strong>不鏽鋼 / 玻璃</strong>：易清潔、可以加熱或冰凍玩溫度，但硬身唔適合新手</li>
  <li>❌ 避免：PVC、果凍膠（可能含有害物質）</li>
</ul>

<h2>使用前後嘅清潔</h2>
<h3>使用前</h3>
<ul>
  <li>去洗手間排空</li>
  <li>外部清洗（唔需要灌腸，除非你想）</li>
  <li>如果想灌腸，用專用灌腸器 + 溫水，唔好用肥皂水</li>
</ul>
<h3>玩具清潔</h3>
<ul>
  <li>每次使用前後用溫水 + 玩具清潔劑洗</li>
  <li>矽膠 / 不鏽鋼 / 玻璃款可以滾水煮 3 分鐘消毒</li>
  <li>後庭玩具同其他玩具分開存放，避免交叉感染</li>
</ul>

<h2>常見問題</h2>
<h3>後庭玩完會唔會鬆咗？</h3>
<p>唔會。後庭肌肉係彈性組織，適度使用唔會令佢永久鬆弛。極端情況（例如長期使用超大尺寸）先可能影響，正常玩法完全冇問題。</p>
<h3>玩後庭係咪一定污糟？</h3>
<p>只要事前排空 + 外部清潔，其實唔會特別污糟。如果想更安心可以灌腸，但係唔係必須。建議鋪條毛巾喺床，用完即洗。</p>
<h3>男仔玩後庭係咪 gay？</h3>
<p>唔係。男性後庭有前列腺（「男版 G 點」），刺激佢嘅快感同性取向無關。好多異性戀男性都鍾意前列腺按摩。</p>
<h3>第一次玩幾耐先可以放入？</h3>
<p>冇標準答案。重點係<strong>放鬆 + 大量潤滑 + 慢慢嚟</strong>。如果痛就停，唔好勉強。有啲人第一次就得，有啲人要試幾次先完全放鬆到。</p>

<p><a href="/products?category=storefront-anal">→ 去後庭用品分類頁</a>睇晒日本正貨新手款，全部有安全喇叭底座，香港倉庫現貨，順豐保密包裝到付。記住配埋<a href="/products?category=storefront-lotion">後庭專用潤滑液</a>一齊買。</p>
`,
  },
];

module.exports = postsPart2;

// 合併 + upsert 落 DB
const allPosts = [...posts, ...postsPart2];

(async () => {
  const client = await pool.connect();
  try {
    let inserted = 0, updated = 0;
    for (const p of allPosts) {
      const res = await client.query(
        `INSERT INTO blog_posts (title, slug, content, excerpt, status, publish_at, meta_title, meta_description, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'published', $5, $6, $7, NOW(), NOW())
         ON CONFLICT (slug) DO UPDATE SET
           title = EXCLUDED.title,
           content = EXCLUDED.content,
           excerpt = EXCLUDED.excerpt,
           status = 'published',
           publish_at = EXCLUDED.publish_at,
           meta_title = EXCLUDED.meta_title,
           meta_description = EXCLUDED.meta_description,
           updated_at = NOW()
         RETURNING (xmax = 0) AS inserted`,
        [p.title, p.slug, p.content, p.excerpt, p.publish_at, p.meta_title, p.meta_description]
      );
      if (res.rows[0] && res.rows[0].inserted) inserted++;
      else updated++;
      console.log(`${res.rows[0].inserted ? '➕' : '♻️ '} ${p.slug}`);
    }
    console.log(`\n✅ 完成：新增 ${inserted} 篇、更新 ${updated} 篇`);
  } finally {
    client.release();
    await pool.end();
  }
})().catch(e => { console.error('❌', e.message); process.exit(1); });

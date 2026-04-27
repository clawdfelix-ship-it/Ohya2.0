const express = require('express');
const path = require('path');
const sharp = require('sharp');
const fs = require('fs');
const https = require('https');

// Utilities
const { findLocalImage, generatePlaceholder, getRemoteUrl, toProxyUrl } = require('../utils/imageUtils');
const productDB = require('../utils/productLoader');

const app = express();

// Configure EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// M-ZAKKA 真實產品資料 - 爬取自 mzakka.com (36,178 產品總數，1000 樣本展示)
const products = productDB.getAllProducts(1, 1000).products;

// Full product database - uncomment if you have the full DB
/*
const products = [
  {
    id: 1,
    name: 'PRO-E クラシックシリーズ',
    category: 'PRO-E シリーズ',
    price: 29900,
    originalPrice: 39900,
    description: '先端部が奥から外へ掻き出すようなスライド運動により、既知の製品では成し得なかった"擦る～探る"事がついに可能に。開発に大きな飛躍をもたらす中核デバイス。日本 M-ZAKKA 原裝進口。',
    stock: 50,
    image: toProxyUrl('https://i.mzakka.com/imgs/00004013e83868c1ba4bf965a46f181f.jpg')
  },
  {
    id: 2,
    name: '狂也 極限刺激シリーズ',
    category: 'メンズケア',
    price: 39900,
    originalPrice: 49900,
    description: '狂也シリーズ究極の作品、かつてない刺激体験を提供、日本で大人気の商品。',
    stock: 30,
    image: toProxyUrl('https://i.mzakka.com/imgs/0000f651ca7f5f465c73eca0e513e5f0.jpg')
  },
  {
    id: 3,
    name: 'PRO-E 専用ローション',
    category: 'アクセサリー',
    price: 15900,
    originalPrice: 19900,
    description: 'PRO-E専用処方、みずみずしく洗い流しやすい、べたつかない、敏感肌にも適しています。',
    stock: 100,
    image: toProxyUrl('https://i.mzakka.com/imgs/0001c2100c5594aedb8c69799e0fa98b.jpg')
  },
*/

// Fallback sample products
const fallbackProducts = [
  {
    id: 4,
    name: 'PRO-E BACK 専用ケアクリーム',
    category: 'メンズケア',
    price: 18900,
    originalPrice: 23900,
    description: '特別処方、アナルケア専用設計、刺激が少なく長時間保湿。',
    stock: 60,
    image: toProxyUrl('https://i.mzakka.com/imgs/0001ee8b3058d246cab65138d1cb19a3.jpg')
  },
  {
    id: 5,
    name: 'PRO-E UNO ビギナーシリーズ',
    category: 'メンズケア',
    price: 34900,
    originalPrice: 44900,
    description: 'UNO入門シリーズ、初心者に最適、コストパフォーマンス最高、初めての方におすすめ。',
    stock: 45,
    image: toProxyUrl('https://i.mzakka.com/imgs/000273d1a908c0cd7437e3bb265ad99f.jpg')
  },
  {
    id: 6,
    name: 'PRO-E DUE デュアルシリーズ',
    category: 'アドバンス',
    price: 44900,
    originalPrice: 54900,
    description: 'デュアル効果処方、一度に二度の体験、上級者向けの選択肢。',
    stock: 25,
    image: toProxyUrl('https://i.mzakka.com/imgs/00027bfc21304a695458d96b403fb7c2.jpg')
  },
  {
    id: 7,
    name: 'Pro-E Maximum ストライカー',
    category: 'プレミアム',
    price: 59900,
    originalPrice: 74900,
    description: '究極のアタック型、Maximumシリーズ最強作品、上級者向けに設計。',
    stock: 15,
    image: toProxyUrl('https://i.mzakka.com/imgs/000303b134f3d2e9c3bf03a66aa6b95f.jpg')
  },
  {
    id: 8,
    name: 'Pro-E エクステンダーシリーズ',
    category: 'メンズケア',
    price: 37900,
    originalPrice: 47900,
    description: '独自の持続処方、より長く楽しめる、自信を高める必須アイテム。',
    stock: 35,
    image: toProxyUrl('https://i.mzakka.com/imgs/00031ee8c2766726eb0acbcd3d9fa673.jpg')
  },
  {
    id: 9,
    name: 'PRO-E TRE トップシリーズ',
    category: 'プレミアム',
    price: 69900,
    originalPrice: 89900,
    description: 'TREフラッグシップシリーズ、複数の特許技術を融合、最高級の体験を提供。',
    stock: 10,
    image: 'https://placehold.co/400x400/ec4899/ffffff?text=TRE+Premium'
  },
  {
    id: 10,
    name: 'MASTER-E マスターシリーズ',
    category: 'プレミアム',
    price: 79900,
    originalPrice: 99900,
    description: 'MASTER-Eマスターピース、長年の技術の集大成、プロユーザーから高い評価。',
    stock: 8,
    image: 'https://placehold.co/400x400/14b8a6/ffffff?text=MASTER-E'
  },
  {
    id: 11,
    name: '狂也 ヒート開発クリーム',
    category: 'メンズケア',
    price: 25900,
    originalPrice: 32900,
    description: 'ヒート処方、温感効果で血行を促進、感度を高めます。',
    stock: 40,
    image: 'https://placehold.co/400x400/f97316/ffffff?text=Heat+Cream'
  },
  {
    id: 12,
    name: '狂也 アナル開発シリーズ',
    category: 'アドバンス',
    price: 32900,
    originalPrice: 41900,
    description: 'アナル開発専用、低刺激処方、あらゆるレベルのユーザーに適しています。',
    stock: 55,
    image: 'https://placehold.co/400x400/a855f7/ffffff?text=Back+Series'
  },
  {
    id: 13,
    name: "MEN'S MANZOKU プレミアムローション",
    category: 'アクセサリー',
    price: 19900,
    originalPrice: 25900,
    description: 'MANZOKUブランドクラシック、長時間持続、洗い流しやすい、香港男性に大人気。',
    stock: 80,
    image: 'https://placehold.co/400x400/06b6d4/ffffff?text=MANZOKU+Lotion'
  },
  {
    id: 14,
    name: 'PRO-E ワセリン D.B',
    category: 'アクセサリー',
    price: 12900,
    originalPrice: 16900,
    description: '高純度ワセリン、多目的に使用可能、保湿・保護効果、必須ケア製品。',
    stock: 120,
    image: 'https://placehold.co/400x400/84cc16/ffffff?text=Vaseline+DB'
  },
  {
    id: 15,
    name: 'PRO-E GOLD ゴールドエディション',
    category: 'プレミアム',
    price: 49900,
    originalPrice: 62900,
    description: 'ゴールドアップグレード版PRO-E、ゴールデン処方で昇華された体験を、リピーター必見。',
    stock: 20,
    image: 'https://placehold.co/400x400/eab308/333333?text=GOLD+Edition'
  },
  {
    id: 16,
    name: 'MASTER-E ハンドラーコントロール',
    category: 'アドバンス',
    price: 45900,
    originalPrice: 57900,
    description: 'MASTER-E専用アクセサリー、操作性を向上、より精密な体験を提供。',
    stock: 22,
    image: 'https://placehold.co/400x400/64748b/ffffff?text=Handler'
  },
  {
    id: 17,
    name: 'M-ZAKKA コンプリートセット',
    category: 'お得セット',
    price: 149900,
    originalPrice: 199900,
    description: 'M-ZAKKA最人気の5製品を一度に手に入れる、超お得なセット、最大¥500割引！',
    stock: 5,
    image: 'https://placehold.co/400x400/be123c/ffffff?text=FULL+SET'
  }
];

// 19 Categories total for Japanese e-commerce style dense navigation
const categories = [
  { id: 1, name: '全部商品', count: 17 },
  { id: 2, name: 'メンズケア', count: 8 },
  { id: 3, name: 'アクセサリー', count: 4 },
  { id: 4, name: 'アドバンス', count: 3 },
  { id: 5, name: 'プレミアム', count: 4 },
  { id: 6, name: 'お得セット', count: 1 },
  { id: 7, name: '新着商品', count: 3 },
  { id: 8, name: '人気ランキング', count: 5 },
  { id: 9, name: 'タイムセール', count: 4 },
  { id: 10, name: 'PRO-Eシリーズ', count: 6 },
  { id: 11, name: 'MASTER-Eシリーズ', count: 2 },
  { id: 12, name: '狂也シリーズ', count: 3 },
  { id: 13, name: 'MANZOKUシリーズ', count: 1 },
  { id: 14, name: 'ローション類', count: 4 },
  { id: 15, name: 'クリーム類', count: 3 },
  { id: 16, name: 'ビギナー向け', count: 3 },
  { id: 17, name: '上級者向け', count: 5 },
  { id: 18, name: '数量限定', count: 4 },
  { id: 19, name: 'ブランド一覧', count: 6 }
];

// Helper function - format price
function formatPrice(price) {
  return '¥' + (price / 100).toFixed(0);
}

// Helper function - get category name
function getCategoryName(categoryId) {
  const cat = categories.find(c => c.name === categoryId);
  return cat ? cat.name : categoryId;
}

// ===== Image Proxy Endpoint =====
// Serves 235k+ M-ZAKKA product images - checks local filesystem first, then remote proxy
app.get('/image/:hash', async (req, res) => {
  const { hash } = req.params;
  const { w, h } = req.query;
  
  // Validate hash format (MD5 is 32 hex chars)
  if (!/^[a-f0-9]{32}$/i.test(hash)) {
    return res.status(400).send('Invalid image hash');
  }
  
  try {
    let imageBuffer;
    let contentType = 'image/jpeg';
    
    // 1. First try local filesystem
    const localPath = findLocalImage(hash);
    if (localPath) {
      imageBuffer = fs.readFileSync(localPath);
      // Detect content type from extension
      if (localPath.endsWith('.png')) contentType = 'image/png';
      else if (localPath.endsWith('.webp')) contentType = 'image/webp';
      else if (localPath.endsWith('.gif')) contentType = 'image/gif';
    }
    
    // 2. Fallback to remote proxy
    if (!imageBuffer) {
      const remoteUrl = getRemoteUrl(hash);
      imageBuffer = await fetchRemoteImage(remoteUrl);
    }
    
    // 3. Resize if requested using sharp
    if ((w || h) && imageBuffer) {
      const width = w ? parseInt(w) : undefined;
      const height = h ? parseInt(h) : undefined;
      
      // Validate dimensions
      if ((width && isNaN(width)) || (height && isNaN(height))) {
        return res.status(400).send('Invalid dimensions');
      }
      
      // Limit maximum dimensions to prevent abuse
      const maxDim = 2000;
      const safeWidth = width ? Math.min(width, maxDim) : undefined;
      const safeHeight = height ? Math.min(height, maxDim) : undefined;
      
      imageBuffer = await sharp(imageBuffer)
        .resize(safeWidth, safeHeight, {
          fit: 'cover',
          withoutEnlargement: true
        })
        .jpeg({ quality: 85, progressive: true })
        .toBuffer();
      
      contentType = 'image/jpeg';
    }
    
    // 4. Set caching headers and send response
    if (imageBuffer) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.setHeader('Content-Type', contentType);
      return res.send(imageBuffer);
    }
    
  } catch (error) {
    console.warn(`Image proxy error for ${hash}:`, error.message);
  }
  
  // 5. Final fallback: SVG placeholder
  const svg = generatePlaceholder('M-ZAKKA', w ? parseInt(w) : 400, h ? parseInt(h) : 400);
  res.setHeader('Cache-Control', 'public, max-age=31536000');
  res.setHeader('Content-Type', 'image/svg+xml');
  res.send(svg);
});

/**
 * Fetch image from remote URL
 * @param {string} url - Remote image URL
 * @returns {Promise<Buffer>} Image buffer
 */
function fetchRemoteImage(url) {
  return new Promise((resolve, reject) => {
    https.get(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
        'Referer': 'https://mzakka.com/'
      },
      timeout: 10000
    }, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }
      
      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => resolve(Buffer.concat(chunks)));
    }).on('error', reject)
      .setTimeout(10000, function() {
        this.destroy();
        reject(new Error('Timeout'));
      });
  });
}

// ROUTES

// ホームページ
app.get('/', (req, res) => {
  const featuredProducts = products.slice(0, 8);
  res.render('index', {
    title: 'M-ZAKKA - 大人気メンズケア通販',
    products: featuredProducts,
    categories: categories,
    user: null,
    formatPrice: formatPrice
  });
});

// 商品一覧ページ
app.get('/products', (req, res) => {
  const categoryFilter = req.query.category;
  let filteredProducts = products;
  
  if (categoryFilter && categoryFilter !== '全部商品') {
    filteredProducts = products.filter(p => p.category === categoryFilter);
  }
  
  res.render('products', {
    title: '商品一覧 - M-ZAKKA',
    products: filteredProducts,
    categories: categories,
    user: null,
    formatPrice: formatPrice,
    selectedCategory: categoryFilter || '全部商品'
  });
});

// 商品詳細ページ
app.get('/product/:id', (req, res) => {
  const product = products.find(p => p.id === parseInt(req.params.id));
  if (!product) {
    return res.redirect('/products');
  }
  
  const relatedProducts = products
    .filter(p => p.category === product.category && p.id !== product.id)
    .slice(0, 4);
  
  res.render('product', {
    title: product.name + ' - M-ZAKKA',
    product: product,
    relatedProducts: relatedProducts,
    user: null,
    formatPrice: formatPrice
  });
});

// ログインページ
app.get('/login', (req, res) => {
  res.render('login', {
    title: 'ログイン - M-ZAKKA',
    user: null
  });
});

// 新規登録ページ
app.get('/register', (req, res) => {
  res.render('register', {
    title: '新規会員登録 - M-ZAKKA',
    user: null
  });
});

// カートページ
app.get('/cart', (req, res) => {
  res.render('cart', {
    title: 'ショッピングカート - M-ZAKKA',
    user: null,
    formatPrice: formatPrice
  });
});

// キャッチオール - ホームにリダイレクト
app.get('*', (req, res) => {
  res.redirect('/');
});

module.exports = app;

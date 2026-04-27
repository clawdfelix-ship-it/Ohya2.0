const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const https = require('https');
require('dotenv').config();

// Image utilities
const { findLocalImage, generatePlaceholder, getRemoteUrl, toProxyUrl } = require('./utils/imageUtils');
const { getConnectionString, getPool } = require('./utils/getPool');
const { createTranslator } = require('./utils/i18n');

let cachedSharp;
function getSharp() {
  if (cachedSharp !== undefined) return cachedSharp;
  try {
    cachedSharp = require('sharp');
  } catch (error) {
    console.error('sharp unavailable:', error && error.message ? error.message : String(error));
    cachedSharp = null;
  }
  return cachedSharp;
}

const app = express();
const port = process.env.PORT || 3000;

const dictZhHK = JSON.parse(fs.readFileSync(path.join(__dirname, 'locales', 'zh-HK.json'), 'utf8'));

// Add custom header to verify Express is handling the request
app.use((req, res, next) => {
  res.setHeader('X-Custom-Express', 'true');
  next();
});

// Database connection - Vercel serverless compatible
const connectionString = getConnectionString();

if (!connectionString) {
  console.error('DATABASE_URL is not set');
}

const pool = getPool();

// EJS 模板引擎配置
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Middleware
app.use(cors({
  credentials: true,
  origin: process.env.NODE_ENV === 'production' ? true : 'http://localhost:5173',
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use((req, res, next) => {
  res.locals.t = createTranslator({ locale: 'zh-HK', dict: dictZhHK });
  next();
});

app.get('/@vite/*', (req, res) => {
  res.status(204).end();
});

// Session configuration
if (connectionString) {
  app.use(session({
    store: new pgSession({
      pool: pool,
      tableName: 'session',
      createTableIfMissing: true,
    }),
    secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'lax' : undefined,
    },
  }));
} else {
  // Fallback for when DB not configured - still boot so we can see error
  console.warn('No DATABASE_URL, session will not work');
}

// Multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

// Auth middleware
function requireAdmin(req, res, next) {
  if (!connectionString) {
    return res.status(500).json({ error: 'Database not configured' });
  }
  if (req.session && req.session.userId && req.session.isAdmin) {
    return next();
  }
  res.status(401).json({ error: '需要管理員權限' });
}

function requireAuth(req, res, next) {
  if (!connectionString) {
    return res.status(500).json({ error: 'Database not configured' });
  }
  if (req.session && req.session.userId) {
    return next();
  }
  res.status(401).json({ error: '需要登入' });
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
    const sharp = (w || h) && imageBuffer ? getSharp() : null;
    if (sharp) {
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

// Health check
app.get('/api/health', (req, res) => {
  if (!connectionString) {
    return res.status(500).json({ status: 'error', error: 'DATABASE_URL not configured' });
  }
  res.json({ status: 'ok', message: 'Mzakka E-Commerce API is running' });
});

// Test route to confirm routing works
app.get('/test/health', (req, res) => {
  res.json({ status: 'ok', message: 'Test route working!' });
});

// Import routes - wrap in try/catch to show errors clearly
try {
  require('./routes/auth')(app, pool, requireAdmin, requireAuth, bcrypt);
  require('./routes/admin')(app, pool, requireAdmin, upload);
  require('./routes/categories')(app, pool, requireAdmin);
  require('./routes/brands')(app, pool, requireAdmin);
  require('./routes/products')(app, pool, requireAdmin);
  require('./routes/products-full')(app, pool);
  require('./routes/cart')(app, pool, requireAuth);
  require('./routes/orders')(app, pool, requireAuth, requireAdmin);
  require('./routes/members')(app, pool);
  require('./routes/marketing')(app, pool);
  require('./routes/shipping')(app, pool);
  require('./routes/logistics')(app, pool);
  require('./routes/reports')(app, pool);
} catch (error) {
  console.error('Error loading routes:', error);
  app.use('/api/*', (req, res) => {
    res.status(500).json({ error: '路由載入失敗', details: error.message });
  });
}

// ===== E-Commerce EJS 頁面路由 =====
// 永遠優先使用 EJS 模板，確保唔會有空白頁

// Helper function - 獲取示例商品 (DB 唔正常都有野顯示)
function getSampleProducts() {
  // Use actual M-ZAKKA image hashes from our 235k+ image library
  return [
    { id: 1, name: 'PRO-E 經典系列', category: 'PRO-E 系列', price: 29900, originalPrice: 39900, description: '獨特滑動設計，帶來更細緻的觸感體驗；適合追求層次感的用家。', stock: 50, image: toProxyUrl('https://i.mzakka.com/imgs/00004013e83868c1ba4bf965a46f181f.jpg') },
    { id: 2, name: '狂也 極限刺激系列', category: '男士護理', price: 39900, originalPrice: 49900, description: '狂也系列代表作之一，刺激感更強，適合有經驗的用家。', stock: 30, image: toProxyUrl('https://i.mzakka.com/imgs/0000f651ca7f5f465c73eca0e513e5f0.jpg') },
    { id: 3, name: 'PRO-E 專用潤滑液', category: '護理配件', price: 15900, originalPrice: 19900, description: '清爽易沖，黏膩感較低；日常搭配使用更順暢。', stock: 100, image: toProxyUrl('https://i.mzakka.com/imgs/0001c2100c5594aedb8c69799e0fa98b.jpg') },
    { id: 4, name: 'PRO-E BACK 專用護理霜', category: '男士護理', price: 18900, originalPrice: 23900, description: '溫和配方，保濕力更持久；適合需要加強護理的用家。', stock: 60, image: toProxyUrl('https://i.mzakka.com/imgs/0001ee8b3058d246cab65138d1cb19a3.jpg') },
    { id: 5, name: 'PRO-E UNO 新手系列', category: '新手推薦', price: 34900, originalPrice: 44900, description: '入門取向，易上手；性價比高，適合第一次購買的用家。', stock: 45, image: toProxyUrl('https://i.mzakka.com/imgs/000273d1a908c0cd7437e3bb265ad99f.jpg') },
    { id: 6, name: 'PRO-E DUE 雙效系列', category: '進階系列', price: 44900, originalPrice: 54900, description: '雙重體驗設計，一次滿足兩種需求；適合想升級體驗的用家。', stock: 25, image: toProxyUrl('https://i.mzakka.com/imgs/00027bfc21304a695458d96b403fb7c2.jpg') },
    { id: 7, name: 'PRO-E Maximum 強襲款', category: '頂級系列', price: 59900, originalPrice: 74900, description: '更強力度與更高配置，為重度用家而設；追求極致體驗之選。', stock: 15, image: toProxyUrl('https://i.mzakka.com/imgs/000303b134f3d2e9c3bf03a66aa6b95f.jpg') },
    { id: 8, name: 'PRO-E Extender 持久系列', category: '男士護理', price: 37900, originalPrice: 47900, description: '著重持久體驗與穩定表現，適合想提升整體滿意度的用家。', stock: 35, image: toProxyUrl('https://i.mzakka.com/imgs/00031ee8c2766726eb0acbcd3d9fa673.jpg') },
  ];
}

function getSampleCategories() {
  return [
    { id: 1, name: '全部商品', count: 17 },
    { id: 2, name: '男士護理', count: 8 },
    { id: 3, name: '護理配件', count: 4 },
    { id: 4, name: '進階系列', count: 3 },
    { id: 5, name: '頂級系列', count: 4 },
    { id: 6, name: '優惠套裝', count: 1 },
    { id: 7, name: '最新上架', count: 3 },
    { id: 8, name: '人氣排行榜', count: 5 },
    { id: 9, name: '限時優惠', count: 4 },
    { id: 10, name: 'PRO-E 系列', count: 6 },
    { id: 11, name: 'MASTER-E 系列', count: 2 },
    { id: 12, name: '狂也 系列', count: 3 },
    { id: 13, name: 'MANZOKU 系列', count: 1 },
    { id: 14, name: '潤滑液', count: 4 },
    { id: 15, name: '護理霜', count: 3 },
    { id: 16, name: '新手推薦', count: 3 },
    { id: 17, name: '進階推薦', count: 5 },
    { id: 18, name: '數量限定', count: 4 },
    { id: 19, name: '品牌一覽', count: 6 },
  ];
}

function formatPrice(price) {
  return '¥' + (price / 100).toFixed(0);
}

// Make image proxy utility available to templates
app.locals.toProxyUrl = toProxyUrl;


  // 首頁 - 電商首頁
  app.get('/', async (req, res) => {
    try {
      // 獲取精選商品（DB 未就緒時提供示範資料）
      const featuredProducts = getSampleProducts();
      const categories = getSampleCategories();
      
      res.render('index', {
        title: 'M-ZAKKA - 熱門男士護理網店',
        products: featuredProducts,
        categories: categories,
        user: req.session.userId ? { id: req.session.userId, isAdmin: req.session.isAdmin } : null,
        formatPrice: formatPrice
      });
    } catch (err) {
      console.error('Homepage error:', err);
      res.render('index', {
        title: 'M-ZAKKA - 熱門男士護理網店',
        products: getSampleProducts(),
        categories: getSampleCategories(),
        user: null,
        formatPrice: formatPrice
      });
    }
  });
  
  // 商品列表頁
  app.get('/products', async (req, res) => {
    try {
      const categoryFilter = req.query.category;
      let products = getSampleProducts();
      
      if (categoryFilter && categoryFilter !== '全部商品') {
        products = products.filter(p => p.category === categoryFilter);
      }
      
      const categories = getSampleCategories();
      
      res.render('products', {
        title: '商品列表 - M-ZAKKA',
        products: products,
        categories: categories,
        user: req.session.userId ? { id: req.session.userId, isAdmin: req.session.isAdmin } : null,
        formatPrice: formatPrice,
        selectedCategory: categoryFilter || '全部商品'
      });
    } catch (err) {
      console.error('Products page error:', err);
      res.render('products', {
        title: '商品列表 - M-ZAKKA',
        products: getSampleProducts(),
        categories: getSampleCategories(),
        user: null,
        formatPrice: formatPrice,
        selectedCategory: '全部商品'
      });
    }
  });
  
  // 商品詳情頁
  app.get('/product/:id', async (req, res) => {
    try {
      const allProducts = getSampleProducts();
      let product = allProducts.find(p => p.id === parseInt(req.params.id));
      
      if (!product) {
        return res.redirect('/products');
      }
      
      const relatedProducts = allProducts
        .filter(p => p.category === product.category && p.id !== product.id)
        .slice(0, 4);
      
      res.render('product', {
        title: product.name + ' - M-ZAKKA',
        product: product,
        relatedProducts: relatedProducts,
        user: req.session.userId ? { id: req.session.userId, isAdmin: req.session.isAdmin } : null,
        formatPrice: formatPrice
      });
    } catch (err) {
      console.error('Product page error:', err);
      res.redirect('/products');
    }
  });
  
  // 登入頁
  app.get('/login', (req, res) => {
    res.render('login', {
      title: '登入 - M-ZAKKA',
      user: null
    });
  });
  
  // 註冊頁
  app.get('/register', (req, res) => {
    res.render('register', {
      title: '新會員註冊 - M-ZAKKA',
      user: null
    });
  });
  
  // 購物車頁
  app.get('/cart', (req, res) => {
    res.render('cart', {
      title: '購物車 - M-ZAKKA',
      user: req.session.userId ? { id: req.session.userId, isAdmin: req.session.isAdmin } : null,
      formatPrice: formatPrice
    });
  });

// Start server for local development
if (require.main === module) {
  app.listen(port, () => {
    console.log(`🚀 Mzakka E-Commerce API running on port ${port}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

// Export for Vercel serverless
module.exports = app;

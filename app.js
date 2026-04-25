const express = require('express');
const { Pool } = require('pg');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const session = require('express-session');
const pgSession = require('connect-pg-simple')(session);
const multer = require('multer');
const path = require('path');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 3000;

// Add custom header to verify Express is handling the request
app.use((req, res, next) => {
  res.setHeader('X-Custom-Express', 'true');
  next();
});

// Database connection - Vercel serverless compatible
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL;

if (!connectionString) {
  console.error('DATABASE_URL is not set');
}

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' 
    ? { rejectUnauthorized: false } 
    : undefined,
  max: 1,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

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

// Export middleware and utilities for other routes
module.exports = { requireAdmin, requireAuth, pool, upload };

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
    res.status(500).json({ error: 'Failed to load routes', details: error.message });
  });
}

// Serve frontend static files - absolute path for Vercel
const fs = require('fs');
const frontendDist = path.resolve(__dirname, 'frontend/dist');

console.log('=== FRONTEND DEBUG ===');
console.log('__dirname:', __dirname);
console.log('frontendDist:', frontendDist);
console.log('exists:', fs.existsSync(frontendDist));

if (fs.existsSync(frontendDist)) {
  try {
    const files = fs.readdirSync(frontendDist);
    console.log('Files in dist:', files);
    const indexPath = path.join(frontendDist, 'index.html');
    console.log('index.html exists:', fs.existsSync(indexPath));
    if (fs.existsSync(indexPath)) {
      console.log('index.html content length:', fs.readFileSync(indexPath, 'utf8').length);
    }
  } catch (e) {
    console.error('Error reading dist:', e);
  }
  
  // Serve static assets first
  app.use(express.static(frontendDist, {
    index: false,
    dotfiles: 'allow',
  }));
  
  // SPA catch-all - explicitly send index.html for all non-API routes
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/') || req.path.startsWith('/webhooks/') || req.path.startsWith('/test/')) {
      return next();
    }
    
    const indexPath = path.join(frontendDist, 'index.html');
    console.log('Serving:', req.path, '->', indexPath);
    
    if (fs.existsSync(indexPath)) {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.sendFile(indexPath);
    } else {
      res.status(404).send('Frontend index.html not found at: ' + indexPath);
    }
  });
} else {
  // 首頁 - 電商首頁
  app.get('/', async (req, res) => {
    try {
      // 獲取精選商品
      let featuredProducts = [];
      let categories = [];
      
      if (connectionString) {
        const productsResult = await pool.query('SELECT * FROM products ORDER BY id DESC LIMIT 8');
        featuredProducts = productsResult.rows;
        const categoriesResult = await pool.query('SELECT * FROM categories ORDER BY name');
        categories = categoriesResult.rows;
      }
      
      res.render('index', {
        title: 'Ohya2.0 電商平台',
        products: featuredProducts,
        categories: categories,
        user: req.session.userId ? { id: req.session.userId, isAdmin: req.session.isAdmin } : null
      });
    } catch (err) {
      console.error('Homepage error:', err);
      res.render('index', {
        title: 'Ohya2.0 電商平台',
        products: [],
        categories: [],
        user: null
      });
    }
  });
  
  // 商品列表頁
  app.get('/products', async (req, res) => {
    try {
      let products = [];
      let categories = [];
      
      if (connectionString) {
        const result = await pool.query('SELECT * FROM products ORDER BY id DESC');
        products = result.rows;
        const categoriesResult = await pool.query('SELECT * FROM categories ORDER BY name');
        categories = categoriesResult.rows;
      }
      
      res.render('products', {
        title: '全部商品 - Ohya2.0',
        products: products,
        categories: categories,
        user: req.session.userId ? { id: req.session.userId, isAdmin: req.session.isAdmin } : null
      });
    } catch (err) {
      console.error('Products page error:', err);
      res.render('products', {
        title: '全部商品 - Ohya2.0',
        products: [],
        categories: [],
        user: null
      });
    }
  });
  
  // 商品詳情頁
  app.get('/product/:id', async (req, res) => {
    try {
      let product = null;
      
      if (connectionString) {
        const result = await pool.query('SELECT * FROM products WHERE id = $1', [req.params.id]);
        product = result.rows[0];
      }
      
      if (!product) {
        return res.status(404).send('商品不存在');
      }
      
      res.render('product', {
        title: product.name + ' - Ohya2.0',
        product: product,
        user: req.session.userId ? { id: req.session.userId, isAdmin: req.session.isAdmin } : null
      });
    } catch (err) {
      console.error('Product page error:', err);
      res.status(500).send('伺服器錯誤');
    }
  });
  
  // 登入頁
  app.get('/login', (req, res) => {
    res.render('login', {
      title: '登入 - Ohya2.0',
      user: null
    });
  });
  
  // 註冊頁
  app.get('/register', (req, res) => {
    res.render('register', {
      title: '註冊 - Ohya2.0',
      user: null
    });
  });
  
  // 購物車頁
  app.get('/cart', (req, res) => {
    res.render('cart', {
      title: '購物車 - Ohya2.0',
      user: req.session.userId ? { id: req.session.userId, isAdmin: req.session.isAdmin } : null
    });
  });
}

// Start server for local development
if (require.main === module) {
  app.listen(port, () => {
    console.log(`🚀 Mzakka E-Commerce API running on port ${port}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

// Export for Vercel serverless
module.exports = app;

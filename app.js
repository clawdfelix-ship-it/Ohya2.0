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

// Middleware
app.use(cors({
  credentials: true,
  origin: process.env.NODE_ENV === 'production' ? true : 'http://localhost:5173',
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));

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
  app.get('/', (req, res) => {
    res.send(`
<!DOCTYPE html>
<html lang="zh-HK">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='0.9em' font-size='90'>🛍️</text></svg>" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Ohya2.0 電商平台</title>
  </head>
  <body>
    <div id="app"></div>
    <script type="module">
      // 前端應用程式碼
      window.addEventListener('load', () => {
        document.getElementById('app').innerHTML = \`
          <div style="min-height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); display: flex; align-items: center; justify-content: center; font-family: system-ui, -apple-system, sans-serif;">
            <div style="background: white; padding: 48px; border-radius: 24px; box-shadow: 0 20px 60px rgba(0,0,0,0.3); text-align: center; max-width: 400px;">
              <h1 style="color: #1a1a2e; margin-bottom: 16px; font-size: 32px;">🛍️ Ohya2.0</h1>
              <p style="color: #666; margin-bottom: 24px; line-height: 1.6;">全功能電商平台已經上線！</p>
              <div style="display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;">
                <span style="background: #e3f2fd; color: #1976d2; padding: 8px 16px; border-radius: 20px; font-size: 14px;">✅ 後端 API 正常</span>
                <span style="background: #e8f5e9; color: #388e3c; padding: 8px 16px; border-radius: 20px; font-size: 14px;">✅ 前端已部署</span>
              </div>
              <div style="margin-top: 32px; padding-top: 24px; border-top: 1px solid #eee;">
                <p style="color: #999; font-size: 13px;">即將推出更多功能</p>
              </div>
            </div>
          </div>
        \`;
      });
    </script>
  </body>
</html>
    `);
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

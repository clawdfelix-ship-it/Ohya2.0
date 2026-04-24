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

// Database connection - configured for Vercel serverless
const connectionString = process.env.DATABASE_URL || process.env.POSTGRES_URL || '';
if (!connectionString) {
  console.error('⚠️  DATABASE_URL/POSTGRES_URL not set in environment');
  // Don't exit immediately for Vercel, let it handle error response
}

const pool = new Pool({
  connectionString,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
  max: 1, // Vercel serverless uses one connection per invocation
  idleTimeoutMillis: 30000,
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

// Multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({ storage, limits: { fileSize: 10 * 1024 * 1024 } }); // 10MB limit

// Auth middleware
function requireAdmin(req, res, next) {
  if (req.session && req.session.userId && req.session.isAdmin) {
    return next();
  }
  res.status(401).json({ error: '需要管理員權限' });
}

function requireAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  res.status(401).json({ error: '需要登入' });
}

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', message: 'Mzakka E-Commerce API is running' });
});

// Export middleware for other routes
module.exports = { requireAdmin, requireAuth };

// Import routes
require('./api/auth')(app, pool, requireAdmin, requireAuth, bcrypt);
require('./api/admin')(app, pool, requireAdmin);
require('./api/categories')(app, pool, requireAdmin);
require('./api/brands')(app, pool, requireAdmin);
require('./api/products')(app, pool, requireAdmin);
require('./api/products-full')(app, pool);
require('./api/cart')(app, pool, requireAuth);
require('./api/orders')(app, pool, requireAuth, requireAdmin);
require('./api/members')(app, pool);
require('./api/marketing')(app, pool);
require('./api/shipping')(app, pool);
require('./api/logistics')(app, pool);
require('./api/reports')(app, pool);

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, 'frontend/dist')));
  app.get('*', (req, res) => {
    res.sendFile(path.join(__dirname, 'frontend/dist/index.html'));
  });
}

// Start server (only for local development)
if (process.env.NODE_ENV !== 'production' || require.main === module) {
  app.listen(port, () => {
    console.log(`🚀 Mzakka E-Commerce API running on port ${port}`);
    console.log(`📊 Environment: ${process.env.NODE_ENV || 'development'}`);
  });
}

// Export for Vercel serverless
module.exports = app;

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

// Serve frontend if it exists (Vercel will build it during deployment)
const fs = require('fs');
const frontendDist = path.join(__dirname, 'frontend/dist');

console.log('Checking frontend dist at:', frontendDist);
console.log('Directory exists:', fs.existsSync(frontendDist));

if (fs.existsSync(frontendDist)) {
  console.log('Serving frontend from:', frontendDist);
  app.use(express.static(frontendDist));
  
  // SPA catch-all route - serve index.html for all non-API requests
  app.get('*', (req, res) => {
    if (!req.path.startsWith('/api/') && !req.path.startsWith('/webhooks/') && !req.path.startsWith('/test/')) {
      const indexPath = path.join(frontendDist, 'index.html');
      console.log('Serving index.html from:', indexPath);
      res.sendFile(indexPath);
    } else {
      // Let API routes handle their own 404
      res.status(404).json({ error: 'Endpoint not found' });
    }
  });
} else {
  // No frontend built yet - show diagnostic info
  app.get('/', (req, res) => {
    res.json({ 
      status: 'ok', 
      message: 'Mzakka E-Commerce API is running',
      frontendDist: frontendDist,
      frontendExists: fs.existsSync(frontendDist),
      nodeEnv: process.env.NODE_ENV || 'not set'
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

module.exports = function(app, pool, requireAdmin, upload) {

  // Dashboard statistics
  app.get('/api/admin/dashboard', requireAdmin, async (req, res) => {
    try {
      const [usersResult, productsResult, categoriesResult, ordersResult, pendingOrdersResult] = await Promise.all([
        pool.query('SELECT COUNT(*) as count FROM users'),
        pool.query('SELECT COUNT(*) as count FROM products WHERE status = \'active\''),
        pool.query('SELECT COUNT(*) as count FROM categories WHERE status = \'active\''),
        pool.query('SELECT COUNT(*) as count FROM orders'),
        pool.query('SELECT COUNT(*) as count FROM orders WHERE status = \'pending\'')
      ]);

      // Get recent orders
      const recentOrders = await pool.query(`
        SELECT o.*, u.username
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        ORDER BY o.created_at DESC
        LIMIT 5
      `);

      res.json({
        stats: {
          users: parseInt(usersResult.rows[0].count),
          products: parseInt(productsResult.rows[0].count),
          categories: parseInt(categoriesResult.rows[0].count),
          orders: parseInt(ordersResult.rows[0].count),
          pending_orders: parseInt(pendingOrdersResult.rows[0].count)
        },
        recent_orders: recentOrders.rows
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Get single user (admin)
  app.get('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query(
        'SELECT id, username, is_admin, contact, created_at, entries_count FROM users WHERE id = $1',
        [id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: '用戶不存在' });
      }

      // Get user's orders count
      const ordersCount = await pool.query('SELECT COUNT(*) as count FROM orders WHERE user_id = $1', [id]);

      res.json({
        user: result.rows[0],
        orders_count: parseInt(ordersCount.rows[0].count)
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Update user (admin)
  app.put('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { is_admin, contact } = req.body;

      const result = await pool.query(`
        UPDATE users
        SET is_admin = $1, contact = $2, updated_at = NOW()
        WHERE id = $3
        RETURNING id, username, is_admin, contact, created_at
      `, [is_admin, contact || null, id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: '用戶不存在' });
      }

      res.json({ success: true, user: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Delete user (admin) - prevent deleting self
  app.delete('/api/admin/users/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const currentUserId = req.session.userId;

      if (parseInt(id) === currentUserId) {
        return res.status(400).json({ error: '不能刪除自己嘅賬戶' });
      }

      const result = await pool.query('DELETE FROM users WHERE id = $1 RETURNING *', [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: '用戶不存在' });
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Create admin user (only existing admin can do this)
  app.post('/api/admin/users', requireAdmin, async (req, res) => {
    try {
      const { username, password, is_admin, contact } = req.body;

      if (!username || !password || password.length < 6) {
        return res.status(400).json({ error: '用戶名至少 6 位，密碼至少 6 位' });
      }

      const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: '用戶名已存在' });
      }

      const bcrypt = require('bcryptjs');
      const passwordHash = await bcrypt.hash(password, 10);

      const result = await pool.query(`
        INSERT INTO users (username, password_hash, contact, is_admin)
        VALUES ($1, $2, $3, $4)
        RETURNING id, username, is_admin, contact, created_at
      `, [username, passwordHash, contact || null, is_admin || false]);

      res.json({ success: true, user: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Upload image (for product images)
  // Returns image path that can be stored in product
  app.post('/api/admin/upload', requireAdmin, upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: '沒有上傳檔案' });
      }

      // In production Vercel, you'd typically upload to S3/Cloudinary
      // For self-hosted, save to public/images
      const fs = require('fs');
      const path = require('path');

      const fileName = `${Date.now()}-${Math.round(Math.random() * 10000)}-${req.file.originalname.replace(/\s+/g, '-')}`;
      const uploadPath = path.join(__dirname, '../public/images', fileName);

      fs.writeFileSync(uploadPath, req.file.buffer);

      // Return public URL
      const imageUrl = `/images/${fileName}`;
      res.json({ success: true, url: imageUrl });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '上傳失敗' });
    }
  });

  // Change user password (admin)
  app.post('/api/admin/users/:id/password', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { new_password } = req.body;

      if (!new_password || new_password.length < 6) {
        return res.status(400).json({ error: '密碼至少 6 位' });
      }

      const bcrypt = require('bcryptjs');
      const passwordHash = await bcrypt.hash(new_password, 10);

      const result = await pool.query(
        'UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2 RETURNING id, username',
        [passwordHash, id]
      );

      if (result.rows.length === 0) {
        return res.status(404).json({ error: '用戶不存在' });
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Get low stock products (stock <= 10)
  app.get('/api/admin/products/low-stock', requireAdmin, async (req, res) => {
    try {
      const threshold = parseInt(req.query.threshold) || 10;
      const result = await pool.query(`
        SELECT p.*, c.name as category_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.stock <= $1 AND p.status = 'active'
        ORDER BY p.stock ASC
      `, [threshold]);

      res.json({ products: result.rows, threshold });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Export products to CSV (admin)
  app.get('/api/admin/products/export/csv', requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT p.id, p.name, p.slug, p.price, p.original_price, p.stock, 
               c.name as category_name, p.status, p.created_at
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        ORDER BY p.created_at DESC
      `);

      // Build CSV
      let csv = 'ID,Name,Slug,Price,Original Price,Stock,Category,Status,Created At\n';
      result.rows.forEach(row => {
        // Escape commas and quotes
        const escape = (val) => {
          if (val === null) return '';
          const str = String(val);
          if (str.includes(',') || str.includes('"')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };
        csv += Object.values(row).map(escape).join(',') + '\n';
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', 'attachment; filename="products-' + new Date().toISOString().slice(0, 10) + '.csv"');
      res.send(csv);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Sales statistics by date range
  app.get('/api/admin/stats/sales', requireAdmin, async (req, res) => {
    try {
      const { start_date, end_date } = req.query;
      let where = '1=1';
      let params = [];

      if (start_date) {
        where += ` AND created_at >= $${params.length + 1}`;
        params.push(start_date);
      }
      if (end_date) {
        where += ` AND created_at <= $${params.length + 1}`;
        params.push(end_date);
      }

      const totalResult = await pool.query(`
        SELECT COUNT(*) as total_orders, COALESCE(SUM(total_amount), 0) as total_revenue
        FROM orders
        WHERE ${where} AND status != 'cancelled'
      `, params);

      const statusResult = await pool.query(`
        SELECT status, COUNT(*) as count, COALESCE(SUM(total_amount), 0) as revenue
        FROM orders
        WHERE ${where} AND status != 'cancelled'
        GROUP BY status
        ORDER BY count DESC
      `, params);

      res.json({
        total_orders: parseInt(totalResult.rows[0].total_orders),
        total_revenue: parseFloat(totalResult.rows[0].total_revenue),
        by_status: statusResult.rows
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

};

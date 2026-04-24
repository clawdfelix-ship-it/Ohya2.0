module.exports = function(app, pool, requireAdmin) {

  // Get all categories (public)
  app.get('/api/categories', async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT c.*, COUNT(p.id) as product_count
        FROM categories c
        LEFT JOIN products p ON c.id = p.category_id AND p.status = 'active'
        WHERE c.status = 'active'
        GROUP BY c.id
        ORDER BY c.sort_order ASC, c.name ASC
      `);
      res.json({ categories: result.rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Get single category
  app.get('/api/categories/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query('SELECT * FROM categories WHERE id = $1', [id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: '分類不存在' });
      }
      res.json({ category: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Create category (admin)
  app.post('/api/admin/categories', requireAdmin, async (req, res) => {
    try {
      const { name, slug, description, parent_id, sort_order } = req.body;

      if (!name) {
        return res.status(400).json({ error: '分類名稱不能為空' });
      }

      const result = await pool.query(`
        INSERT INTO categories (name, slug, description, parent_id, sort_order, status)
        VALUES ($1, $2, $3, $4, $5, 'active')
        RETURNING *
      `, [
        name,
        slug || name.toLowerCase().replace(/\s+/g, '-'),
        description || null,
        parent_id || null,
        sort_order || 0
      ]);

      res.json({ success: true, category: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Update category (admin)
  app.put('/api/admin/categories/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, slug, description, parent_id, sort_order, status } = req.body;

      const result = await pool.query(`
        UPDATE categories
        SET name = $1, slug = $2, description = $3, parent_id = $4, sort_order = $5, status = $6, updated_at = NOW()
        WHERE id = $7
        RETURNING *
      `, [
        name,
        slug || name.toLowerCase().replace(/\s+/g, '-'),
        description || null,
        parent_id || null,
        sort_order || 0,
        status || 'active',
        id
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: '分類不存在' });
      }

      res.json({ success: true, category: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Delete category (admin)
  app.delete('/api/admin/categories/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;

      // Check if has products
      const hasProducts = await pool.query('SELECT COUNT(*) as cnt FROM products WHERE category_id = $1', [id]);
      if (parseInt(hasProducts.rows[0].cnt) > 0) {
        return res.status(400).json({ error: '此分類下尚有產品，無法刪除' });
      }

      const result = await pool.query('DELETE FROM categories WHERE id = $1 RETURNING *', [id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: '分類不存在' });
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Get all categories for admin
  app.get('/api/admin/categories', requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT c.*, COUNT(p.id) as product_count
        FROM categories c
        LEFT JOIN products p ON c.id = p.category_id
        GROUP BY c.id
        ORDER BY c.sort_order ASC, c.name ASC
      `);
      res.json({ categories: result.rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

};

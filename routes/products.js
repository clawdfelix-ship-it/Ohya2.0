module.exports = function(app, pool, requireAdmin) {

  // Get public product list (with pagination, filtering)
  app.get('/api/products', async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const perPage = parseInt(req.query.per_page) || 24;
      const categoryId = req.query.category_id;
      const search = req.query.search || '';
      const offset = (page - 1) * perPage;

      let where = 'p.status = \'active\'';
      let params = [];
      let paramIndex = 1;

      if (categoryId) {
        where += ` AND p.category_id = $${paramIndex}`;
        params.push(categoryId);
        paramIndex++;
      }

      if (search) {
        where += ` AND (p.name ILIKE $${paramIndex} OR p.description ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      // Get total count
      const countResult = await pool.query(`SELECT COUNT(*) as total FROM products p WHERE ${where}`, params);
      const total = parseInt(countResult.rows[0].total);

      // Get products
      const result = await pool.query(`
        SELECT p.*, c.name as category_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE ${where}
        ORDER BY p.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, [...params, perPage, offset]);

      res.json({
        products: result.rows,
        pagination: {
          page,
          perPage,
          total,
          totalPages: Math.ceil(total / perPage)
        }
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Get single product
  app.get('/api/products/:id', async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query(`
        SELECT p.*, c.name as category_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.id = $1 AND p.status = 'active'
      `, [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: '產品不存在' });
      }

      res.json({ product: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Create product (admin)
  app.post('/api/admin/products', requireAdmin, async (req, res) => {
    try {
      const {
        name,
        slug,
        description,
        price,
        original_price,
        stock,
        category_id,
        image_url,
        gallery_images,
        status
      } = req.body;

      if (!name || !price || !category_id) {
        return res.status(400).json({ error: '名稱、價格、分類不能為空' });
      }

      const result = await pool.query(`
        INSERT INTO products (
          name, slug, description, price, original_price, stock,
          category_id, image_url, gallery_images, status
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING *
      `, [
        name,
        slug || name.toLowerCase().replace(/\s+/g, '-'),
        description || null,
        parseFloat(price),
        original_price ? parseFloat(original_price) : null,
        parseInt(stock) || 0,
        category_id,
        image_url || null,
        gallery_images ? JSON.stringify(gallery_images) : null,
        status || 'active'
      ]);

      res.json({ success: true, product: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Update product (admin)
  app.put('/api/admin/products/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const {
        name,
        slug,
        description,
        price,
        original_price,
        stock,
        category_id,
        image_url,
        gallery_images,
        status
      } = req.body;

      const result = await pool.query(`
        UPDATE products
        SET name = $1, slug = $2, description = $3, price = $4, original_price = $5,
            stock = $6, category_id = $7, image_url = $8, gallery_images = $9,
            status = $10, updated_at = NOW()
        WHERE id = $11
        RETURNING *
      `, [
        name,
        slug || name.toLowerCase().replace(/\s+/g, '-'),
        description || null,
        parseFloat(price),
        original_price ? parseFloat(original_price) : null,
        parseInt(stock) || 0,
        category_id,
        image_url || null,
        gallery_images ? JSON.stringify(gallery_images) : null,
        status || 'active',
        id
      ]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: '產品不存在' });
      }

      res.json({ success: true, product: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Delete product (admin)
  app.delete('/api/admin/products/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const result = await pool.query('DELETE FROM products WHERE id = $1 RETURNING *', [id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: '產品不存在' });
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Get all products for admin
  app.get('/api/admin/products', requireAdmin, async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const perPage = parseInt(req.query.per_page) || 50;
      const categoryId = req.query.category_id;
      const search = req.query.search || '';
      const offset = (page - 1) * perPage;

      let where = '1=1';
      let params = [];
      let paramIndex = 1;

      if (categoryId) {
        where += ` AND category_id = $${paramIndex}`;
        params.push(categoryId);
        paramIndex++;
      }

      if (search) {
        where += ` AND (name ILIKE $${paramIndex} OR description ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      const countResult = await pool.query(`SELECT COUNT(*) as total FROM products WHERE ${where}`, params);
      const total = parseInt(countResult.rows[0].total);

      const result = await pool.query(`
        SELECT p.*, c.name as category_name
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE ${where}
        ORDER BY p.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, [...params, perPage, offset]);

      res.json({
        products: result.rows,
        pagination: {
          page,
          perPage,
          total,
          totalPages: Math.ceil(total / perPage)
        }
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

};

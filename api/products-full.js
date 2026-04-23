// ===========================================
// Full Product & Inventory Management API
// For Hong Kong Full-featured E-commerce
// ===========================================

module.exports = function(app, pool) {

  const requireAdmin = require('./middleware/auth').requireAdmin;

  // ===========================================
  // Brands
  // ===========================================

  // Get all brands
  app.get('/api/brands', async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT * FROM brands WHERE is_active = true ORDER BY sort_order, name
      `);
      res.json({ brands: result.rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Admin: get all brands (including inactive)
  app.get('/api/admin/brands', requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT * FROM brands ORDER BY sort_order, name
      `);
      res.json({ brands: result.rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Admin: create brand
  app.post('/api/admin/brands', requireAdmin, async (req, res) => {
    try {
      const { name, slug, description, image_url, website, sort_order, is_active } = req.body;
      const result = await pool.query(`
        INSERT INTO brands (name, slug, description, image_url, website, sort_order, is_active)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [name, slug, description, image_url, website, sort_order || 0, is_active !== false]);
      res.json({ success: true, brand: result.rows[0] });
    } catch (err) {
      console.error(err);
      if (err.code === '23505') { // unique violation
        return res.status(400).json({ error: 'Slug 已經存在' });
      }
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Admin: update brand
  app.put('/api/admin/brands/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, slug, description, image_url, website, sort_order, is_active } = req.body;
      const result = await pool.query(`
        UPDATE brands
        SET name = $1, slug = $2, description = $3, image_url = $4, website = $5, sort_order = $6, is_active = $7, updated_at = NOW()
        WHERE id = $8
        RETURNING *
      `, [name, slug, description, image_url, website, sort_order, is_active, id]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: '品牌不存在' });
      }
      res.json({ success: true, brand: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Admin: delete brand (soft delete handled elsewhere, just hard delete here)
  app.delete('/api/admin/brands/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await pool.query('DELETE FROM brands WHERE id = $1', [id]);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // ===========================================
  // Product Tags
  // ===========================================

  app.get('/api/product-tags', async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM product_tags ORDER BY name');
      res.json({ tags: result.rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // ===========================================
  // Public Products API
  // ===========================================

  // Get product list (public)
  app.get('/api/products', async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const pageSize = parseInt(req.query.page_size) || 24;
      const offset = (page - 1) * pageSize;
      const categoryId = req.query.category_id;
      const brandId = req.query.brand_id;
      const tagId = req.query.tag_id;
      const search = req.query.search;
      const sort = req.query.sort || 'created_at';
      const order = req.query.order || 'desc';

      let where = 'p.status = \'active\'';
      let params = [];

      if (categoryId) {
        where += ` AND p.category_id = $${params.length + 1}`;
        params.push(categoryId);
      }
      if (brandId) {
        where += ` AND p.brand_id = $${params.length + 1}`;
        params.push(brandId);
      }
      if (search) {
        where += ` AND (p.name ILIKE $${params.length + 1} OR p.description ILIKE $${params.length + 1})`;
        params.push(`%${search}%`);
      }

      // Count total
      const countResult = await pool.query(`SELECT COUNT(*) FROM products p WHERE ${where}`, params);
      const total = parseInt(countResult.rows[0].count);
      const totalPages = Math.ceil(total / pageSize);

      // Get products
      let query = `
        SELECT p.*, b.name as brand_name, c.name as category_name
        FROM products p
        LEFT JOIN brands b ON p.brand_id = b.id
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE ${where}
      `;

      if (sort === 'price') {
        query += ` ORDER BY p.price ${order}`;
      } else if (sort === 'name') {
        query += ` ORDER BY p.name ${order}`;
      } else if (sort === 'popular') {
        query += ` ORDER BY p.is_featured DESC, p.created_at DESC`;
      } else {
        query += ` ORDER BY p.${sort} ${order}`;
      }

      query += ` LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
      params.push(pageSize, offset);

      const result = await pool.query(query, params);

      // Get stock for each product (sum from SKUs)
      const productsWithStock = await Promise.all(result.rows.map(async (product) => {
        const skuResult = await pool.query(`
          SELECT SUM(stock) as total_stock FROM product_skus WHERE product_id = $1 AND is_active = true
        `, [product.id]);
        const totalStock = skuResult.rows[0].total_stock || 0;
        return {
          ...product,
          total_stock: parseInt(totalStock)
        };
      }));

      res.json({
        products: productsWithStock,
        pagination: { page, page_size: pageSize, total, total_pages: totalPages }
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Get featured products
  app.get('/api/products/featured', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit) || 8;
      const result = await pool.query(`
        SELECT p.*, b.name as brand_name, c.name as category_name
        FROM products p
        LEFT JOIN brands b ON p.brand_id = b.id
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.status = 'active' AND p.is_featured = true
        ORDER BY p.created_at DESC
        LIMIT $1
      `, [limit]);
      res.json({ products: result.rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Get single product
  app.get('/api/products/:slug', async (req, res) => {
    try {
      const { slug } = req.params;
      const productResult = await pool.query(`
        SELECT p.*, b.name as brand_name, c.name as category_name
        FROM products p
        LEFT JOIN brands b ON p.brand_id = b.id
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.slug = $1 AND p.status = 'active'
      `, [slug]);

      if (productResult.rows.length === 0) {
        return res.status(404).json({ error: '產品不存在' });
      }

      const product = productResult.rows[0];

      // Get SKUs
      const skusResult = await pool.query(`
        SELECT * FROM product_skus WHERE product_id = $1 AND is_active = true ORDER BY id
      `, [product.id]);

      // Get related products
      const relatedResult = await pool.query(`
        SELECT p.id, p.name, p.slug, p.price, p.image_url, p.average_rating
        FROM products p
        JOIN related_products rp ON p.id = rp.related_product_id
        WHERE rp.product_id = $1 AND p.status = 'active'
        ORDER BY rp.sort_order
        LIMIT 10
      `, [product.id]);

      // Get approved reviews
      const reviewsResult = await pool.query(`
        SELECT r.*, u.username, u.first_name, u.last_name
        FROM product_reviews r
        JOIN users u ON r.user_id = u.id
        WHERE r.product_id = $1 AND r.status = 'approved'
        ORDER BY r.created_at DESC
      `, [product.id]);

      res.json({
        product,
        skus: skusResult.rows,
        related_products: relatedResult.rows,
        reviews: reviewsResult.rows
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Get low stock (public/admin)
  app.get('/api/admin/products/low-stock', requireAdmin, async (req, res) => {
    try {
      const threshold = parseInt(req.query.threshold) || 10;
      const result = await pool.query(`
        SELECT p.*,
          SUM(ps.stock) as total_stock,
          b.name as brand_name,
          c.name as category_name
        FROM products p
        LEFT JOIN product_skus ps ON p.id = ps.product_id
        LEFT JOIN brands b ON p.brand_id = b.id
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE p.status = 'active'
        GROUP BY p.id, b.name, c.name
        HAVING SUM(ps.stock) <= $1
        ORDER BY SUM(ps.stock) ASC
      `, [threshold]);
      res.json({ products: result.rows, threshold });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Export products to CSV
  app.get('/api/admin/products/export/csv', requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT
          p.id, p.name, p.slug, p.price, p.original_price, p.cost_price,
          SUM(ps.stock) as stock,
          c.name as category_name,
          b.name as brand_name,
          p.status, p.created_at
        FROM products p
        LEFT JOIN product_skus ps ON p.id = ps.product_id
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN brands b ON p.brand_id = b.id
        GROUP BY p.id, c.name, b.name
        ORDER BY p.created_at DESC
      `);

      let csv = 'ID,Name,Slug,Cost Price,Price,Original Price,Total Stock,Category,Brand,Status,Created At\n';
      result.rows.forEach(row => {
        const escape = (val) => {
          if (val === null) return '';
          const str = String(val);
          if (str.includes(',') || str.includes('"')) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        };
        csv += Object.values([
          row.id, row.name, row.slug, row.cost_price, row.price, row.original_price,
          row.stock, row.category_name, row.brand_name, row.status, row.created_at
        ]).map(escape).join(',') + '\n';
      });

      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename="products-${new Date().toISOString().slice(0, 10)}.csv"`);
      res.send(csv);
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // ===========================================
  // Admin: Products CRUD
  // ===========================================

  app.get('/api/admin/products', requireAdmin, async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const pageSize = parseInt(req.query.page_size) || 50;
      const offset = (page - 1) * pageSize;
      const search = req.query.search;
      const categoryId = req.query.category_id;
      const brandId = req.query.brand_id;
      const status = req.query.status;

      let where = '1=1';
      let params = [];

      if (search) {
        where += ` AND (p.name ILIKE $${params.length + 1} OR p.slug ILIKE $${params.length + 1})`;
        params.push(`%${search}%`);
      }
      if (categoryId) {
        where += ` AND p.category_id = $${params.length + 1}`;
        params.push(categoryId);
      }
      if (brandId) {
        where += ` AND p.brand_id = $${params.length + 1}`;
        params.push(brandId);
      }
      if (status) {
        where += ` AND p.status = $${params.length + 1}`;
        params.push(status);
      }

      const countResult = await pool.query(`SELECT COUNT(*) FROM products p WHERE ${where}`, params);
      const total = parseInt(countResult.rows[0].count);
      const totalPages = Math.ceil(total / pageSize);

      const query = `
        SELECT p.*, b.name as brand_name, c.name as category_name
        FROM products p
        LEFT JOIN brands b ON p.brand_id = b.id
        LEFT JOIN categories c ON p.category_id = c.id
        WHERE ${where}
        ORDER BY p.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `;
      params.push(pageSize, offset);

      const result = await pool.query(query, params);

      res.json({
        products: result.rows,
        pagination: { page, page_size: pageSize, total, total_pages: totalPages }
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  app.get('/api/admin/products/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const productResult = await pool.query(`
        SELECT * FROM products WHERE id = $1
      `, [id]);

      if (productResult.rows.length === 0) {
        return res.status(404).json({ error: '產品不存在' });
      }

      const product = productResult.rows[0];

      const skusResult = await pool.query(`
        SELECT * FROM product_skus WHERE product_id = $1 ORDER BY id
      `, [id]);

      const tagsResult = await pool.query(`
        SELECT pt.* FROM product_tags pt
        JOIN product_tag_assignments pta ON pt.id = pta.tag_id
        WHERE pta.product_id = $1
      `, [id]);

      const relatedResult = await pool.query(`
        SELECT p.id, p.name, p.slug FROM products p
        JOIN related_products rp ON p.id = rp.related_product_id
        WHERE rp.product_id = $1
        ORDER BY rp.sort_order
      `, [id]);

      res.json({
        product,
        skus: skusResult.rows,
        tags: tagsResult.rows,
        related: relatedResult.rows
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  app.post('/api/admin/products', requireAdmin, async (req, res) => {
    try {
      const {
        name, slug, description, short_description,
        brand_id, category_id,
        cost_price, price, original_price, member_price,
        status, is_featured,
        meta_title, meta_description,
        image_url, gallery_images, video_url,
        product_type, is_digital, digital_file_url,
        has_batch_expiry, enable_reviews,
        skus, tags, related_products
      } = req.body;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Insert product
        const productResult = await client.query(`
          INSERT INTO products (
            name, slug, description, short_description,
            brand_id, category_id,
            cost_price, price, original_price, member_price,
            status, is_featured,
            meta_title, meta_description,
            image_url, gallery_images, video_url,
            product_type, is_digital, digital_file_url,
            has_batch_expiry, enable_reviews
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23)
          RETURNING id
        `, [
          name, slug, description, short_description,
          brand_id || null, category_id || null,
          cost_price, price, original_price, member_price,
          status || 'active', is_featured || false,
          meta_title, meta_description,
          image_url, gallery_images ? JSON.stringify(gallery_images) : null, video_url,
          product_type || 'physical', is_digital || false, digital_file_url,
          has_batch_expiry || false, enable_reviews !== false
        ]);

        const productId = productResult.rows[0].id;

        // Insert SKUs
        if (skus && skus.length > 0) {
          for (const sku of skus) {
            await client.query(`
              INSERT INTO product_skus (product_id, sku, barcode, attributes, price, cost_price, original_price, stock, weight, weight_unit, is_active)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `, [
              productId,
              sku.sku || null,
              sku.barcode || null,
              JSON.stringify(sku.attributes || {}),
              sku.price || null,
              sku.cost_price || null,
              sku.original_price || null,
              sku.stock || 0,
              sku.weight || null,
              sku.weight_unit || 'g',
              sku.is_active !== false
            ]);
          }
        }

        // Log operation
        await client.query(`
          INSERT INTO admin_operation_logs (admin_id, action, entity_type, entity_id, new_data)
          VALUES ($1, 'create', 'product', $2, $3)
        `, [req.user.id, productId, JSON.stringify(req.body)]);

        await client.query('COMMIT');

        res.json({ success: true, product_id: productId });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error(err);
      if (err.code === '23505') {
        return res.status(400).json({ error: 'Slug 已經存在' });
      }
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  app.put('/api/admin/products/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const {
        name, slug, description, short_description,
        brand_id, category_id,
        cost_price, price, original_price, member_price,
        status, is_featured,
        meta_title, meta_description,
        image_url, gallery_images, video_url,
        product_type, is_digital, digital_file_url,
        has_batch_expiry, enable_reviews,
        skus
      } = req.body;

      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Get old data for log
        const oldResult = await client.query('SELECT * FROM products WHERE id = $1', [id]);
        const oldData = oldResult.rows[0];

        // Update product
        await client.query(`
          UPDATE products SET
            name = $1, slug = $2, description = $3, short_description = $4,
            brand_id = $5, category_id = $6,
            cost_price = $7, price = $8, original_price = $9, member_price = $10,
            status = $11, is_featured = $12,
            meta_title = $13, meta_description = $14,
            image_url = $15, gallery_images = $16, video_url = $17,
            product_type = $18, is_digital = $19, digital_file_url = $20,
            has_batch_expiry = $21, enable_reviews = $22,
            updated_at = NOW()
          WHERE id = $23
        `, [
          name, slug, description, short_description,
          brand_id || null, category_id || null,
          cost_price, price, original_price, member_price,
          status, is_featured,
          meta_title, meta_description,
          image_url, gallery_images ? JSON.stringify(gallery_images) : null, video_url,
          product_type, is_digital, digital_file_url,
          has_batch_expiry, enable_reviews,
          id
        ]);

        // Update SKUs: delete and reinsert (simple approach)
        if (skus) {
          await client.query('DELETE FROM product_skus WHERE product_id = $1', [id]);
          for (const sku of skus) {
            await client.query(`
              INSERT INTO product_skus (product_id, sku, barcode, attributes, price, cost_price, original_price, stock, weight, weight_unit, is_active)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
            `, [
              id,
              sku.sku || null,
              sku.barcode || null,
              JSON.stringify(sku.attributes || {}),
              sku.price || null,
              sku.cost_price || null,
              sku.original_price || null,
              sku.stock || 0,
              sku.weight || null,
              sku.weight_unit || 'g',
              sku.is_active !== false
            ]);
          }
        }

        // Log
        await client.query(`
          INSERT INTO admin_operation_logs (admin_id, action, entity_type, entity_id, old_data, new_data)
          VALUES ($1, 'update', 'product', $2, $3, $4)
        `, [req.user.id, id, JSON.stringify(oldData), JSON.stringify(req.body)]);

        await client.query('COMMIT');

        res.json({ success: true });
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Soft delete (move to recycle bin)
  app.delete('/api/admin/products/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      await pool.query(`
        UPDATE products SET deleted_at = NOW(), status = 'archived', updated_at = NOW() WHERE id = $1
      `, [id]);
      await pool.query(`
        INSERT INTO admin_operation_logs (admin_id, action, entity_type, entity_id)
        VALUES ($1, 'delete', 'product', $2)
      `, [req.user.id, id]);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // ===========================================
  // Product Reviews
  // ===========================================

  // User submit review
  app.post('/api/products/:id/reviews', async (req, res) => {
    try {
      if (!req.user) {
        return res.status(401).json({ error: '需要登入' });
      }
      const { id } = req.params;
      const { rating, title, content, images } = req.body;

      // Check if product exists
      const productCheck = await pool.query('SELECT id FROM products WHERE id = $1', [id]);
      if (productCheck.rows.length === 0) {
        return res.status(404).json({ error: '產品不存在' });
      }

      await pool.query(`
        INSERT INTO product_reviews (product_id, user_id, rating, title, content, images, status)
        VALUES ($1, $2, $3, $4, $5, $6, 'pending')
      `, [id, req.user.id, rating, title || null, content || null, images ? JSON.stringify(images) : null]);

      res.json({ success: true, message: '評價已提交，等待審核' });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Admin: get all pending reviews
  app.get('/api/admin/reviews/pending', requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT r.*, p.name as product_name, u.username
        FROM product_reviews r
        JOIN products p ON r.product_id = p.id
        JOIN users u ON r.user_id = u.id
        WHERE r.status = 'pending'
        ORDER BY r.created_at DESC
      `);
      res.json({ reviews: result.rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Admin: approve/reject review
  app.put('/api/admin/reviews/:id/status', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { status } = req.body;

      await pool.query(`
        UPDATE product_reviews SET status = $1 WHERE id = $2
      `, [status, id]);

      // Recalculate average rating for product
      if (status === 'approved') {
        const result = await pool.query(`
          SELECT AVG(rating) as avg, COUNT(*) as count
          FROM product_reviews
          WHERE product_id = (SELECT product_id FROM product_reviews WHERE id = $1) AND status = 'approved'
        `, [id]);
        const avg = parseFloat(result.rows[0].avg) || 0;
        const count = parseInt(result.rows[0].count);
        await pool.query(`
          UPDATE products SET average_rating = $1, review_count = $2 WHERE id = (SELECT product_id FROM product_reviews WHERE id = $3)
        `, [avg.toFixed(1), count, id]);
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // ===========================================
  // Inventory
  // ===========================================

  app.get('/api/admin/inventory/transactions', requireAdmin, async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const pageSize = parseInt(req.query.page_size) || 50;
      const offset = (page - 1) * pageSize;
      const productId = req.query.product_id;

      let where = '1=1';
      let params = [];
      if (productId) {
        where += ` AND product_id = $${params.length + 1}`;
        params.push(productId);
      }

      const countResult = await pool.query(`SELECT COUNT(*) FROM inventory_transactions WHERE ${where}`, params);
      const total = parseInt(countResult.rows[0].count);

      const result = await pool.query(`
        SELECT it.*, p.name as product_name, w.name as warehouse_name
        FROM inventory_transactions it
        LEFT JOIN products p ON it.product_id = p.id
        LEFT JOIN warehouses w ON it.warehouse_id = w.id
        WHERE ${where}
        ORDER BY it.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `, [...params, pageSize, offset]);

      res.json({
        transactions: result.rows,
        pagination: { page, page_size: pageSize, total }
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Get warehouses
  app.get('/api/admin/warehouses', requireAdmin, async (req, res) => {
    try {
      const result = await pool.query('SELECT * FROM warehouses WHERE is_active = true ORDER BY name');
      res.json({ warehouses: result.rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Create warehouse
  app.post('/api/admin/warehouses', requireAdmin, async (req, res) => {
    try {
      const { name, address, contact_name, contact_phone } = req.body;
      const result = await pool.query(`
        INSERT INTO warehouses (name, address, contact_name, contact_phone)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `, [name, address, contact_name, contact_phone]);
      res.json({ success: true, warehouse: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // ===========================================
  // Categories (already in basic api, extended)
  // ===========================================

  // Get category tree (public)
  app.get('/api/categories/tree', async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT * FROM categories WHERE status = 'active' ORDER BY parent_id, sort_order
      `);

      // Build tree
      const categories = result.rows;
      const map = {};
      const roots = [];

      categories.forEach(cat => {
        map[cat.id] = { ...cat, children: [] };
      });

      categories.forEach(cat => {
        if (cat.parent_id && map[cat.parent_id]) {
          map[cat.parent_id].children.push(map[cat.id]);
        } else if (!cat.parent_id) {
          roots.push(map[cat.id]);
        }
      });

      res.json({ tree: roots, all: categories });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

};

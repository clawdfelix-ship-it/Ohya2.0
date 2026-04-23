module.exports = function(app, pool, requireAuth) {

  // Get current user's cart
  app.get('/api/cart', requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;

      const result = await pool.query(`
        SELECT ci.*, p.name, p.price, p.image_url, p.stock, p.slug
        FROM cart_items ci
        JOIN products p ON ci.product_id = p.id
        WHERE ci.user_id = $1
        ORDER BY ci.created_at DESC
      `, [userId]);

      // Calculate total
      let total = 0;
      result.rows.forEach(item => {
        total += item.price * item.quantity;
      });

      res.json({
        items: result.rows,
        total,
        count: result.rows.length
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Add item to cart
  app.post('/api/cart/add', requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const { product_id, quantity } = req.body;

      if (!product_id || !quantity || quantity < 1) {
        return res.status(400).json({ error: '產品ID和數量不正確' });
      }

      // Check product exists and has stock
      const product = await pool.query('SELECT id, name, price, stock FROM products WHERE id = $1 AND status = \'active\'', [product_id]);
      if (product.rows.length === 0) {
        return res.status(404).json({ error: '產品不存在' });
      }

      if (product.rows[0].stock < quantity) {
        return res.status(400).json({ error: '庫存不足' });
      }

      // Check if already in cart
      const existing = await pool.query('SELECT id, quantity FROM cart_items WHERE user_id = $1 AND product_id = $2', [userId, product_id]);

      if (existing.rows.length > 0) {
        // Update quantity
        const newQuantity = existing.rows[0].quantity + quantity;
        if (product.rows[0].stock < newQuantity) {
          return res.status(400).json({ error: '庫存不足' });
        }
        await pool.query(
          'UPDATE cart_items SET quantity = $1, updated_at = NOW() WHERE id = $2',
          [newQuantity, existing.rows[0].id]
        );
      } else {
        // Add new item
        await pool.query(
          'INSERT INTO cart_items (user_id, product_id, quantity) VALUES ($1, $2, $3)',
          [userId, product_id, quantity]
        );
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Update item quantity
  app.put('/api/cart/:id', requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const { id } = req.params;
      const { quantity } = req.body;

      // Verify ownership
      const item = await pool.query('SELECT ci.*, p.stock FROM cart_items ci JOIN products p ON ci.product_id = p.id WHERE ci.id = $1 AND ci.user_id = $2', [id, userId]);
      if (item.rows.length === 0) {
        return res.status(404).json({ error: '購物車項目不存在' });
      }

      if (quantity < 1) {
        // Delete item
        await pool.query('DELETE FROM cart_items WHERE id = $1', [id]);
      } else {
        if (item.rows[0].stock < quantity) {
          return res.status(400).json({ error: '庫存不足' });
        }
        await pool.query('UPDATE cart_items SET quantity = $1, updated_at = NOW() WHERE id = $2', [quantity, id]);
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Remove item from cart
  app.delete('/api/cart/:id', requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const { id } = req.params;

      const result = await pool.query('DELETE FROM cart_items WHERE id = $1 AND user_id = $2 RETURNING *', [id, userId]);
      if (result.rows.length === 0) {
        return res.status(404).json({ error: '購物車項目不存在' });
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Clear cart
  app.delete('/api/cart', requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      await pool.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);
      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

};

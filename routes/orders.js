module.exports = function(app, pool, requireAuth, requireAdmin) {
  const path = require('path');
  const multer = require('multer');
  const { requirePermission } = require('./middleware/auth');
  const { createOrderService } = require('../utils/orderService');

  // 入數證明：memory storage，只收圖片，上限 8MB
  const proofUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 8 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      const ok = /^image\/(jpeg|png|gif|webp|heic|heif)$/.test(file.mimetype);
      cb(ok ? null : new Error('只接受圖片檔（JPG/PNG/GIF/WEBP）'), ok);
    },
  });

  // 只准本人操作自己張訂單
  async function loadOwnedOrder(userId, id) {
    const r = await pool.query('SELECT * FROM orders WHERE id=$1 AND user_id=$2', [id, userId]);
    return r.rows[0] || null;
  }

  // Get my orders (current user)
  app.get('/api/orders', requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const page = parseInt(req.query.page) || 1;
      const perPage = parseInt(req.query.per_page) || 10;
      const offset = (page - 1) * perPage;

      const countResult = await pool.query('SELECT COUNT(*) as total FROM orders WHERE user_id = $1', [userId]);
      const total = parseInt(countResult.rows[0].total);

      const result = await pool.query(`
        SELECT o.*, COUNT(oi.id) as item_count
        FROM orders o
        LEFT JOIN order_items oi ON o.id = oi.order_id
        WHERE o.user_id = $1
        GROUP BY o.id
        ORDER BY o.created_at DESC
        LIMIT $2 OFFSET $3
      `, [userId, perPage, offset]);

      res.json({
        orders: result.rows,
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

  // Get single order detail
  app.get('/api/orders/:id', requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const { id } = req.params;

      const orderResult = await pool.query(`
        SELECT o.*
        FROM orders o
        WHERE o.id = $1 AND o.user_id = $2
      `, [id, userId]);

      if (orderResult.rows.length === 0) {
        return res.status(404).json({ error: '訂單不存在' });
      }

      const itemsResult = await pool.query(`
        SELECT oi.*, p.name, p.image_url
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = $1
      `, [id]);

      res.json({
        order: orderResult.rows[0],
        items: itemsResult.rows
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Create new order from cart
  // 付款：銀行轉帳 / FPS（人工核實，payment_status 起步 pending）；運費：到付（shipping_fee=0）
  app.post('/api/orders', requireAuth, async (req, res) => {
    const client = await pool.connect();
    try {
      const userId = req.session.userId;
      const { contact_name, contact_phone, contact_address, note, payment_method } = req.body;

      if (!contact_name || !contact_phone || !contact_address) {
        return res.status(400).json({ error: '聯絡資訊不全' });
      }

      // 暫時只開放銀行轉帳 / FPS
      const ALLOWED_PAYMENT = { bank_transfer: '銀行轉帳', fps: 'FPS 轉數快' };
      const paymentCode = ALLOWED_PAYMENT[payment_method] ? payment_method : null;
      if (!paymentCode) {
        return res.status(400).json({ error: '請選擇付款方式（銀行轉帳或 FPS 轉數快）' });
      }

      await client.query('BEGIN');

      // Get cart items（預購模式：不追蹤庫存，只驗商品仍上架）
      const cartResult = await client.query(`
        SELECT ci.id AS cart_item_id, ci.product_id, ci.quantity,
               p.price, p.name, p.status
        FROM cart_items ci
        JOIN products p ON ci.product_id = p.id
        WHERE ci.user_id = $1
        FOR UPDATE OF p
      `, [userId]);

      if (cartResult.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: '購物車是空的' });
      }

      // 預購模式：商品仍有效即可，數量不受庫存限制
      for (const item of cartResult.rows) {
        if (item.status !== 'active') {
          await client.query('ROLLBACK');
          return res.status(400).json({ error: `商品「${item.name}」已落架` });
        }
      }

      // 小計（DB products.price 單位為 HKD；運費到付，落單唔收運費）
      let subtotal = 0;
      cartResult.rows.forEach(item => {
        subtotal += Number(item.price) * Number(item.quantity);
      });
      const subtotalMoney = Number(subtotal.toFixed(2));

      const orderResult = await client.query(`
        INSERT INTO orders
          (user_id, contact_name, contact_phone, contact_address, note,
           subtotal_amount, shipping_fee, is_cod, total_amount,
           payment_method_code, payment_status, status)
        VALUES ($1, $2, $3, $4, $5, $6, 0, true, $6, $7, 'pending', 'pending')
        RETURNING id
      `, [userId, contact_name, contact_phone, contact_address, note || null,
           subtotalMoney, paymentCode]);

      const orderId = orderResult.rows[0].id;

      // 人睇嘅訂單編號 OHYA-YYMMDD-000123
      const now = new Date();
      const ym = String(now.getFullYear()).slice(2) +
        String(now.getMonth() + 1).padStart(2, '0') +
        String(now.getDate()).padStart(2, '0');
      const orderNumber = `OHYA-${ym}-${String(orderId).padStart(6, '0')}`;
      await client.query('UPDATE orders SET order_number = $1 WHERE id = $2', [orderNumber, orderId]);

      // Create order items（預購模式不扣庫存）
      for (const item of cartResult.rows) {
        await client.query(`
          INSERT INTO order_items (order_id, product_id, quantity, unit_price)
          VALUES ($1, $2, $3, $4)
        `, [orderId, item.product_id, item.quantity, item.price]);
      }

      // Clear cart
      await client.query('DELETE FROM cart_items WHERE user_id = $1', [userId]);

      await client.query('COMMIT');

      // Email 通知（best-effort，唔可以因為 SMTP 失敗而影響落單）
      // 用 pool（而非交易 client）喺 COMMIT 後讀取，唔阻塞回應。
      try {
        const { sendOrderConfirmation, sendAdminNewOrder } = require('../utils/orderEmails');
        const [userRow, itemRows] = await Promise.all([
          pool.query('SELECT email FROM users WHERE id = $1', [userId]),
          pool.query(`
            SELECT oi.quantity, oi.unit_price, p.name
            FROM order_items oi JOIN products p ON oi.product_id = p.id
            WHERE oi.order_id = $1
          `, [orderId]),
        ]);
        const emailOrder = {
          ...orderResult.rows[0],
          order_number: orderNumber,
          contact_name: contact_name,
          contact_phone: contact_phone,
          contact_address: contact_address,
          note: note || null,
          total_amount: subtotalMoney,
          payment_method_code: paymentCode,
          email: (userRow.rows[0] && userRow.rows[0].email) || null,
        };
        await Promise.all([
          sendOrderConfirmation(emailOrder, itemRows.rows),
          sendAdminNewOrder(emailOrder, itemRows.rows),
        ]);
      } catch (mailErr) {
        console.error('[orders] notification email failed:', mailErr && mailErr.message ? mailErr.message : String(mailErr));
      }

      res.json({ success: true, orderId, orderNumber, paymentMethod: paymentCode });
    } catch (err) {
      try { await client.query('ROLLBACK'); } catch (_) {}
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    } finally {
      client.release();
    }
  });

  // Cancel order (user)
  app.post('/api/orders/:id/cancel', requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const { id } = req.params;

      // Check order exists and belongs to user
      const orderCheck = await pool.query('SELECT * FROM orders WHERE id = $1 AND user_id = $2', [id, userId]);
      if (orderCheck.rows.length === 0) {
        return res.status(404).json({ error: '訂單不存在' });
      }

      const order = orderCheck.rows[0];
      if (!['pending', 'paid'].includes(order.status)) {
        return res.status(400).json({ error: '此訂單無法取消' });
      }

      // Start transaction to restore stock
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // 預購模式：取消訂單不退還庫存
        // Update order status
        await client.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2', ['cancelled', id]);

        await client.query('COMMIT');
        res.json({ success: true });
      } catch (txErr) {
        await client.query('ROLLBACK');
        throw txErr;
      } finally {
        client.release();
      }
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Admin: Get all orders
  app.get('/api/admin/orders', requirePermission('orders:read'), async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const perPage = parseInt(req.query.per_page) || 30;
      const status = req.query.status;
      const search = req.query.search || '';
      const offset = (page - 1) * perPage;

      let where = '1=1';
      let params = [];
      let paramIndex = 1;

      if (status) {
        where += ` AND o.status = $${paramIndex}`;
        params.push(status);
        paramIndex++;
      }

      if (search) {
        where += ` AND (o.contact_name ILIKE $${paramIndex} OR o.contact_phone ILIKE $${paramIndex} OR o.id::text ILIKE $${paramIndex})`;
        params.push(`%${search}%`);
        paramIndex++;
      }

      const countResult = await pool.query(`SELECT COUNT(*) as total FROM orders o WHERE ${where}`, params);
      const total = parseInt(countResult.rows[0].total);

      const result = await pool.query(`
        SELECT o.*, u.username
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        WHERE ${where}
        ORDER BY o.created_at DESC
        LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
      `, [...params, perPage, offset]);

      res.json({
        orders: result.rows,
        pagination: { page, perPage, total, totalPages: Math.ceil(total / perPage) }
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Admin: Update order status
  app.put('/api/admin/orders/:id/status', requirePermission('orders:write'), async (req, res) => {
    const client = await pool.connect();
    try {
      const orderId = parseInt(req.params.id, 10);
      const { status, tracking_number } = req.body;

      const allowedStatuses = ['pending', 'paid', 'shipping', 'completed', 'cancelled'];
      if (!allowedStatuses.includes(status)) {
        return res.status(400).json({ error: '無效狀態' });
      }
      const adminId = req.session.userId;
      const base = '後台手動更新狀態';
      const svc = createOrderService(client);
      let derived;

      await client.query('BEGIN');
      if (status === 'paid') {
        derived = await svc.transitionPayment(orderId, 'paid', { note: base + '→已付款', processedBy: adminId });
        await client.query('UPDATE orders SET paid_at=COALESCE(paid_at,NOW()) WHERE id=$1', [orderId]);
      } else if (status === 'shipping') {
        const itemsR = await client.query(`
          SELECT oi.id, oi.quantity
            - COALESCE((
                SELECT SUM(offi.quantity) FROM order_fulfillment_items offi
                JOIN order_fulfillments f ON f.id=offi.fulfillment_id
                WHERE offi.order_item_id=oi.id AND f.state<>'cancelled'), 0) AS remaining
          FROM order_items oi WHERE oi.order_id=$1`, [orderId]);
        const remaining = itemsR.rows
          .map(r => ({ order_item_id: r.id, quantity: Number(r.remaining) }))
          .filter(x => x.quantity > 0);
        if (!remaining.length) {
          throw Object.assign(new Error('所有商品已出貨，無需再建出貨單'), { code: 'NOTHING_TO_SHIP' });
        }
        if (tracking_number) {
          await client.query('UPDATE orders SET tracking_number=$1 WHERE id=$2', [tracking_number, orderId]);
        }
        derived = await svc.createFulfillment(orderId, remaining,
          { tracking_number: tracking_number || null },
          { note: base + '→派送中', processedBy: adminId });
      } else if (status === 'completed') {
        derived = await svc.completeOrder(orderId, { note: base + '→已完成', processedBy: adminId });
      } else if (status === 'cancelled') {
        derived = await svc.cancelOrder(orderId, { note: base + '→已取消', processedBy: adminId });
      } else {
        throw Object.assign(new Error('唔可以手動設為待付款；如需重置請用駁回憑證'), { code: 'INVALID_ORDER_TRANSITION' });
      }
      await client.query('COMMIT');

      const result = await pool.query('SELECT * FROM orders WHERE id=$1', [orderId]);
      res.json({ success: true, status: derived, order: result.rows[0] });
    } catch (err) {
      await client.query('ROLLBACK').catch(()=>{});
      if (err && (err.code === 'INVALID_ORDER_TRANSITION' || err.code === 'NOTHING_TO_SHIP')) {
        return res.status(400).json({ error: err.message });
      }
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    } finally {
      client.release();
    }
  });

  // Admin: Get order details (full info with items)
  app.get('/api/admin/orders/:id', requirePermission('orders:read'), async (req, res) => {
    try {
      const { id } = req.params;

      const orderResult = await pool.query(`
        SELECT o.*, u.username, u.contact, u.whatsapp, u.marketing_consent
        FROM orders o
        LEFT JOIN users u ON o.user_id = u.id
        WHERE o.id = $1
      `, [id]);

      if (orderResult.rows.length === 0) {
        return res.status(404).json({ error: '訂單不存在' });
      }

      const itemsResult = await pool.query(`
        SELECT oi.*, p.name, p.image_url
        FROM order_items oi
        JOIN products p ON oi.product_id = p.id
        WHERE oi.order_id = $1
      `, [id]);

      res.json({
        order: orderResult.rows[0],
        items: itemsResult.rows
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // ---- 入數證明（後台審批）----

  // 後台列出待審憑證
  app.get('/api/admin/payment-proofs/pending', requirePermission('orders:read'), async (req, res) => {
    try {
      const r = await pool.query(`
        SELECT pp.id, pp.order_id, pp.file_name, pp.mime_type, pp.file_size, pp.created_at,
               o.order_number, o.total_amount, o.payment_method_code, o.contact_name
        FROM payment_proofs pp JOIN orders o ON o.id = pp.order_id
        WHERE pp.status='pending' ORDER BY pp.created_at ASC
      `);
      res.json({ proofs: r.rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // 後台取憑證圖
  app.get('/api/admin/orders/:id/proof/image', requirePermission('orders:read'), async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const r = await pool.query('SELECT mime_type, file_data FROM payment_proofs WHERE order_id=$1 ORDER BY created_at DESC LIMIT 1', [id]);
      if (!r.rows[0]) return res.status(404).end();
      res.setHeader('Content-Type', r.rows[0].mime_type || 'image/jpeg');
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.send(r.rows[0].file_data);
    } catch (err) {
      console.error(err);
      res.status(500).end();
    }
  });

  // 確認收款：憑證 approved、訂單 payment_status=paid
  app.post('/api/admin/orders/:id/proof/approve', requirePermission('orders:write'), async (req, res) => {
    const client = await pool.connect();
    try {
      const reviewerId = req.session.userId;
      const id = parseInt(req.params.id, 10);
      await client.query('BEGIN');
      const pu = await client.query(`
        UPDATE payment_proofs SET status='approved', reviewed_by=$1, reviewed_at=NOW()
        WHERE order_id=$2 AND status='pending' RETURNING id
      `, [reviewerId, id]);
      if (pu.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: '冇待審嘅憑證' });
      }
      await client.query(`
        UPDATE orders SET paid_at=NOW() WHERE id=$1
      `, [id]);
      const orderSvc = createOrderService(client);
      const derived = await orderSvc.transitionPayment(id, 'paid', {
        note: '入數證明已審批確認收款', processedBy: reviewerId,
      });
      await client.query('COMMIT');
      res.json({ ok: true, payment_status: 'paid', status: derived });
    } catch (err) {
      await client.query('ROLLBACK').catch(()=>{});
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    } finally {
      client.release();
    }
  });

  // 駁回：憑證 rejected、訂單 payment_status 返 pending，等買家重傳
  app.post('/api/admin/orders/:id/proof/reject', requirePermission('orders:write'), async (req, res) => {
    const client = await pool.connect();
    try {
      const reviewerId = req.session.userId;
      const id = parseInt(req.params.id, 10);
      const reason = (req.body && req.body.reason ? String(req.body.reason) : '').slice(0, 300);
      await client.query('BEGIN');
      const pu = await client.query(`
        UPDATE payment_proofs SET status='rejected', reviewed_by=$1, reviewed_at=NOW(), reject_reason=$3
        WHERE order_id=$2 AND status='pending' RETURNING id
      `, [reviewerId, id, reason]);
      if (pu.rows.length === 0) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: '冇待審嘅憑證' });
      }
      await client.query("UPDATE orders SET updated_at=NOW() WHERE id=$1", [id]);
      const orderSvc = createOrderService(client);
      const derived = await orderSvc.transitionPayment(id, 'unpaid', {
        note: '入數證明被駁回：' + (reason || '冇註明原因'), processedBy: reviewerId,
      });
      await client.query('COMMIT');
      res.json({ ok: true, payment_status: 'pending', status: derived });
    } catch (err) {
      await client.query('ROLLBACK').catch(()=>{});
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    } finally {
      client.release();
    }
  });

  // ---- 入數證明（會員）----

  // 上傳入數證明：待付款或被駁回先准上傳
  app.post('/api/orders/:id/proof', requireAuth, proofUpload.single('proof'), async (req, res) => {
    try {
      const userId = req.session.userId;
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ error: '訂單編號無效' });

      const order = await loadOwnedOrder(userId, id);
      if (!order) return res.status(404).json({ error: '訂單不存在' });
      if (order.status === 'cancelled') return res.status(400).json({ error: '訂單已取消，唔可以上傳' });
      if (order.payment_status === 'paid') return res.status(400).json({ error: '訂單已確認收款' });
      if (!req.file) return res.status(400).json({ error: '請揀一張入數相' });

      // 舊 pending/rejected 憑證作廢（重傳場景），再插新一張
      await pool.query("UPDATE payment_proofs SET status='superseded', reviewed_at=NOW() WHERE order_id=$1 AND status IN ('pending','rejected')", [id]);
      const ins = await pool.query(`
        INSERT INTO payment_proofs (order_id, uploaded_by, file_name, mime_type, file_size, file_data, status)
        VALUES ($1,$2,$3,$4,$5,$6,'pending') RETURNING id
      `, [id, userId, req.file.originalname, req.file.mimetype, req.file.size, req.file.buffer]);

      await pool.query("UPDATE orders SET payment_status='proof_pending', updated_at=NOW() WHERE id=$1", [id]);

      res.json({ ok: true, proof_id: ins.rows[0].id, payment_status: 'proof_pending' });
    } catch (err) {
      console.error('proof upload error:', err);
      res.status(500).json({ error: err.message || '上傳失敗' });
    }
  });

  // 查詢我嘅最新憑證狀態（供頁面顯示）
  app.get('/api/orders/:id/proof', requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const id = parseInt(req.params.id, 10);
      if (!Number.isFinite(id)) return res.status(400).json({ error: '訂單編號無效' });
      const order = await loadOwnedOrder(userId, id);
      if (!order) return res.status(404).json({ error: '訂單不存在' });

      const r = await pool.query(`
        SELECT id, file_name, mime_type, file_size, status, reject_reason, created_at, reviewed_at
        FROM payment_proofs WHERE order_id=$1 ORDER BY created_at DESC LIMIT 1
      `, [id]);
      res.json({ payment_status: order.payment_status, proof: r.rows[0] || null });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // 取回我嘅憑證圖（只准本人）
  app.get('/api/orders/:id/proof/image', requireAuth, async (req, res) => {
    try {
      const userId = req.session.userId;
      const id = parseInt(req.params.id, 10);
      const order = await loadOwnedOrder(userId, id);
      if (!order) return res.status(404).end();
      const r = await pool.query('SELECT mime_type, file_data FROM payment_proofs WHERE order_id=$1 ORDER BY created_at DESC LIMIT 1', [id]);
      if (!r.rows[0]) return res.status(404).end();
      res.setHeader('Content-Type', r.rows[0].mime_type || 'image/jpeg');
      res.setHeader('Cache-Control', 'private, max-age=300');
      res.send(r.rows[0].file_data);
    } catch (err) {
      console.error(err);
      res.status(500).end();
    }
  });

};

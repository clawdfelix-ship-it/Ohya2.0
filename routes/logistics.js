// ===========================================
// Logistics & Order Tracking API
// Includes: ShipAny integration, returns & refunds
// Hong Kong E-commerce Full Feature
// ===========================================

module.exports = function(app, pool) {

  const requireAuth = require('./middleware/auth').requireAuth;
  const requireAdmin = require('./middleware/auth').requireAdmin;

  // ===========================================
  // Returns & Refunds (After-sales)
  // ===========================================

  // User: get my returns
  app.get('/api/user/returns', requireAuth, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT r.*, o.order_number
        FROM return_requests r
        JOIN orders o ON r.order_id = o.id
        WHERE r.user_id = $1
        ORDER BY r.created_at DESC
      `, [req.user.id]);
      res.json({ returns: result.rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // User: create return request
  app.post('/api/user/returns', requireAuth, async (req, res) => {
    try {
      const { order_id, reason, items, return_method, images } = req.body;

      // Verify order belongs to user
      const orderCheck = await pool.query(
        'SELECT id, status FROM orders WHERE id = $1 AND user_id = $2',
        [order_id, req.user.id]
      );
      if (orderCheck.rows.length === 0) {
        return res.status(404).json({ error: '訂單不存在' });
      }

      const result = await pool.query(`
        INSERT INTO return_requests (
          user_id, order_id, reason, items, return_method, images, status
        ) VALUES ($1, $2, $3, $4, $5, $6, 'pending')
        RETURNING id
      `, [
        req.user.id, order_id, reason,
        items ? JSON.stringify(items) : null,
        return_method,
        images ? JSON.stringify(images) : null
      ]);

      res.json({ success: true, return_id: result.rows[0].id });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Admin: list all return requests
  app.get('/api/admin/returns', requireAdmin, async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const pageSize = parseInt(req.query.page_size) || 30;
      const offset = (page - 1) * pageSize;
      const status = req.query.status;

      let where = '1=1';
      let params = [];
      if (status) {
        where += ` AND r.status = $1`;
        params.push(status);
      }

      const countResult = await pool.query(`SELECT COUNT(*) FROM return_requests r WHERE ${where}`, params);
      const total = parseInt(countResult.rows[0].count);

      const result = await pool.query(`
        SELECT r.*, o.order_number, o.total_amount, u.username
        FROM return_requests r
        JOIN orders o ON r.order_id = o.id
        JOIN users u ON r.user_id = u.id
        WHERE ${where}
        ORDER BY r.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `, [...params, pageSize, offset]);

      res.json({
        returns: result.rows,
        pagination: { page, page_size: pageSize, total }
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Admin: update return status
  app.put('/api/admin/returns/:id/status', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { status, admin_note, refund_amount, tracking_number } = req.body;

      await pool.query(`
        UPDATE return_requests SET
          status = $1, admin_note = $2, refund_amount = $3,
          tracking_number = $4, updated_at = NOW()
        WHERE id = $5
      `, [status, admin_note, refund_amount, tracking_number, id]);

      // If approved, update order status
      if (status === 'approved') {
        const returnResult = await pool.query('SELECT order_id FROM return_requests WHERE id = $1', [id]);
        if (returnResult.rows.length > 0) {
          await pool.query(
            'UPDATE orders SET status = \'refunded\' WHERE id = $1',
            [returnResult.rows[0].order_id]
          );
        }
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // ===========================================
  // Supplier & Purchasing Management
  // ===========================================

  app.get('/api/admin/suppliers', requireAdmin, async (req, res) => {
    try {
      const result = await pool.query(`
        SELECT * FROM suppliers ORDER BY is_active DESC, name
      `);
      res.json({ suppliers: result.rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  app.post('/api/admin/suppliers', requireAdmin, async (req, res) => {
    try {
      const { name, contact_name, contact_phone, contact_email, address, payment_terms, note } = req.body;
      const result = await pool.query(`
        INSERT INTO suppliers (name, contact_name, contact_phone, contact_email, address, payment_terms, note)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        RETURNING *
      `, [name, contact_name, contact_phone, contact_email, address, payment_terms, note]);
      res.json({ success: true, supplier: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  app.put('/api/admin/suppliers/:id', requireAdmin, async (req, res) => {
    try {
      const { id } = req.params;
      const { name, contact_name, contact_phone, contact_email, address, payment_terms, note, is_active } = req.body;

      const result = await pool.query(`
        UPDATE suppliers SET
          name = $1, contact_name = $2, contact_phone = $3, contact_email = $4,
          address = $5, payment_terms = $6, note = $7, is_active = $8, updated_at = NOW()
        WHERE id = $9
        RETURNING *
      `, [name, contact_name, contact_phone, contact_email, address, payment_terms, note, is_active, id]);

      if (result.rows.length === 0) {
        return res.status(404).json({ error: '供應商不存在' });
      }

      res.json({ success: true, supplier: result.rows[0] });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Purchase Orders (PO) to suppliers
  app.get('/api/admin/purchase-orders', requireAdmin, async (req, res) => {
    try {
      const page = parseInt(req.query.page) || 1;
      const pageSize = parseInt(req.query.page_size) || 30;
      const offset = (page - 1) * pageSize;
      const status = req.query.status;

      let where = '1=1';
      let params = [];
      if (status) {
        where += ` AND po.status = $1`;
        params.push(status);
      }

      const countResult = await pool.query(`SELECT COUNT(*) FROM purchase_orders po WHERE ${where}`, params);
      const total = parseInt(countResult.rows[0].count);

      const result = await pool.query(`
        SELECT po.*, s.name as supplier_name
        FROM purchase_orders po
        JOIN suppliers s ON po.supplier_id = s.id
        WHERE ${where}
        ORDER BY po.created_at DESC
        LIMIT $${params.length + 1} OFFSET $${params.length + 2}
      `, [...params, pageSize, offset]);

      res.json({
        purchase_orders: result.rows,
        pagination: { page, page_size: pageSize, total }
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  app.post('/api/admin/purchase-orders', requireAdmin, async (req, res) => {
    try {
      const { supplier_id, items, expected_arrival, note } = req.body;
      const client = await pool.connect();
      try {
        await client.query('BEGIN');

        // Calculate total
        let total = 0;
        if (items) {
          items.forEach(item => {
            total += item.quantity * item.cost_price;
          });
        }

        const result = await client.query(`
          INSERT INTO purchase_orders (supplier_id, total_amount, expected_arrival, note, status)
          VALUES ($1, $2, $3, $4, 'draft')
          RETURNING id
        `, [supplier_id, total, expected_arrival, note]);

        const poId = result.rows[0].id;

        // Insert items
        if (items && items.length > 0) {
          for (const item of items) {
            await client.query(`
              INSERT INTO purchase_order_items (
                purchase_order_id, product_id, product_sku_id,
                quantity, cost_price, received_quantity
              ) VALUES ($1, $2, $3, $4, $5, 0)
            `, [poId, item.product_id, item.product_sku_id, item.quantity, item.cost_price]);
          }
        }

        await client.query('COMMIT');
        res.json({ success: true, purchase_order_id: poId });
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

  // ===========================================
  // ShipAny 物流接駁 Integration
  // ===========================================

  // Generate ShipAny label (when order is ready to ship)
  app.post('/api/admin/shipany/generate-label', requireAdmin, async (req, res) => {
    try {
      const { order_id, recipient_name, recipient_phone, recipient_address, district, service_type, weight } = req.body;

      // Get ShipAny credentials from environment
      const apiKey = process.env.SHIPANY_API_KEY;
      const apiUrl = process.env.SHIPANY_API_URL || 'https://api.shipany.com/v1';

      if (!apiKey) {
        return res.status(500).json({ error: 'ShipAny 未設定，請檢查環境變量' });
      }

      // Format address for ShipAny (Hong Kong)
      const fullAddress = `${recipient_address}, Hong Kong, ${district}`;

      // Call ShipAny API
      // Reference: https://docs.shipany.com/
      const shipanyPayload = {
        order: {
          order_number: order_id,
          service_type: service_type, // e.g. "sf_express", "ecargo"
          sender: {
            name: process.env.SHIPANY_SENDER_NAME || 'Store Name',
            phone: process.env.SHIPANY_SENDER_PHONE || '',
            address: process.env.SHIPANY_SENDER_ADDRESS || ''
          },
          recipient: {
            name: recipient_name,
            phone: recipient_phone,
            address: fullAddress,
            district: district
          },
          parcel: {
            weight: weight || 1
          }
        }
      };

      // Make request to ShipAny
      const https = require('https');
      const url = require('url');
      const postData = JSON.stringify(shipanyPayload);
      const parsedUrl = url.parse(apiUrl + '/orders/create');

      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.path,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          'Authorization': `Bearer ${apiKey}`
        }
      };

      const shipanyReq = https.request(options, (shipanyRes) => {
        let data = '';
        shipanyRes.on('data', (chunk) => {
          data += chunk;
        });
        shipanyRes.on('end', async () => {
          try {
            const result = JSON.parse(data);
            if (result.success || result.status === 'ok') {
              // Save tracking number to order
              const trackingNumber = result.tracking_number || result.tn;
              await pool.query(
                'UPDATE orders SET tracking_number = $1, shipany_label_url = $2 WHERE id = $3',
                [trackingNumber, result.label_url, order_id]
              );

              // Save to order history
              await pool.query(`
                INSERT INTO order_status_histories (order_id, status, notes, created_by)
                VALUES ($1, 'shipped', $2, $3)
              `, [order_id, `ShipAny 標籤已生成：${trackingNumber}`, req.user.id]);

              res.json({
                success: true,
                tracking_number: trackingNumber,
                label_url: result.label_url,
                pdf_url: result.pdf_url
              });
            } else {
              res.status(400).json({ error: result.message || 'ShipAny 錯誤' });
            }
          } catch (e) {
            console.error(e);
            res.status(500).json({ error: '解析 ShipAny 回應失敗', raw: data });
          }
        });
      });

      shipanyReq.on('error', (err) => {
        console.error(err);
        res.status(500).json({ error: '連接 ShipAny API 失敗' });
      });

      shipanyReq.write(postData);
      shipanyReq.end();

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Webhook: ShipAny tracking status update
  app.post('/webhooks/shipany', async (req, res) => {
    try {
      // Verify webhook signature if secret is configured
      const webhookSecret = process.env.SHIPANY_WEBHOOK_SECRET;
      if (webhookSecret) {
        // TODO: Add signature verification according to ShipAny documentation
        // For now, just check that signature exists
        const signature = req.headers['x-shipany-signature'] || req.headers['X-ShipAny-Signature'];
        if (!signature) {
          return res.status(403).json({ success: false, error: 'Missing signature' });
        }
      }

      const { tracking_number, status, updated_at } = req.body;

      // Update order tracking status
      await pool.query(`
        UPDATE orders SET
          tracking_status = $1, tracking_updated_at = $2
        WHERE tracking_number = $3
      `, [status, updated_at, tracking_number]);

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false });
    }
  });

  // Get tracking info from ShipAny
  app.get('/api/orders/:id/tracking', requireAuth, async (req, res) => {
    try {
      const { id } = req.params;

      // Get order
      const orderResult = await pool.query(
        'SELECT id, order_number, tracking_number, tracking_status, tracking_updated_at FROM orders WHERE id = $1 AND user_id = $2',
        [id, req.user.id]
      );

      if (orderResult.rows.length === 0) {
        return res.status(404).json({ error: '訂單不存在' });
      }

      const order = orderResult.rows[0];

      if (!order.tracking_number) {
        return res.json({
          order_number: order.order_number,
          tracking_number: null,
          status: 'not_shipped'
        });
      }

      // Query ShipAny for latest tracking
      const apiKey = process.env.SHIPANY_API_KEY;
      const apiUrl = process.env.SHIPANY_API_URL || 'https://api.shipany.com/v1';

      if (!apiKey) {
        // Return stored info
        return res.json({
          tracking_number: order.tracking_number,
          status: order.tracking_status,
          updated_at: order.tracking_updated_at
        });
      }

      // Call ShipAny API
      const https = require('https');
      const url = require('url');
      const parsedUrl = url.parse(`${apiUrl}/tracking?tn=${order.tracking_number}`);

      const options = {
        hostname: parsedUrl.hostname,
        path: parsedUrl.path,
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${apiKey}`
        }
      };

      const shipanyReq = https.request(options, (response) => {
        let data = '';
        response.on('data', chunk => data += chunk);
        response.on('end', async () => {
          try {
            const result = JSON.parse(data);
            if (result.success) {
              // Update stored status
              await pool.query(`
                UPDATE orders SET tracking_status = $1, tracking_updated_at = NOW() WHERE id = $2
              `, [result.status, id]);

              res.json({
                tracking_number: order.tracking_number,
                status: result.status,
                events: result.events || [],
                updated_at: new Date()
              });
            } else {
              res.json({
                tracking_number: order.tracking_number,
                status: order.tracking_status,
                updated_at: order.tracking_updated_at,
                error: result.message
              });
            }
          } catch (e) {
            res.json({
              tracking_number: order.tracking_number,
              status: order.tracking_status,
              updated_at: order.tracking_updated_at
            });
          }
        });
      });

      shipanyReq.on('error', () => {
        res.json({
          tracking_number: order.tracking_number,
          status: order.tracking_status,
          updated_at: order.tracking_updated_at
        });
      });

      shipanyReq.end();

    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // ===========================================
  // Payment Gateways Webhooks
  // ===========================================

  // FPS / PayMe webhook
  app.post('/webhooks/fps-payme', async (req, res) => {
    try {
      const { transaction_id, order_id, amount, status } = req.body;

      // Update order payment status
      await pool.query(
        'UPDATE orders SET payment_status = $1, payment_transaction_id = $2, paid_at = NOW() WHERE id = $3',
        [status === 'success' ? 'paid' : 'failed', transaction_id, order_id]
      );

      if (status === 'success') {
        await pool.query(`
          INSERT INTO order_status_histories (order_id, status, notes)
          VALUES ($1, 'paid', $2)
        `, [order_id, 'FPS/PayMe 付款成功']);
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false });
    }
  });

  // AlipayHK webhook
  app.post('/webhooks/alipayhk', async (req, res) => {
    try {
      const { out_trade_no, trade_no, trade_status } = req.body;

      // AlipayHK: trade_status = TRADE_SUCCESS means paid
      if (trade_status === 'TRADE_SUCCESS') {
        await pool.query(
          'UPDATE orders SET payment_status = $1, payment_transaction_id = $2, paid_at = NOW() WHERE order_number = $3',
          ['paid', trade_no, out_trade_no]
        );

        const orderResult = await pool.query('SELECT id FROM orders WHERE order_number = $1', [out_trade_no]);
        if (orderResult.rows.length > 0) {
          await pool.query(`
            INSERT INTO order_status_histories (order_id, status, notes)
            VALUES ($1, 'paid', $2)
          `, [orderResult.rows[0].id, 'AlipayHK 付款成功']);
        }
      }

      res.json({ success: true });
    } catch (err) {
      console.error(err);
      res.status(500).json({ success: false });
    }
  });

  // WeChat Pay HK webhook
  app.post('/webhooks/wechatpay', async (req, res) => {
    try {
      const { out_trade_no, transaction_id, trade_state } = req.body;

      if (trade_state === 'SUCCESS') {
        await pool.query(
          'UPDATE orders SET payment_status = $1, payment_transaction_id = $2, paid_at = NOW() WHERE order_number = $3',
          ['paid', transaction_id, out_trade_no]
        );

        const orderResult = await pool.query('SELECT id FROM orders WHERE order_number = $1', [out_trade_no]);
        if (orderResult.rows.length > 0) {
          await pool.query(`
            INSERT INTO order_status_histories (order_id, status, notes)
            VALUES ($1, 'paid', $2)
          `, [orderResult.rows[0].id, 'WeChat Pay HK 付款成功']);
        }
      }

      res.send('<xml><return_code><![CDATA[SUCCESS]]></return_code><return_msg><![CDATA[OK]]></return_msg></xml>');
    } catch (err) {
      console.error(err);
      res.send('<xml><return_code><![CDATA[FAIL]]></return_code><return_msg><![CDATA[ERROR]]></return_msg></xml>');
    }
  });

};

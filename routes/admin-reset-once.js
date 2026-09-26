// ⚠️ 一次性後門：重設/建立一個全權管理員。跑完要即刻刪除呢個檔同掛載。
// 守護：必須帶對 ADMIN_RESET_SECRET（Vercel production env），用 timingSafeEqual。
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

module.exports = function adminResetOnce(app, pool) {
  app.post('/api/admin-reset-once', async (req, res) => {
    try {
      const expected = process.env.ADMIN_RESET_SECRET || '';
      const provided = String(req.get('x-reset-secret') || '');
      const a = Buffer.from(expected);
      const b = Buffer.from(provided);
      if (!expected || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
        return res.status(401).json({ ok: false, error: 'bad secret' });
      }
      if (!pool) return res.status(500).json({ ok: false, error: 'no pool' });

      const username = String(req.body && req.body.username || 'felix3216');
      const password = String(req.body && req.body.password || '');
      if (password.length < 8) {
        return res.status(400).json({ ok: false, error: 'password too short (min 8)' });
      }

      const hash = await bcrypt.hash(password, 12);
      const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);

      if (existing.rows.length) {
        await pool.query(
          `UPDATE users SET password_hash = $1, is_admin = true, is_active = true,
             is_blacklisted = false, updated_at = now() WHERE username = $2`,
          [hash, username]
        );
      } else {
        await pool.query(
          `INSERT INTO users (username, password_hash, is_admin, is_active, contact)
             VALUES ($1, $2, true, true, '')`,
          [username, hash]
        );
      }

      const verify = await pool.query(
        'SELECT id, username, is_admin, is_active FROM users WHERE username = $1',
        [username]
      );
      return res.json({ ok: true, action: existing.rows.length ? 'updated' : 'created', user: verify.rows[0] });
    } catch (err) {
      console.error('admin-reset-once failed', err);
      return res.status(500).json({ ok: false, error: err.message });
    }
  });
};

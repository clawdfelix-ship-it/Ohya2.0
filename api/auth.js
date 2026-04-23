module.exports = function(app, pool, requireAdmin, requireAuth, bcrypt) {

  // Register regular user
  app.post('/api/auth/register', async (req, res) => {
    try {
      const { username, password, contact } = req.body;

      if (!username || !password || password.length < 6) {
        return res.status(400).json({ error: '用戶名至少 6 位，密碼至少 6 位' });
      }

      // Check if username exists
      const existing = await pool.query('SELECT id FROM users WHERE username = $1', [username]);
      if (existing.rows.length > 0) {
        return res.status(400).json({ error: '用戶名已存在' });
      }

      const passwordHash = await bcrypt.hash(password, 10);

      const result = await pool.query(
        'INSERT INTO users (username, password_hash, contact, is_admin) VALUES ($1, $2, $3, false) RETURNING id, username, is_admin',
        [username, passwordHash, contact || null]
      );

      res.json({ success: true, userId: result.rows[0].id });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Login
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { username, password } = req.body;

      const result = await pool.query(
        'SELECT id, username, password_hash, is_admin, contact FROM users WHERE username = $1',
        [username]
      );

      if (result.rows.length === 0) {
        return res.status(400).json({ error: '用戶名或密碼錯誤' });
      }

      const user = result.rows[0];
      const match = await bcrypt.compare(password, user.password_hash);

      if (!match) {
        return res.status(400).json({ error: '用戶名或密碼錯誤' });
      }

      // Set session
      req.session.userId = user.id;
      req.session.username = user.username;
      req.session.isAdmin = user.is_admin;
      req.session.contact = user.contact;

      res.json({
        success: true,
        user: {
          id: user.id,
          username: user.username,
          isAdmin: user.is_admin,
          contact: user.contact
        }
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

  // Logout
  app.post('/api/auth/logout', (req, res) => {
    req.session.destroy(() => {
      res.json({ success: true });
    });
  });

  // Get current user
  app.get('/api/auth/me', (req, res) => {
    if (!req.session.userId) {
      return res.json({ user: null });
    }
    res.json({
      user: {
        id: req.session.userId,
        username: req.session.username,
        isAdmin: req.session.isAdmin,
        contact: req.session.contact
      }
    });
  });

  // List users (admin only)
  app.get('/api/admin/users', requireAdmin, async (req, res) => {
    try {
      const q = req.query.q || '';
      let query = 'SELECT id, username, is_admin, contact, created_at, entries_count FROM users';
      let params = [];

      if (q) {
        query += ' WHERE username ILIKE $1 OR contact ILIKE $1';
        params.push(`%${q}%`);
      }

      query += ' ORDER BY created_at DESC';
      const result = await pool.query(query, params);
      res.json({ users: result.rows });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: '服務器錯誤' });
    }
  });

};

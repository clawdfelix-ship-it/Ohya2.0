// Temporary, secret-guarded SMTP diagnostic endpoint.
// Remove (or this file) after debugging Zoho SMTP on Vercel.
// GET /api/diag/mail?key=<DIAG_SECRET>
'use strict';

module.exports = function (app) {
  app.get('/api/diag/mail', async (req, res) => {
    const secret = process.env.DIAG_SECRET || '';
    if (!secret || req.query.key !== secret) {
      return res.status(404).json({ error: 'not found' });
    }

    const out = {
      configured: false,
      host: process.env.ZOHO_SMTP_HOST || null,
      port: process.env.ZOHO_SMTP_PORT || null,
      user_present: Boolean(process.env.ZOHO_MAIL_USER),
      pass_present: Boolean(process.env.ZOHO_MAIL_PASS),
      from: process.env.ZOHO_MAIL_FROM_ADDRESS || null,
      verify: null,
      error: null,
    };

    try {
      const { isMailConfigured, verifyConnection } = require('../utils/mailer');
      out.configured = isMailConfigured();
      // hard 8s cap so the function can't hang
      const cfg = await Promise.race([
        verifyConnection(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT_8s')), 8000)),
      ]);
      out.verify = 'OK ' + cfg.user + ' via ' + cfg.host + ':' + cfg.port;
    } catch (err) {
      out.error = (err && err.message) ? err.message : String(err);
      if (err && err.code) out.error += ' | code=' + err.code;
    }
    res.json(out);
  });
};

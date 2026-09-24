// Temporary, secret-guarded SMTP diagnostic endpoint.
// Remove (or this file) after debugging Zoho SMTP on Vercel.
// GET /api/diag/mail?key=<DIAG_SECRET>[&tpl=1][&send=1]
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
      const mailer = require('../utils/mailer');
      out.configured = mailer.isMailConfigured();

      // hard 8s cap so the function can't hang
      const cfg = await Promise.race([
        mailer.verifyConnection(),
        new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT_8s')), 8000)),
      ]);
      out.verify = 'OK ' + cfg.user + ' via ' + cfg.host + ':' + cfg.port;

      // Optional: exercise the actual order email templates with a fake order
      if (String(req.query.tpl || '') === '1') {
        const { sendOrderConfirmation, sendAdminNewOrder } = require('../utils/orderEmails');
        const fakeOrder = {
          order_number: 'DIAG-' + Date.now(),
          contact_name: 'Diag Test',
          contact_phone: '95514133',
          contact_address: 'Diag address HK',
          total_amount: 123.45,
          payment_method_code: 'fps',
          note: 'diag template test',
          email: cfg.notifyAddress, // send customer copy to self too
        };
        const fakeItems = [
          { name: 'Diag Item A', quantity: 1, unit_price: 100 },
          { name: 'Diag Item B', quantity: 2, unit_price: 11.725 },
        ];
        const results = await Promise.all([
          Promise.race([sendOrderConfirmation(fakeOrder, fakeItems), new Promise((r) => setTimeout(() => r('T_CUST_TIMEOUT'), 10000))]),
          Promise.race([sendAdminNewOrder(fakeOrder, fakeItems), new Promise((r) => setTimeout(() => r('T_ADMIN_TIMEOUT'), 10000))]),
        ]);
        out.tpl_customer = results[0] && results[0].messageId ? 'SENT ' + results[0].messageId : ('NULL_OR_FAIL ' + JSON.stringify(results[0]));
        out.tpl_admin = results[1] && results[1].messageId ? 'SENT ' + results[1].messageId : ('NULL_OR_FAIL ' + JSON.stringify(results[1]));
      }

      // Optional: plain send to notify address
      if (String(req.query.send || '') === '1') {
        const info = await Promise.race([
          mailer.sendMail({
            to: cfg.notifyAddress,
            subject: '【Ohya】Live 發信測試 ' + new Date().toISOString(),
            html: '<p>由 live serverless 實際發出。收到即代表全鏈 OK。</p>',
            text: 'Live 發信測試',
          }),
          new Promise((resolve) => setTimeout(() => resolve('TIMEOUT_10s'), 10000)),
        ]);
        out.send = info && info.messageId
          ? 'SENT ' + info.messageId + ' accepted=' + JSON.stringify(info.accepted)
          : ('FAILED_OR_NULL ' + JSON.stringify(info));
      }
    } catch (err) {
      out.error = (err && err.message) ? err.message : String(err);
      if (err && err.code) out.error += ' | code=' + err.code;
    }
    res.json(out);
  });
};

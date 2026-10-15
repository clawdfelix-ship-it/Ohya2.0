module.exports = function registerCustomizerPages(app) {
  app.get('/customizer', (req, res) => {
    res.render('customizer/index', {
      title: '團體服訂製器 - OHYA2.0',
      user: req.session && req.session.userId ? { id: req.session.userId, isAdmin: !!req.session.isAdmin } : null,
    });
  });

  app.get('/customizer/editor', (req, res) => {
    const bootstrap = {
      productTypeId: req.query.productTypeId || null,
      templateId: req.query.templateId || null,
      startMode: req.query.startMode || 'template',
    };

    res.render('customizer/editor', {
      title: '編輯團體服設計 - OHYA2.0',
      user: req.session && req.session.userId ? { id: req.session.userId, isAdmin: !!req.session.isAdmin } : null,
      customizerBootstrap: bootstrap,
    });
  });

  app.get('/customizer/quote-success', (req, res) => {
    res.render('customizer/quote-success', {
      title: '報價提交完成 - OHYA2.0',
      user: req.session && req.session.userId ? { id: req.session.userId, isAdmin: !!req.session.isAdmin } : null,
    });
  });
};

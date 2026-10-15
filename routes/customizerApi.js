const { createCatalogModel } = require('../models/customizer/catalog');
const { buildDesignSession, createSessionsModel } = require('../models/customizer/sessions');
const { validateRosterItems } = require('../utils/customizer/validation');

function createSessionToken() {
  return `cs_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function toNullableId(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

module.exports = function registerCustomizerApi(app, pool) {
  const catalogModel = createCatalogModel(pool);
  const sessionsModel = createSessionsModel(pool);

  app.get('/api/customizer/catalog', async (req, res) => {
    if (!pool) return res.status(500).json({ error: 'Database not configured' });
    const [productTypes, templates, assets] = await Promise.all([
      catalogModel.listProductTypes(),
      catalogModel.listAllTemplates(),
      catalogModel.listAssets(),
    ]);
    res.json({ productTypes, templates, assets });
  });

  app.get('/api/customizer/product-types/:id/templates', async (req, res) => {
    if (!pool) return res.status(500).json({ error: 'Database not configured' });
    const productTypeId = toNullableId(req.params.id);
    if (!productTypeId) return res.status(400).json({ error: 'Invalid product type id' });
    const templates = await catalogModel.listTemplatesByProductType(productTypeId);
    res.json({ templates });
  });

  app.get('/api/customizer/templates/:id', async (req, res) => {
    if (!pool) return res.status(500).json({ error: 'Database not configured' });
    const templateId = toNullableId(req.params.id);
    if (!templateId) return res.status(400).json({ error: 'Invalid template id' });
    const [template, zones] = await Promise.all([
      catalogModel.getTemplateById(templateId),
      catalogModel.listTemplateZones(templateId),
    ]);
    if (!template) return res.status(404).json({ error: 'Template not found' });
    res.json({ template, zones });
  });

  app.get('/api/customizer/assets', async (req, res) => {
    if (!pool) return res.status(500).json({ error: 'Database not configured' });
    const assets = await catalogModel.listAssets({
      productTypeId: toNullableId(req.query.productTypeId),
      templateId: toNullableId(req.query.templateId),
      assetType: typeof req.query.assetType === 'string' ? req.query.assetType : null,
    });
    res.json({ assets });
  });

  app.post('/api/customizer/sessions', async (req, res) => {
    if (!pool) return res.status(500).json({ error: 'Database not configured' });

    const productTypeId = toNullableId(req.body && req.body.productTypeId);
    const templateId = toNullableId(req.body && req.body.templateId);
    const sessionPayload = buildDesignSession({
      selection: { productTypeId, templateId },
      design: req.body && req.body.design,
      roster: req.body && req.body.roster,
    });

    const session = await sessionsModel.createSession({
      sessionToken: createSessionToken(),
      productTypeId,
      templateId,
    });
    await sessionsModel.saveDesign(session.id, sessionPayload.design);
    res.status(201).json({ session, design: sessionPayload.design });
  });

  app.get('/api/customizer/sessions/:id', async (req, res) => {
    if (!pool) return res.status(500).json({ error: 'Database not configured' });
    const sessionId = toNullableId(req.params.id);
    if (!sessionId) return res.status(400).json({ error: 'Invalid session id' });
    const session = await sessionsModel.getSessionById(sessionId);
    if (!session) return res.status(404).json({ error: 'Session not found' });
    res.json({ session });
  });

  app.put('/api/customizer/sessions/:id/design', async (req, res) => {
    if (!pool) return res.status(500).json({ error: 'Database not configured' });
    const sessionId = toNullableId(req.params.id);
    if (!sessionId) return res.status(400).json({ error: 'Invalid session id' });
    const productTypeId = toNullableId(req.body && req.body.productTypeId);
    const templateId = toNullableId(req.body && req.body.templateId);
    const design = buildDesignSession({
      selection: { productTypeId, templateId },
      design: req.body && req.body.design,
    }).design;
    const session = await sessionsModel.updateSessionSelection(sessionId, { productTypeId, templateId });
    const saved = await sessionsModel.saveDesign(sessionId, design);
    res.json({ session, design: saved });
  });

  app.put('/api/customizer/sessions/:id/roster', async (req, res) => {
    if (!pool) return res.status(500).json({ error: 'Database not configured' });
    const sessionId = toNullableId(req.params.id);
    if (!sessionId) return res.status(400).json({ error: 'Invalid session id' });
    const validation = validateRosterItems((req.body && req.body.items) || []);
    if (!validation.valid) return res.status(400).json({ error: 'Invalid roster items', details: validation.errors });
    const saved = await sessionsModel.saveRoster(sessionId, validation.totalQuantity, { items: validation.normalizedItems });
    res.json({ roster: saved, items: validation.normalizedItems });
  });
};

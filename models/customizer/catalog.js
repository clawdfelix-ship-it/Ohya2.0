function createCatalogModel(db) {
  return {
    async listProductTypes() {
      const result = await db.query(
        `SELECT *
           FROM customizer_product_types
          WHERE status = 'active'
          ORDER BY sort_order ASC, id ASC`
      );
      return result.rows;
    },

    async listAllTemplates() {
      const result = await db.query(
        `SELECT *
           FROM customizer_templates
          WHERE status = 'active'
          ORDER BY product_type_id ASC, sort_order ASC, id ASC`
      );
      return result.rows;
    },

    async listTemplatesByProductType(productTypeId) {
      const result = await db.query(
        `SELECT *
           FROM customizer_templates
          WHERE product_type_id = $1
            AND status = 'active'
          ORDER BY sort_order ASC, id ASC`,
        [productTypeId]
      );
      return result.rows;
    },

    async getTemplateById(templateId) {
      const result = await db.query(
        `SELECT *
           FROM customizer_templates
          WHERE id = $1`,
        [templateId]
      );
      return result.rows[0] || null;
    },

    async listTemplateZones(templateId) {
      const result = await db.query(
        `SELECT *
           FROM customizer_template_zones
          WHERE template_id = $1
            AND status = 'active'
          ORDER BY sort_order ASC, id ASC`,
        [templateId]
      );
      return result.rows;
    },

    async listAssets({ productTypeId = null, templateId = null, assetType = null } = {}) {
      const result = await db.query(
        `SELECT *
           FROM customizer_design_assets
          WHERE status = 'active'
            AND ($1::bigint IS NULL OR product_type_id = $1 OR product_type_id IS NULL)
            AND ($2::bigint IS NULL OR template_id = $2 OR template_id IS NULL)
            AND ($3::text IS NULL OR asset_type = $3)
          ORDER BY id ASC`,
        [productTypeId, templateId, assetType]
      );
      return result.rows;
    },
  };
}

module.exports = {
  createCatalogModel,
};

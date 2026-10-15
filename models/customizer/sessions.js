function buildDesignSession(input = {}) {
  const selection = input.selection && typeof input.selection === 'object' ? input.selection : {};
  const design = input.design && typeof input.design === 'object' ? input.design : {};

  return {
    status: String(input.status || 'draft'),
    selection: {
      productTypeId: selection.productTypeId ?? selection.product_type_id ?? null,
      templateId: selection.templateId ?? selection.template_id ?? null,
    },
    design: {
      zones: Array.isArray(design.zones) ? design.zones : [],
      texts: design.texts && typeof design.texts === 'object' ? { ...design.texts } : {},
      logos: Array.isArray(design.logos) ? design.logos : [],
      notes: String(design.notes || ''),
    },
    roster: input.roster && typeof input.roster === 'object' ? { ...input.roster } : {},
    uploadedAssets: Array.isArray(input.uploadedAssets) ? input.uploadedAssets : [],
    pricing: input.pricing && typeof input.pricing === 'object' ? { ...input.pricing } : {},
  };
}

function createSessionsModel(db) {
  return {
    async createSession({ sessionToken, productTypeId = null, templateId = null, fulfillmentPath = null }) {
      const result = await db.query(
        `INSERT INTO customizer_sessions
          (session_token, product_type_id, template_id, fulfillment_path)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
        [sessionToken, productTypeId, templateId, fulfillmentPath]
      );
      return result.rows[0];
    },

    async getSessionById(sessionId) {
      const result = await db.query(
        `SELECT *
           FROM customizer_sessions
          WHERE id = $1`,
        [sessionId]
      );
      return result.rows[0] || null;
    },

    async updateSessionSelection(sessionId, { productTypeId = null, templateId = null } = {}) {
      const result = await db.query(
        `UPDATE customizer_sessions
            SET product_type_id = $2,
                template_id = $3,
                updated_at = NOW()
          WHERE id = $1
        RETURNING *`,
        [sessionId, productTypeId, templateId]
      );
      return result.rows[0] || null;
    },

    async saveDesign(sessionId, design) {
      const result = await db.query(
        `INSERT INTO customizer_session_designs (session_id, design_json)
         VALUES ($1, $2::jsonb)
         ON CONFLICT (session_id)
         DO UPDATE SET design_json = EXCLUDED.design_json, updated_at = NOW()
         RETURNING *`,
        [sessionId, JSON.stringify(design || {})]
      );
      return result.rows[0];
    },

    async saveRoster(sessionId, totalQuantity, meta = {}) {
      const result = await db.query(
        `INSERT INTO customizer_rosters (session_id, total_quantity, meta_json)
         VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (session_id)
         DO UPDATE SET total_quantity = EXCLUDED.total_quantity, meta_json = EXCLUDED.meta_json, updated_at = NOW()
         RETURNING *`,
        [sessionId, totalQuantity, JSON.stringify(meta || {})]
      );
      return result.rows[0];
    },

    async attachAssets(sessionId, uploadedAssetIds = []) {
      const ids = Array.isArray(uploadedAssetIds) ? uploadedAssetIds.filter(Boolean) : [];
      if (ids.length === 0) return [];
      const result = await db.query(
        `SELECT id, session_id, asset_role, storage_key, preview_storage_key
           FROM customizer_uploaded_assets
          WHERE session_id = $1
            AND id = ANY($2::bigint[])`,
        [sessionId, ids]
      );
      return result.rows;
    },
  };
}

module.exports = {
  buildDesignSession,
  createSessionsModel,
};

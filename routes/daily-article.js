'use strict';

/**
 * routes/daily-article.js
 *
 * 每日產品文章嘅內部 endpoints（用 x-sync-secret 認證，同 daily-sync 一致）：
 *   GET  /api/internal/daily-article/pick    → 揀今日要寫嘅產品（智能揀，未寫過）
 *   POST /api/internal/daily-article/publish → 落 DB 落 blog_posts（auto-publish）
 *
 * 設計：
 * - Agent（OpenClaw cron）每日 09:00 HKT call /pick，拎產品資料
 * - Agent 寫文 + 生圖 → POST 返去 /publish
 * - Server 負責 upload image 去 /public/assets/guide/daily/ + INSERT blog_posts + 記錄 article_products
 */

const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

module.exports = function registerDailyArticleRoutes(app, pool) {
  function getConfiguredSecrets() {
    return Array.from(
      new Set(
        [process.env.MZAKKA_SYNC_SECRET, process.env.CRON_SECRET]
          .map((v) => (typeof v === 'string' ? v.trim() : ''))
          .filter(Boolean)
      )
    );
  }

  function getProvidedSecret(req) {
    const headerSecret = req.get('x-sync-secret');
    if (headerSecret) return String(headerSecret);
    const auth = req.get('authorization') || '';
    const m = auth.match(/^Bearer\s+(.+)$/i);
    return m ? String(m[1]) : '';
  }

  function ensureAuthorized(req, res) {
    if (!pool) {
      res.status(500).json({ error: 'DATABASE_URL not configured' });
      return false;
    }
    const expected = getConfiguredSecrets();
    if (expected.length === 0) {
      res.status(503).json({ error: 'MZAKKA_SYNC_SECRET or CRON_SECRET not configured' });
      return false;
    }
    const provided = getProvidedSecret(req);
    if (!provided || !expected.includes(provided)) {
      res.status(401).json({ error: 'Invalid sync secret' });
      return false;
    }
    return true;
  }

  // 揀產品：智能規則，未寫過嘅優先
  // 優先順序：
  //   1. 最新上架（7 日內 created_at）
  //   2. 特價中（original_price > price）
  //   3. 高存貨（stock >= 10）
  //   4. 最舊未寫過嘅
  app.get('/api/internal/daily-article/pick', async (req, res) => {
    if (!ensureAuthorized(req, res)) return;
    try {
      // 確保 article_products 表存在（lazy migration）
      await pool.query(`
        CREATE TABLE IF NOT EXISTS article_products (
          product_id INTEGER PRIMARY KEY REFERENCES products(id) ON DELETE CASCADE,
          blog_post_id INTEGER REFERENCES blog_posts(id) ON DELETE SET NULL,
          written_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      const result = await pool.query(`
        SELECT p.id,
               COALESCE(p.name_zh_hk, p.name) as name,
               COALESCE(NULLIF(p.description_zh_hk, ''), NULLIF(p.description, '')) as description,
               COALESCE(pc.name_zh_hk, pc.name, c.name_zh_hk, c.name) as category_name,
               c.slug as category_slug,
               (p.price * 100)::int as price_cents,
               CASE WHEN p.original_price IS NULL THEN NULL ELSE (p.original_price * 100)::int END as original_price_cents,
               p.image_url,
               COALESCE(s.total_stock, 0)::int as stock,
               p.created_at,
               CASE WHEN p.original_price IS NOT NULL AND p.original_price > p.price THEN 1 ELSE 0 END as on_sale
        FROM products p
        LEFT JOIN categories c ON p.category_id = c.id
        LEFT JOIN categories pc ON c.parent_id = pc.id
        LEFT JOIN (
          SELECT product_id, SUM(stock)::int as total_stock
          FROM product_skus
          WHERE is_active = true
          GROUP BY product_id
        ) s ON s.product_id = p.id
        LEFT JOIN article_products ap ON ap.product_id = p.id
        WHERE p.status = 'active'
          AND COALESCE(p.name_zh_hk, p.name) NOT ILIKE '%販売終了%'
          AND ap.product_id IS NULL
        ORDER BY
          -- 最新上架優先（7 日內）
          CASE WHEN p.created_at > NOW() - INTERVAL '7 days' THEN 0 ELSE 1 END,
          -- 特價中優先
          CASE WHEN p.original_price IS NOT NULL AND p.original_price > p.price THEN 0 ELSE 1 END,
          -- 高存貨優先
          COALESCE(s.total_stock, 0) DESC,
          -- 最後按 created_at DESC（新嘅先寫）
          p.created_at DESC
        LIMIT 1
      `);

      if (!result.rows[0]) {
        return res.status(404).json({ error: 'No unwritten products available' });
      }

      const product = result.rows[0];
      // 頂層 storefront slug 推導（同 buildProductSeo 一致）
      let topSlug = null;
      if (product.category_slug) {
        const m = String(product.category_slug).match(/^sf-([a-z]+)-/);
        topSlug = m ? ('storefront-' + m[1]) : product.category_slug;
      }

      res.json({
        product: {
          id: product.id,
          name: product.name,
          description: product.description || '',
          category: product.category_name || '未分類',
          categorySlug: product.category_slug,
          topCategorySlug: topSlug,
          priceHkd: (product.price_cents / 100).toFixed(2),
          originalPriceHkd: product.original_price_cents ? (product.original_price_cents / 100).toFixed(2) : null,
          onSale: product.on_sale === 1,
          stock: product.stock,
          imageUrl: product.image_url,
          createdAt: product.created_at,
        },
      });
    } catch (e) {
      console.error('daily-article pick error:', e);
      res.status(500).json({ error: e.message });
    }
  });

  // 落 DB：title/slug/content/excerpt/meta_title/meta_description/featured_image（base64 或 URL）
  app.post('/api/internal/daily-article/publish', express.json({ limit: '15mb' }), async (req, res) => {
    if (!ensureAuthorized(req, res)) return;
    try {
      const {
        productId,
        title,
        slug,
        content,
        excerpt,
        metaTitle,
        metaDescription,
        imageBase64,       // optional: base64 encoded image
        imageMimeType,     // optional: image/png, image/jpeg
        imageUrl,          // optional: external URL（如果已上傳）
        status = 'published',
      } = req.body || {};

      if (!productId || !title || !slug || !content) {
        return res.status(400).json({ error: 'Missing required fields: productId, title, slug, content' });
      }

      // 處理 image：如果有 base64 → save 去 public/assets/guide/daily/
      let finalImageUrl = imageUrl || null;
      if (imageBase64) {
        const mime = imageMimeType || 'image/png';
        const ext = mime.includes('jpeg') || mime.includes('jpg') ? 'jpg' : 'png';
        const dir = path.join(__dirname, '..', 'public', 'assets', 'guide', 'daily');
        fs.mkdirSync(dir, { recursive: true });
        const hash = crypto.createHash('sha1').update(slug + Date.now()).digest('hex').slice(0, 8);
        const filename = `${slug}-${hash}.${ext}`;
        const filePath = path.join(dir, filename);
        const buf = Buffer.from(imageBase64, 'base64');
        fs.writeFileSync(filePath, buf);
        finalImageUrl = `/assets/guide/daily/${filename}`;
        console.log(`daily-article: saved image ${filePath} (${buf.length} bytes)`);
      }

      // Insert blog_posts（upsert on slug）
      const r = await pool.query(
        `INSERT INTO blog_posts (title, slug, content, excerpt, featured_image, status, publish_at, meta_title, meta_description, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW(), $7, $8, NOW(), NOW())
         ON CONFLICT (slug) DO UPDATE SET
           title = EXCLUDED.title,
           content = EXCLUDED.content,
           excerpt = EXCLUDED.excerpt,
           featured_image = EXCLUDED.featured_image,
           status = EXCLUDED.status,
           meta_title = EXCLUDED.meta_title,
           meta_description = EXCLUDED.meta_description,
           updated_at = NOW()
         RETURNING id, slug`,
        [title, slug, content, excerpt || null, finalImageUrl, status, metaTitle || title, metaDescription || excerpt || null]
      );

      const postId = r.rows[0].id;

      // 記錄 article_products（唔好重複寫同一產品）
      await pool.query(
        `INSERT INTO article_products (product_id, blog_post_id, written_at)
         VALUES ($1, $2, NOW())
         ON CONFLICT (product_id) DO UPDATE SET blog_post_id = EXCLUDED.blog_post_id, written_at = NOW()`,
        [productId, postId]
      );

      res.json({
        ok: true,
        postId,
        slug,
        url: `/guide/${slug}`,
        imageUrl: finalImageUrl,
      });
    } catch (e) {
      console.error('daily-article publish error:', e);
      res.status(500).json({ error: e.message });
    }
  });
};

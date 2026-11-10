-- Minimal production-shaped schema for the disposable Agent API PostgreSQL test.
-- This file is test-only and is never run by application migrations.
CREATE TABLE users (
  id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(100),
  password_hash VARCHAR(255) NOT NULL
);

CREATE TABLE brands (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  source VARCHAR(50),
  parent_id INTEGER REFERENCES categories(id) ON DELETE SET NULL
);

CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  name_zh_hk VARCHAR(255),
  slug VARCHAR(255) UNIQUE NOT NULL,
  description TEXT,
  description_zh_hk TEXT,
  short_description TEXT,
  short_description_zh_hk TEXT,
  brand_id INTEGER REFERENCES brands(id) ON DELETE SET NULL,
  category_id INTEGER REFERENCES categories(id) ON DELETE SET NULL,
  cost_price NUMERIC(10,2),
  price NUMERIC(10,2) NOT NULL,
  original_price NUMERIC(10,2),
  member_price NUMERIC(10,2),
  status VARCHAR(20) NOT NULL DEFAULT 'active',
  is_featured BOOLEAN DEFAULT false,
  image_url VARCHAR(500),
  gallery_images JSONB DEFAULT '[]'::jsonb,
  video_url VARCHAR(500),
  product_type VARCHAR(20) DEFAULT 'physical',
  is_digital BOOLEAN DEFAULT false,
  has_batch_expiry BOOLEAN DEFAULT false,
  enable_reviews BOOLEAN DEFAULT true,
  source VARCHAR(50),
  source_key VARCHAR(100),
  source_url TEXT,
  sync_status VARCHAR(50),
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ
);

CREATE TABLE product_skus (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku VARCHAR(100) UNIQUE,
  barcode VARCHAR(100),
  manufacturer_code VARCHAR(100),
  attributes JSONB NOT NULL DEFAULT '{}'::jsonb,
  price NUMERIC(10,2),
  cost_price NUMERIC(10,2),
  cost_price_jpy NUMERIC(10,2),
  wholesale_price_hkd NUMERIC(10,2),
  original_price NUMERIC(10,2),
  stock INTEGER NOT NULL DEFAULT 0,
  weight NUMERIC(10,2),
  weight_unit VARCHAR(10) DEFAULT 'g',
  is_active BOOLEAN NOT NULL DEFAULT true,
  match_status TEXT,
  match_source_jan TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE inventory_warehouses (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false
);

CREATE TABLE inventory_levels (
  warehouse_id INTEGER NOT NULL REFERENCES inventory_warehouses(id) ON DELETE CASCADE,
  sku_id INTEGER NOT NULL REFERENCES product_skus(id) ON DELETE CASCADE,
  stock INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (warehouse_id, sku_id)
);

CREATE TABLE inventory_transactions (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  sku_id INTEGER REFERENCES product_skus(id) ON DELETE CASCADE,
  warehouse_id INTEGER NOT NULL REFERENCES inventory_warehouses(id) ON DELETE CASCADE,
  type VARCHAR(50) NOT NULL,
  quantity INTEGER NOT NULL,
  previous_stock INTEGER NOT NULL,
  new_stock INTEGER NOT NULL,
  reference_id INTEGER,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sku_cost_history (
  id SERIAL PRIMARY KEY,
  sku_id INTEGER NOT NULL REFERENCES product_skus(id) ON DELETE CASCADE,
  old_cost_price NUMERIC(10,2),
  new_cost_price NUMERIC(10,2),
  changed_by_admin_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
  reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

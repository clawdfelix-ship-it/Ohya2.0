require('dotenv').config();

const { getPool } = require('../utils/getPool');

async function main() {
  const pool = getPool();

  const tx = await pool.query(
    "select id, type, sku_id, warehouse_id, quantity, note, created_at from inventory_transactions where type = 'purchase_receive' order by id desc limit 5"
  );
  const po = await pool.query(
    'select id, po_number, status, updated_at from purchase_orders order by id desc limit 3'
  );
  const items = await pool.query(
    'select id, po_id, sku_id, quantity, received_quantity, cost_price from purchase_order_items order by id desc limit 10'
  );
  const sku1 = await pool.query('select id, sku, stock, cost_price from product_skus where id = 1');
  const levels1 = await pool.query(
    'select sku_id, warehouse_id, stock from inventory_levels where sku_id = 1 order by warehouse_id'
  );

  console.log(JSON.stringify({
    purchase_receive: tx.rows,
    purchase_orders: po.rows,
    purchase_order_items: items.rows,
    sku1: sku1.rows[0] || null,
    levels1: levels1.rows,
  }, null, 2));

  await pool.end();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

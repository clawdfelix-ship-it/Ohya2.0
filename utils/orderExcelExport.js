const ExcelJS = require('exceljs');

const MONEY = '#,##0.00;(#,##0.00);-';
const ORDER_STATUS = { pending: '待付款', paid: '已付款', shipping: '派送中', delivered: '已送達', completed: '已完成', cancelled: '已取消' };
const PAYMENT_STATUS = { pending: '待付款', paid: '已付款', failed: '付款失敗', refunded: '已退款' };

// Customer-controlled cells must remain text, never executable formulas.
function text(value) {
  if (value === null || value === undefined) return '';
  const result = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return /^[\s\uFEFF]*[=+\-@\uFF1D\uFF0B\uFF0D\uFF20]/.test(result) ? `'${result}` : result;
}
function number(value) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function hongKongTime(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return text(value);
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const get = type => parts.find(part => part.type === type)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

const orderColumns = [
  ['訂單 ID', 'id', 12], ['訂單編號', 'order_number', 21],
  ['建立時間（香港）', 'created_at', 21], ['訂單狀態', 'status', 14],
  ['付款狀態', 'payment_status', 14], ['客戶名稱', 'contact_name', 20],
  ['聯絡電話', 'contact_phone', 20], ['電郵', 'contact_email', 28],
  ['收貨地址', 'contact_address', 44], ['地區', 'district', 14],
  ['商品小計（HKD）', 'subtotal_amount', 18], ['運費（HKD）', 'shipping_fee', 15],
  ['折扣（HKD）', 'discount_amount', 15], ['優惠券折扣（HKD）', 'coupon_discount', 20],
  ['訂單總額（HKD）', 'total_amount', 18], ['付款方式', 'payment_method_code', 17],
  ['物流單號', 'tracking_number', 22], ['備註', 'note', 36], ['客戶帳號', 'username', 20],
].map(([header, key, width]) => ({ header, key, width }));
const itemColumns = [
  ['訂單 ID', 'order_id', 12], ['訂單編號', 'order_number', 21],
  ['客戶名稱', 'contact_name', 20], ['商品名稱', 'product_name', 48],
  ['SKU', 'sku', 18], ['JAN Code', 'barcode', 19], ['規格', 'attributes', 24],
  ['數量', 'quantity', 10], ['單價（HKD）', 'unit_price', 16], ['小計（HKD）', 'subtotal', 16],
].map(([header, key, width]) => ({ header, key, width }));

function addSheet(workbook, name, columns) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1, showGridLines: false }] });
  sheet.columns = columns;
  const header = sheet.getRow(1);
  header.height = 32;
  header.font = { name: 'Arial', size: 10, bold: true, color: { argb: 'FFFFFFFF' } };
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF26384A' } };
  header.alignment = { vertical: 'middle', wrapText: true };
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return sheet;
}
function addRow(sheet, values) {
  const row = sheet.addRow(values);
  row.font = { name: 'Arial', size: 10 };
  row.alignment = { vertical: 'top', wrapText: true };
  row.height = 28;
}
function orderRow(order) {
  return {
    id: Number(order.id), order_number: text(order.order_number || order.id),
    created_at: hongKongTime(order.created_at), status: ORDER_STATUS[order.status] || text(order.status),
    payment_status: PAYMENT_STATUS[order.payment_status] || text(order.payment_status),
    contact_name: text(order.contact_name || order.username), contact_phone: text(order.contact_phone),
    contact_email: text(order.contact_email), contact_address: text(order.contact_address),
    district: text(order.district), subtotal_amount: number(order.subtotal_amount),
    shipping_fee: number(order.shipping_fee), discount_amount: number(order.discount_amount),
    coupon_discount: number(order.coupon_discount), total_amount: number(order.total_amount),
    payment_method_code: text(order.payment_method_code), tracking_number: text(order.tracking_number),
    note: text(order.note), username: text(order.username),
  };
}
function itemRow(item, order = {}) {
  return {
    order_id: Number(item.order_id), order_number: text(order.order_number || item.order_id),
    contact_name: text(order.contact_name || order.username), product_name: text(item.product_name || item.name),
    sku: text(item.sku), barcode: text(item.barcode), attributes: text(item.sku_attributes),
    quantity: number(item.quantity), unit_price: number(item.unit_price), subtotal: number(item.subtotal),
  };
}

async function buildOrderWorkbook(orders, items) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Ohya2.0';
  workbook.created = new Date();
  const orderSheet = addSheet(workbook, '訂單總覽', orderColumns);
  const itemSheet = addSheet(workbook, '商品明細', itemColumns);
  const orderMap = new Map(orders.map(order => [Number(order.id), order]));
  for (const order of orders) addRow(orderSheet, orderRow(order));
  const itemCounts = new Map();
  for (const item of items) {
    const id = Number(item.order_id);
    addRow(itemSheet, itemRow(item, orderMap.get(id) || {}));
    itemCounts.set(id, (itemCounts.get(id) || 0) + 1);
  }
  // Keep every order traceable even if an old/incomplete order has no item rows.
  for (const order of orders) {
    if (!itemCounts.get(Number(order.id))) addRow(itemSheet, itemRow({ order_id: order.id }, order));
  }
  for (const key of ['subtotal_amount', 'shipping_fee', 'discount_amount', 'coupon_discount', 'total_amount']) orderSheet.getColumn(key).numFmt = MONEY;
  for (const key of ['contact_phone', 'tracking_number']) orderSheet.getColumn(key).numFmt = '@';
  itemSheet.getColumn('barcode').numFmt = '@';
  for (const key of ['unit_price', 'subtotal']) itemSheet.getColumn(key).numFmt = MONEY;
  return workbook;
}

function safeOrderFilename(id) {
  const orderId = Number(id);
  return Number.isInteger(orderId) && orderId > 0 ? `order-${orderId}.xlsx` : `orders-${new Date().toISOString().slice(0, 10)}.xlsx`;
}

module.exports = { buildOrderWorkbook, safeOrderFilename };

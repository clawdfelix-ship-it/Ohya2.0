const express = require('express');
const path = require('path');

const app = express();

// Configure EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// Sample products - ALWAYS work
const sampleProducts = [
  { id: 1, name: '經典 T 恤', description: '優質純棉 T 恤，舒適透氣', price: 19900, stock: 50, image_url: null },
  { id: 2, name: '休閒牛仔褲', description: '經典款式，百搭易襯', price: 39900, stock: 30, image_url: null },
  { id: 3, name: '運動外套', description: '輕質防風，適合戶外活動', price: 59900, stock: 20, image_url: null },
  { id: 4, name: '時尚背包', description: '大容量設計，實用耐用', price: 29900, stock: 40, image_url: null },
  { id: 5, name: '真皮皮帶', description: '意大利頭層牛皮，高貴大方', price: 49900, stock: 25, image_url: null },
  { id: 6, name: '運動波鞋', description: '減震設計，舒適好穿', price: 79900, stock: 15, image_url: null },
  { id: 7, name: '羊毛頸巾', description: '100% 羊毛，保暖時尚', price: 34900, stock: 35, image_url: null },
  { id: 8, name: '皮革銀包', description: 'RFID 防盜，實用之選', price: 44900, stock: 45, image_url: null },
];

const sampleCategories = [
  { id: 1, name: '男裝' },
  { id: 2, name: '女裝' },
  { id: 3, name: '配件' },
  { id: 4, name: '運動用品' },
];

// ROUTES - DEFINED FIRST, BEFORE ANYTHING ELSE

// 首頁
app.get('/', (req, res) => {
  res.render('index', {
    title: 'Ohya2.0 電商平台',
    products: sampleProducts,
    categories: sampleCategories,
    user: null
  });
});

// 商品列表頁
app.get('/products', (req, res) => {
  res.render('products', {
    title: '全部商品 - Ohya2.0',
    products: sampleProducts,
    categories: sampleCategories,
    user: null
  });
});

// 商品詳情頁
app.get('/product/:id', (req, res) => {
  const product = sampleProducts.find(p => p.id === parseInt(req.params.id)) || sampleProducts[0];
  res.render('product', {
    title: product.name + ' - Ohya2.0',
    product: product,
    user: null
  });
});

// 登入頁
app.get('/login', (req, res) => {
  res.render('login', {
    title: '登入 - Ohya2.0',
    user: null
  });
});

// 註冊頁
app.get('/register', (req, res) => {
  res.render('register', {
    title: '註冊 - Ohya2.0',
    user: null
  });
});

// 購物車頁
app.get('/cart', (req, res) => {
  res.render('cart', {
    title: '購物車 - Ohya2.0',
    user: null
  });
});

// Catch-all - redirect to home
app.get('*', (req, res) => {
  res.redirect('/');
});

module.exports = app;

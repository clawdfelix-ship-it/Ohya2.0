const express = require('express');
const path = require('path');

const app = express();

// Configure EJS
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '../views'));

// M-ZAKKA 真實產品資料
const products = [
  {
    id: 1,
    name: 'PRO-E 經典系列',
    category: '男士護理',
    price: 29900,
    originalPrice: 39900,
    description: '日本 M-ZAKKA 經典產品，專為男士設計嘅高質護理系列，日本製造，品質保證。',
    stock: 50,
    image: 'https://placehold.co/400x400/667eea/ffffff?text=PRO-E+Classic'
  },
  {
    id: 2,
    name: '狂也 極致刺激系列',
    category: '男士護理',
    price: 39900,
    originalPrice: 49900,
    description: '狂也系列終極之作，帶來前所未有的刺激體驗，日本熱賣超人氣產品。',
    stock: 30,
    image: 'https://placehold.co/400x400/764ba2/ffffff?text=KYOYA+Ultra'
  },
  {
    id: 3,
    name: 'PRO-E 專用潤滑液',
    category: '護理配件',
    price: 15900,
    originalPrice: 19900,
    description: 'PRO-E 專用配方，水潤易清洗，不黏膩，適合敏感肌膚使用。',
    stock: 100,
    image: 'https://placehold.co/400x400/f093fb/ffffff?text=Lotion'
  },
  {
    id: 4,
    name: 'PRO-E BACK 專用護理霜',
    category: '男士護理',
    price: 18900,
    originalPrice: 23900,
    description: '特別配方，專為後庭護理設計，溫和不刺激，長效保濕。',
    stock: 60,
    image: 'https://placehold.co/400x400/60a5fa/ffffff?text=BACK+Cream'
  },
  {
    id: 5,
    name: 'PRO-E UNO 系列',
    category: '男士護理',
    price: 34900,
    originalPrice: 44900,
    description: 'UNO 入門級系列，適合初次使用者，性價比極高，新手必試。',
    stock: 45,
    image: 'https://placehold.co/400x400/34d399/ffffff?text=UNO+Series'
  },
  {
    id: 6,
    name: 'PRO-E DUE 雙重系列',
    category: '男士護理',
    price: 44900,
    originalPrice: 54900,
    description: '雙重功效配方，一舉兩得，帶來雙倍體驗，進階用家首選。',
    stock: 25,
    image: 'https://placehold.co/400x400/fbbf24/333333?text=DUE+Series'
  },
  {
    id: 7,
    name: 'Pro-E Maximum Striker',
    category: '進階系列',
    price: 59900,
    originalPrice: 74900,
    description: '終極攻擊型，Maximum 系列最強之作，為資深玩家而設。',
    stock: 15,
    image: 'https://placehold.co/400x400/ef4444/ffffff?text=Maximum+Striker'
  },
  {
    id: 8,
    name: 'Pro-E Extender 延長系列',
    category: '男士護理',
    price: 37900,
    originalPrice: 47900,
    description: '獨特延長配方，令享受時間更持久，提升自信心必備之選。',
    stock: 35,
    image: 'https://placehold.co/400x400/8b5cf6/ffffff?text=Extender'
  },
  {
    id: 9,
    name: 'PRO-E TRE 頂級系列',
    category: '頂級系列',
    price: 69900,
    originalPrice: 89900,
    description: 'TRE 旗艦級系列，揉合多種專利技術，帶來殿堂級體驗，終極之選。',
    stock: 10,
    image: 'https://placehold.co/400x400/ec4899/ffffff?text=TRE+Premium'
  },
  {
    id: 10,
    name: 'MASTER-E 大師系列',
    category: '頂級系列',
    price: 79900,
    originalPrice: 99900,
    description: 'MASTER-E 大師級作品，集多年技術大成，專業用家一致好評。',
    stock: 8,
    image: 'https://placehold.co/400x400/14b8a6/ffffff?text=MASTER-E'
  },
  {
    id: 11,
    name: '狂也 激熱開發霜',
    category: '男士護理',
    price: 25900,
    originalPrice: 32900,
    description: '激熱配方，帶來溫熱感覺，促進血液循環，提升敏感度。',
    stock: 40,
    image: 'https://placehold.co/400x400/f97316/ffffff?text=Heat+Cream'
  },
  {
    id: 12,
    name: '狂也 後庭專用系列',
    category: '男士護理',
    price: 32900,
    originalPrice: 41900,
    description: '專為後庭開發而設，溫和配方，適合各種程度使用者。',
    stock: 55,
    image: 'https://placehold.co/400x400/a855f7/ffffff?text=Back+Series'
  },
  {
    id: 13,
    name: 'MEN\'S MANZOKU 極致潤滑液',
    category: '護理配件',
    price: 19900,
    originalPrice: 25900,
    description: 'MANZOKU 品牌經典，長效持久，易清洗，香港男士最愛。',
    stock: 80,
    image: 'https://placehold.co/400x400/06b6d4/ffffff?text=MANZOKU+Lotion'
  },
  {
    id: 14,
    name: 'PRO-E 凡士林 D.B',
    category: '護理配件',
    price: 12900,
    originalPrice: 16900,
    description: '高純度凡士林，多功能用途，滋潤保濕，必備護理產品。',
    stock: 120,
    image: 'https://placehold.co/400x400/84cc16/ffffff?text=Vaseline+DB'
  },
  {
    id: 15,
    name: 'PRO-E GOLD 金裝版',
    category: '頂級系列',
    price: 49900,
    originalPrice: 62900,
    description: '金裝升級版 PRO-E，黃金配方，帶來昇華體驗，回頭客首選。',
    stock: 20,
    image: 'https://placehold.co/400x400/eab308/333333?text=GOLD+Edition'
  },
  {
    id: 16,
    name: 'MASTER-E Handler 操控系列',
    category: '進階系列',
    price: 45900,
    originalPrice: 57900,
    description: 'MASTER-E 專用配件，提升操控感，帶來更精準嘅體驗。',
    stock: 22,
    image: 'https://placehold.co/400x400/64748b/ffffff?text=Handler'
  },
  {
    id: 17,
    name: 'M-ZAKKA 全套體驗套裝',
    category: '優惠套裝',
    price: 149900,
    originalPrice: 199900,
    description: '一次過擁有 M-ZAKKA 最受歡迎嘅 5 款產品，超值優惠套裝，節省高達 $500！',
    stock: 5,
    image: 'https://placehold.co/400x400/be123c/ffffff?text=FULL+SET'
  }
];

const categories = [
  { id: 1, name: '全部商品', count: 17 },
  { id: 2, name: '男士護理', count: 8 },
  { id: 3, name: '護理配件', count: 4 },
  { id: 4, name: '進階系列', count: 2 },
  { id: 5, name: '頂級系列', count: 3 },
  { id: 6, name: '優惠套裝', count: 1 }
];

// Helper function - format price
function formatPrice(price) {
  return '$' + (price / 100).toFixed(2);
}

// Helper function - get category name
function getCategoryName(categoryId) {
  const cat = categories.find(c => c.name === categoryId);
  return cat ? cat.name : categoryId;
}

// ROUTES

// 首頁
app.get('/', (req, res) => {
  const featuredProducts = products.slice(0, 8);
  res.render('index', {
    title: 'Ohya2.0 電商平台',
    products: featuredProducts,
    categories: categories,
    user: null,
    formatPrice: formatPrice
  });
});

// 商品列表頁
app.get('/products', (req, res) => {
  const categoryFilter = req.query.category;
  let filteredProducts = products;
  
  if (categoryFilter && categoryFilter !== '全部商品') {
    filteredProducts = products.filter(p => p.category === categoryFilter);
  }
  
  res.render('products', {
    title: '全部商品 - Ohya2.0',
    products: filteredProducts,
    categories: categories,
    user: null,
    formatPrice: formatPrice,
    selectedCategory: categoryFilter || '全部商品'
  });
});

// 商品詳情頁
app.get('/product/:id', (req, res) => {
  const product = products.find(p => p.id === parseInt(req.params.id));
  if (!product) {
    return res.redirect('/products');
  }
  
  const relatedProducts = products
    .filter(p => p.category === product.category && p.id !== product.id)
    .slice(0, 4);
  
  res.render('product', {
    title: product.name + ' - Ohya2.0',
    product: product,
    relatedProducts: relatedProducts,
    user: null,
    formatPrice: formatPrice
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
    user: null,
    formatPrice: formatPrice
  });
});

// Catch-all - redirect to home
app.get('*', (req, res) => {
  res.redirect('/');
});

module.exports = app;

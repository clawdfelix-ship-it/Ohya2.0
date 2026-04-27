const fs = require('fs');
const path = require('path');
const { toProxyUrl } = require('./imageUtils');

const PRODUCTS_FILE = path.join(__dirname, '../data/sample-products.jsonl');

let products = [];
let categories = new Map();

// Load products on startup
function loadProducts() {
  if (!fs.existsSync(PRODUCTS_FILE)) {
    console.warn('Sample products file not found, using fallback');
    return getFallbackProducts();
  }

  const lines = fs.readFileSync(PRODUCTS_FILE, 'utf8').trim().split('\n');
  products = lines.map((line, index) => {
    try {
      const item = JSON.parse(line);
      return {
        id: index + 1,
        name: item.name || 'Unknown Product',
        category: item.category || 'メンズケア',
        price: Math.round((item.price || 29900) * 0.01), // Convert cents to HKD approx
        originalPrice: Math.round((item.originalPrice || 39900) * 0.01),
        priceYen: item.price || 29900,
        originalPriceYen: item.originalPrice || 39900,
        description: item.description || '日本 M-ZAKKA 原裝進口高品質產品。',
        stock: Math.floor(Math.random() * 100) + 10,
        images: (item.images || []).map(url => toProxyUrl(url)),
        image: (item.images && item.images[0]) ? toProxyUrl(item.images[0]) : null,
        points: Math.floor((item.price || 29900) * 0.1),
        isSale: (item.originalPrice || 0) > (item.price || 0),
        isLimited: Math.random() > 0.7
      };
    } catch (e) {
      return null;
    }
  }).filter(p => p !== null);

  // Build categories
  products.forEach(p => {
    const count = categories.get(p.category) || 0;
    categories.set(p.category, count + 1);
  });

  console.log(`✅ Loaded ${products.length} products, ${categories.size} categories`);
  return products;
}

function getFallbackProducts() {
  return [
    {
      id: 1,
      name: 'PRO-E クラシックシリーズ',
      category: 'PRO-E シリーズ',
      price: 299,
      originalPrice: 399,
      priceYen: 29900,
      originalPriceYen: 39900,
      description: '先端部が奥から外へ掻き出すようなスライド運動により、既知の製品では成し得なかった"擦る～探る"事がついに可能に。',
      stock: 50,
      images: [],
      image: 'https://placehold.co/400x400/222/fff?text=PRO-E',
      points: 2990,
      isSale: true,
      isLimited: false
    }
  ];
}

// Initialize
loadProducts();

module.exports = {
  getAllProducts: (page = 1, limit = 24) => {
    const start = (page - 1) * limit;
    const end = start + limit;
    return {
      products: products.slice(start, end),
      total: products.length,
      page,
      totalPages: Math.ceil(products.length / limit)
    };
  },

  getProductById: (id) => {
    return products.find(p => p.id === parseInt(id));
  },

  getProductsByCategory: (category, page = 1, limit = 24) => {
    const filtered = products.filter(p => p.category === category);
    const start = (page - 1) * limit;
    const end = start + limit;
    return {
      products: filtered.slice(start, end),
      total: filtered.length,
      page,
      totalPages: Math.ceil(filtered.length / limit)
    };
  },

  searchProducts: (query, page = 1, limit = 24) => {
    const q = query.toLowerCase();
    const filtered = products.filter(p => 
      p.name.toLowerCase().includes(q) || 
      p.description.toLowerCase().includes(q) ||
      p.category.toLowerCase().includes(q)
    );
    const start = (page - 1) * limit;
    const end = start + limit;
    return {
      products: filtered.slice(start, end),
      total: filtered.length,
      page,
      totalPages: Math.ceil(filtered.length / limit)
    };
  },

  getCategories: () => {
    return Array.from(categories.entries()).map(([name, count]) => ({ name, count }));
  },

  getFeaturedProducts: (limit = 12) => {
    return products.slice(0, limit);
  }
};

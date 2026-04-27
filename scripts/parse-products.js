const fs = require('fs');
const path = require('path');

const productsDir = '/Users/chansiulungfelix/.openclaw/workspace-coding-qwen/mzakka-clone/mzakka.com/mzakka.com/products';

const products = [];
const itemFiles = fs.readdirSync(productsDir).filter(f => f.startsWith('item') && f.endsWith('.html'));

itemFiles.forEach((file, index) => {
  const html = fs.readFileSync(path.join(productsDir, file), 'utf8');
  
  // Extract title
  const titleMatch = html.match(/<title>([^<]+)<\/title>/);
  const title = titleMatch ? titleMatch[1].trim() : `Product ${index + 1}`;
  
  // Extract description from 商品説明 section
  let description = '';
  const descMatch = html.match(/<p id="item_p04_SubTitle"[^>]*>商品説明<\/p>\s*<\/div>\s*<p>([^<]+)<\/p>/);
  if (descMatch) {
    description = descMatch[1].trim();
  }
  
  // Map to Chinese categories
  const categoryMap = {
    'PRO-E': 'PRO-E 系列',
    'Master': 'MASTER 系列',
    '狂也': '狂也系列',
    'Extender': '配件系列',
    'Lotion': '潤滑劑系列'
  };
  
  let category = '男士護理';
  for (const [key, cat] of Object.entries(categoryMap)) {
    if (title.includes(key) || description.includes(key)) {
      category = cat;
      break;
    }
  }
  
  // Generate realistic prices (in cents)
  const basePrice = 29900 + (index * 3000);
  const originalPrice = basePrice + Math.floor(Math.random() * 15000) + 5000;
  
  products.push({
    id: index + 1,
    code: file.replace('.html', ''),
    name: title,
    category: category,
    price: basePrice,
    originalPrice: originalPrice,
    description: description || '日本 M-ZAKKA 原裝進口，高品質保證。',
    stock: Math.floor(Math.random() * 100) + 10,
    image: `https://placehold.co/400x400/${generateColor(index)}/ffffff?text=${encodeURIComponent(title)}`
  });
  
  console.log(`✅ Parsed: ${file} -> ${title}`);
});

function generateColor(index) {
  const colors = ['667eea', '764ba2', 'f093fb', '60a5fa', '34d399', 'fbbf24', 'ef4444', '8b5cf6', 'ec4899', '14b8a6'];
  return colors[index % colors.length];
}

console.log('\n📊 Total products parsed:', products.length);
console.log('\n📦 Products JSON:');
console.log(JSON.stringify(products, null, 2));

// Save to file
fs.writeFileSync(
  path.join(__dirname, '../data/products.json'),
  JSON.stringify(products, null, 2)
);
console.log('\n✅ Saved to data/products.json');

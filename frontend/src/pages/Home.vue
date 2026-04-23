<script setup>
import { ref, onMounted, computed } from 'vue'
import { productsAPI, categoriesAPI } from '../services/api'
import { useRouter } from 'vue-router'

const router = useRouter()
const products = ref([])
const categories = ref([])
const loading = ref(true)
const page = ref(1)
const searchQuery = ref('')
const selectedCategory = ref(null)
const pagination = ref({})

async function loadProducts() {
  loading.value = true
  try {
    const params = { page: page.value }
    if (searchQuery.value) {
      params.search = searchQuery.value
    }
    if (selectedCategory.value) {
      params.category_id = selectedCategory.value
    }
    const res = await productsAPI.getAll(params)
    products.value = res.data.products
    pagination.value = res.data.pagination
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

async function loadCategories() {
  try {
    const res = await categoriesAPI.getAll()
    categories.value = res.data.categories
  } catch (err) {
    console.error(err)
  }
}

function goToProduct(productId) {
  router.push(`/product/${productId}`)
}

function goToCategory(categoryId) {
  selectedCategory.value = categoryId
  page.value = 1
  loadProducts()
}

function changePage(newPage) {
  page.value = newPage
  loadProducts()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(() => {
  loadProducts()
  loadCategories()
})

function formatPrice(price) {
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD' }).format(price)
}
</script>

<template>
  <div class="home-page">
    <div class="sidebar">
      <h3>商品分類</h3>
      <ul class="category-list">
        <li @click="selectedCategory = null; page.value = 1; loadProducts()"
            :class="{ active: selectedCategory === null }">
          全部商品
        </li>
        <li v-for="cat in categories" :key="cat.id"
            @click="goToCategory(cat.id)"
            :class="{ active: selectedCategory === cat.id }">
          {{ cat.name }} ({{ cat.product_count }})
        </li>
      </ul>
    </div>

    <div class="main-content">
      <div class="search-bar">
        <input
          v-model="searchQuery"
          @keyup.enter="page.value = 1; loadProducts()"
          placeholder="搜尋商品..."
          class="search-input"
        />
        <button @click="page.value = 1; loadProducts()" class="search-btn">搜尋</button>
      </div>

      <div v-if="loading" class="loading">載入中...</div>

      <div v-else class="product-grid">
        <div
          v-for="product in products"
          :key="product.id"
          class="product-card"
          @click="goToProduct(product.id)"
        >
          <div class="product-image">
            <img v-if="product.image_url" :src="product.image_url" :alt="product.name" />
            <div v-else class="no-image">沒有圖片</div>
          </div>
          <div class="product-info">
            <h4>{{ product.name }}</h4>
            <p class="category">{{ product.category_name }}</p>
            <div class="price">
              <span class="current-price">{{ formatPrice(product.price) }}</span>
              <span v-if="product.original_price && product.original_price > product.price" class="original-price">
                {{ formatPrice(product.original_price) }}
              </span>
            </div>
            <div class="stock" :class="{ out: product.stock === 0 }">
              {{ product.stock > 0 ? `庫存: ${product.stock}` : '已售完' }}
            </div>
          </div>
        </div>
      </div>

      <div v-if="pagination.totalPages > 1" class="pagination">
        <button
          v-for="p in pagination.totalPages"
          :key="p"
          @click="changePage(p)"
          :class="{ active: p === page }"
          class="page-btn"
        >
          {{ p }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.home-page {
  display: grid;
  grid-template-columns: 200px 1fr;
  gap: 2rem;
}

@media (max-width: 768px) {
  .home-page {
    grid-template-columns: 1fr;
  }
  .sidebar {
    order: 1;
  }
}

.sidebar h3 {
  margin-top: 0;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #eee;
}

.category-list {
  list-style: none;
  padding: 0;
  margin: 0;
}

.category-list li {
  padding: 0.5rem;
  cursor: pointer;
  border-radius: 4px;
  margin-bottom: 0.25rem;
}

.category-list li:hover {
  background: #f5f5f5;
}

.category-list li.active {
  background: #2c3e50;
  color: white;
}

.search-bar {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
}

.search-input {
  flex: 1;
  padding: 0.5rem 1rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
}

.search-btn {
  padding: 0.5rem 1.5rem;
  background: #2c3e50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.search-btn:hover {
  background: #34495e;
}

.loading {
  text-align: center;
  padding: 2rem;
  color: #666;
}

.product-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 1.5rem;
}

.product-card {
  border: 1px solid #eee;
  border-radius: 8px;
  overflow: hidden;
  cursor: pointer;
  transition: box-shadow 0.2s, transform 0.2s;
}

.product-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  transform: translateY(-2px);
}

.product-image {
  width: 100%;
  height: 180px;
  overflow: hidden;
  background: #f9f9f9;
}

.product-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.no-image {
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
}

.product-info {
  padding: 1rem;
}

.product-info h4 {
  margin: 0 0 0.25rem 0;
  font-size: 1rem;
  line-height: 1.4;
}

.category {
  margin: 0 0 0.5rem 0;
  color: #666;
  font-size: 0.85rem;
}

.price {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}

.current-price {
  font-size: 1.1rem;
  font-weight: bold;
  color: #e74c3c;
}

.original-price {
  text-decoration: line-through;
  color: #999;
  font-size: 0.9rem;
}

.stock {
  font-size: 0.85rem;
  color: #666;
}

.stock.out {
  color: #e74c3c;
  font-weight: 500;
}

.pagination {
  display: flex;
  justify-content: center;
  gap: 0.5rem;
  margin-top: 2rem;
  flex-wrap: wrap;
}

.page-btn {
  min-width: 36px;
  height: 36px;
  border: 1px solid #ddd;
  background: white;
  border-radius: 4px;
  cursor: pointer;
}

.page-btn:hover {
  border-color: #2c3e50;
}

.page-btn.active {
  background: #2c3e50;
  color: white;
  border-color: #2c3e50;
}
</style>

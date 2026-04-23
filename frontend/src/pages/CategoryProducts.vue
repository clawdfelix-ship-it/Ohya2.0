<script setup>
import { ref, onMounted, computed } from 'vue'
import { productsAPI, categoriesAPI } from '../services/api'
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()
const products = ref([])
const category = ref(null)
const loading = ref(true)
const page = ref(1)
const pagination = ref({})

async function loadCategory() {
  try {
    const res = await categoriesAPI.getOne(route.params.id)
    category.value = res.data.category
  } catch (err) {
    console.error(err)
  }
}

async function loadProducts() {
  loading.value = true
  try {
    const res = await productsAPI.getAll({
      page: page.value,
      category_id: route.params.id
    })
    products.value = res.data.products
    pagination.value = res.data.pagination
  } catch (err) {
    console.error(err)
  } finally {
    loading.value = false
  }
}

function goToProduct(productId) {
  router.push(`/product/${productId}`)
}

function changePage(newPage) {
  page.value = newPage
  loadProducts()
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

onMounted(() => {
  loadCategory()
  loadProducts()
})

function formatPrice(price) {
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD' }).format(price)
}
</script>

<template>
  <div class="category-page">
    <div v-if="loading" class="loading">載入中...</div>

    <template v-else>
      <h1 class="page-title">{{ category?.name }}</h1>
      <p v-if="category?.description" class="description">{{ category.description }}</p>

      <div class="product-grid">
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
    </template>
  </div>
</template>

<style scoped>
.page-title {
  margin-bottom: 0.5rem;
}

.description {
  color: #666;
  margin-bottom: 2rem;
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
  margin: 0 0 0.5rem 0;
  font-size: 1rem;
  line-height: 1.4;
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

<script setup>
import { ref, onMounted } from 'vue'
import { productsAPI, cartAPI } from '../services/api'
import { useRoute, useRouter } from 'vue-router'
import { useAuth } from '../stores/auth'

const route = useRoute()
const router = useRouter()
const auth = useAuth()
const product = ref(null)
const loading = ref(true)
const quantity = ref(1)
error = ref('')
success = ref('')

async function loadProduct() {
  loading.value = true
  try {
    const res = await productsAPI.getOne(route.params.id)
    product.value = res.data.product
  } catch (err) {
    console.error(err)
    error.value = '產品不存在'
  } finally {
    loading.value = false
  }
}

async function addToCart() {
  if (!auth.isLoggedIn.value) {
    router.push('/login')
    return
  }

  try {
    const res = await cartAPI.add({
      product_id: product.value.id,
      quantity: quantity.value
    })
    if (res.data.success) {
      success.value = '已加入購物車！'
      setTimeout(() => {
        router.push('/cart')
      }, 1000)
    } else {
      error.value = res.data.error
    }
  } catch (err) {
    error.value = '加入購物車失敗'
    console.error(err)
  }
}

onMounted(() => {
  loadProduct()
})

function formatPrice(price) {
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD' }).format(price)
}

function canAdd() {
  return product && product.stock >= quantity.value && product.stock > 0
}
</script>

<template>
  <div class="product-detail">
    <div v-if="loading" class="loading">載入中...</div>

    <div v-if="error" class="error">{{ error }}</div>

    <template v-if="product && !loading">
      <div class="product-layout">
        <div class="image-column">
          <div class="main-image">
            <img v-if="product.image_url" :src="product.image_url" :alt="product.name" />
            <div v-else class="no-image">沒有圖片</div>
          </div>
        </div>

        <div class="info-column">
          <h1 class="product-name">{{ product.name }}</h1>
          <p class="category">分類: {{ product.category_name }}</p>

          <div class="price-block">
            <span class="current-price">{{ formatPrice(product.price) }}</span>
            <span v-if="product.original_price && product.original_price > product.price" class="original-price">
              {{ formatPrice(product.original_price) }}
            </span>
          </div>

          <div class="stock-info" :class="{ out: product.stock === 0 }">
            {{ product.stock > 0 ? `庫存: ${product.stock} 件` : '已售完' }}
          </div>

          <div v-if="product.description" class="description">
            <h3>商品描述</h3>
            <p>{{ product.description }}</p>
          </div>

          <div class="quantity-selector">
            <label>數量:</label>
            <button @click="quantity = Math.max(1, quantity - 1)">-</button>
            <input type="number" v-model.number="quantity" min="1" :max="product.stock" />
            <button @click="quantity = Math.min(product.stock, quantity + 1)">+</button>
          </div>

          <div v-if="error" class="error">{{ error }}</div>
          <div v-if="success" class="success">{{ success }}</div>

          <div class="actions">
            <button
              v-if="product.stock > 0"
              :disabled="!canAdd()"
              @click="addToCart"
              class="add-to-cart-btn"
            >
              加入購物車
            </button>
            <button v-else disabled class="out-of-stock-btn">已售完</button>

            <button @click="router.push('/')" class="back-btn">繼續購物</button>
          </div>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.product-detail {
  max-width: 1000px;
  margin: 0 auto;
}

.loading, .error {
  text-align: center;
  padding: 2rem;
}

.error {
  color: #e74c3c;
}

.success {
  color: #27ae60;
  padding: 1rem;
  background: #f0fdf4;
  border-radius: 4px;
  margin: 1rem 0;
}

.product-layout {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 3rem;
}

@media (max-width: 768px) {
  .product-layout {
    grid-template-columns: 1fr;
    gap: 1.5rem;
  }
}

.main-image {
  background: #f9f9f9;
  border-radius: 8px;
  overflow: hidden;
}

.main-image img {
  width: 100%;
  height: auto;
  display: block;
}

.no-image {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #999;
  min-height: 300px;
}

.product-name {
  margin-top: 0;
  font-size: 1.8rem;
}

.category {
  color: #666;
  margin: 0 0 1rem 0;
}

.price-block {
  margin: 1.5rem 0;
  display: flex;
  align-items: center;
  gap: 1rem;
}

.current-price {
  font-size: 2rem;
  font-weight: bold;
  color: #e74c3c;
}

.original-price {
  text-decoration: line-through;
  color: #999;
  font-size: 1.2rem;
}

.stock-info {
  padding: 0.5rem 1rem;
  background: #f5f5f5;
  border-radius: 4px;
  display: inline-block;
  margin-bottom: 1.5rem;
}

.stock-info.out {
  background: #fee;
  color: #e74c3c;
}

.description {
  margin: 1.5rem 0;
}

.description h3 {
  margin-bottom: 0.5rem;
}

.description p {
  line-height: 1.7;
  color: #444;
  white-space: pre-line;
}

.quantity-selector {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin: 1.5rem 0;
}

.quantity-selector label {
  margin-right: 0.5rem;
}

.quantity-selector input {
  width: 60px;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  text-align: center;
}

.quantity-selector button {
  width: 36px;
  height: 36px;
  border: 1px solid #ddd;
  background: white;
  border-radius: 4px;
  cursor: pointer;
}

.quantity-selector button:hover {
  background: #f5f5f5;
}

.actions {
  display: flex;
  gap: 1rem;
  flex-wrap: wrap;
  margin-top: 1.5rem;
}

.add-to-cart-btn {
  padding: 1rem 2rem;
  background: #2c3e50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
}

.add-to-cart-btn:hover:not(:disabled) {
  background: #34495e;
}

.add-to-cart-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.out-of-stock-btn {
  padding: 1rem 2rem;
  background: #999;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: not-allowed;
  font-size: 1rem;
}

.back-btn {
  padding: 1rem 2rem;
  background: white;
  color: #2c3e50;
  border: 1px solid #2c3e50;
  border-radius: 4px;
  cursor: pointer;
  font-size: 1rem;
}

.back-btn:hover {
  background: #f8f9fa;
}
</style>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { cartAPI, ordersAPI } from '../services/api'
import { useRouter } from 'vue-router'
import { useAuth } from '../stores/auth'

const auth = useAuth()
const router = useRouter()
const cart = ref({ items: [], total: 0, count: 0 })
const loading = ref(true)
const creatingOrder = ref(false)
const error = ref('')

// Order form
const orderForm = ref({
  contact_name: '',
  contact_phone: '',
  contact_address: '',
  note: ''
})

async function loadCart() {
  loading.value = true
  try {
    const res = await cartAPI.get()
    cart.value = res.data
  } catch (err) {
    console.error(err)
    error.value = '載入購物車失敗'
  } finally {
    loading.value = false
  }
}

async function updateQuantity(item, quantity) {
  try {
    await cartAPI.update(item.id, { quantity })
    loadCart()
  } catch (err) {
    console.error(err)
    error.value = '更新數量失敗'
  }
}

async function removeItem(itemId) {
  try {
    await cartAPI.delete(itemId)
    loadCart()
  } catch (err) {
    console.error(err)
    error.value = '刪除商品失敗'
  }
}

async function clearCart() {
  if (!confirm('確定要清空購物車嗎？')) return
  try {
    await cartAPI.clear()
    loadCart()
  } catch (err) {
    console.error(err)
    error.value = '清空購物車失敗'
  }
}

async function createOrder() {
  if (!orderForm.value.contact_name || !orderForm.value.contact_phone || !orderForm.value.contact_address) {
    error.value = '請填寫完整聯絡資訊'
    return
  }

  creatingOrder.value = true
  error.value = ''

  try {
    const res = await ordersAPI.create(orderForm.value)
    if (res.data.success) {
      router.push(`/orders`)
    } else {
      error.value = res.data.error
    }
  } catch (err) {
    console.error(err)
    error.value = '建立訂單失敗'
  } finally {
    creatingOrder.value = false
  }
}

onMounted(() => {
  if (auth.isLoggedIn.value) {
    loadCart()
  } else {
    router.push('/login')
  }
})

function formatPrice(price) {
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD' }).format(price)
}
</script>

<template>
  <div class="cart-page">
    <h1 class="page-title">購物車</h1>

    <div v-if="loading" class="loading">載入中...</div>

    <div v-if="error" class="error">{{ error }}</div>

    <template v-if="!loading && cart.count === 0">
      <div class="empty-cart">
        <p>購物車是空的</p>
        <button @click="router.push('/')" class="go-shopping-btn">開始購物</button>
      </div>
    </template>

    <template v-if="!loading && cart.count > 0">
      <div class="cart-layout">
        <div class="cart-items">
          <div v-for="item in cart.items" :key="item.id" class="cart-item">
            <div class="item-image">
              <img v-if="item.image_url" :src="item.image_url" :alt="item.name" />
              <div v-else class="no-image">無圖</div>
            </div>

            <div class="item-info">
              <h4 @click="router.push(`/product/${item.product_id}`)" class="item-name">
                {{ item.name }}
              </h4>
              <p class="item-price">{{ formatPrice(item.price) }}</p>
            </div>

            <div class="item-quantity">
              <label>數量</label>
              <div class="quantity-control">
                <button @click="updateQuantity(item, Math.max(1, item.quantity - 1))">-</button>
                <span>{{ item.quantity }}</span>
                <button @click="updateQuantity(item, Math.min(item.stock, item.quantity + 1))">+</button>
              </div>
            </div>

            <div class="item-subtotal">
              <p>{{ formatPrice(item.price * item.quantity) }}</p>
            </div>

            <div class="item-actions">
              <button @click="removeItem(item.id)" class="remove-btn">移除</button>
            </div>
          </div>

          <div class="cart-actions-top">
            <button @click="clearCart" class="clear-btn">清空購物車</button>
          </div>
        </div>

        <div class="checkout-panel">
          <h3>結帳資訊</h3>

          <div class="cart-total">
            <span>總金額:</span>
            <strong class="total-price">{{ formatPrice(cart.total) }}</strong>
          </div>

          <div class="order-form">
            <div class="form-group">
              <label>收件人姓名 *</label>
              <input v-model="orderForm.contact_name" placeholder="請輸入姓名" />
            </div>

            <div class="form-group">
              <label>連絡電話 *</label>
              <input v-model="orderForm.contact_phone" placeholder="請輸入電話" />
            </div>

            <div class="form-group">
              <label>收件地址 *</label>
              <input v-model="orderForm.contact_address" placeholder="請輸入地址" />
            </div>

            <div class="form-group">
              <label>備註</label>
              <textarea v-model="orderForm.note" placeholder="其他備註事項" rows="3"></textarea>
            </div>
          </div>

          <button
            @click="createOrder"
            :disabled="creatingOrder"
            class="checkout-btn"
          >
            {{ creatingOrder ? '處理中...' : '確認下單' }}
          </button>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.cart-page {
  max-width: 1000px;
  margin: 0 auto;
}

.page-title {
  margin-bottom: 1.5rem;
}

.loading {
  text-align: center;
  padding: 2rem;
  color: #666;
}

.error {
  background: #fee;
  color: #e74c3c;
  padding: 1rem;
  border-radius: 4px;
  margin-bottom: 1rem;
}

.empty-cart {
  text-align: center;
  padding: 3rem;
  color: #666;
}

.empty-cart p {
  font-size: 1.2rem;
  margin-bottom: 1.5rem;
}

.go-shopping-btn {
  padding: 0.75rem 2rem;
  background: #2c3e50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.go-shopping-btn:hover {
  background: #34495e;
}

.cart-layout {
  display: grid;
  grid-template-columns: 1fr 350px;
  gap: 2rem;
}

@media (max-width: 768px) {
  .cart-layout {
    grid-template-columns: 1fr;
  }
}

.cart-item {
  display: grid;
  grid-template-columns: 80px 1fr 120px 100px 80px;
  gap: 1rem;
  align-items: center;
  padding: 1rem;
  border-bottom: 1px solid #eee;
}

@media (max-width: 768px) {
  .cart-item {
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }
}

.item-image {
  width: 80px;
  height: 80px;
  border-radius: 4px;
  overflow: hidden;
  background: #f9f9f9;
}

.item-image img {
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
  font-size: 0.8rem;
}

.item-name {
  margin: 0;
  cursor: pointer;
  color: #2c3e50;
}

.item-name:hover {
  text-decoration: underline;
}

.item-price {
  margin: 0.25rem 0 0 0;
  color: #666;
}

.quantity-control {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.quantity-control button {
  width: 28px;
  height: 28px;
  border: 1px solid #ddd;
  background: white;
  border-radius: 4px;
  cursor: pointer;
}

.item-actions {
  text-align: right;
}

.remove-btn {
  background: none;
  border: none;
  color: #e74c3c;
  cursor: pointer;
  text-decoration: underline;
}

.cart-actions-top {
  padding: 1rem 0;
  text-align: right;
}

.clear-btn {
  background: none;
  border: 1px solid #e74c3c;
  color: #e74c3c;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
}

.clear-btn:hover {
  background: #e74c3c;
  color: white;
}

.checkout-panel {
  background: #f9f9f9;
  padding: 1.5rem;
  border-radius: 8px;
  position: sticky;
  top: 2rem;
}

.checkout-panel h3 {
  margin-top: 0;
}

.cart-total {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 0;
  border-bottom: 1px solid #ddd;
  margin-bottom: 1rem;
  font-size: 1.1rem;
}

.total-price {
  color: #e74c3c;
  font-size: 1.5rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.25rem;
  font-size: 0.9rem;
}

.form-group input,
.form-group textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.checkout-btn {
  width: 100%;
  padding: 1rem;
  background: #2c3e50;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 1.1rem;
  cursor: pointer;
}

.checkout-btn:hover:not(:disabled) {
  background: #34495e;
}

.checkout-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}
</style>

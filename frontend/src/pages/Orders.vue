<script setup>
import { ref, onMounted } from 'vue'
import { ordersAPI } from '../services/api'
import { useRouter } from 'vue-router'

const router = useRouter()
const orders = ref([])
const loading = ref(true)
const pagination = ref({})
const page = ref(1)
error = ref('')
expandedOrder = ref(null)
expandedItems = ref([])

async function loadOrders() {
  loading.value = true
  try {
    const res = await ordersAPI.getMy({ page: page.value })
    orders.value = res.data.orders
    pagination.value = res.data.pagination
  } catch (err) {
    console.error(err)
    error.value = '載入訂單失敗'
  } finally {
    loading.value = false
  }
}

async function loadOrderDetail(orderId) {
  if (expandedOrder.value === orderId) {
    expandedOrder.value = null
    return
  }
  try {
    const res = await ordersAPI.getOne(orderId)
    expandedOrder.value = orderId
    expandedItems.value = res.data.items
  } catch (err) {
    console.error(err)
    error.value = '載入訂單詳情失敗'
  }
}

async function cancelOrder(orderId) {
  if (!confirm('確定要取消此訂單嗎？')) return
  try {
    await ordersAPI.cancel(orderId)
    loadOrders()
    if (expandedOrder.value === orderId) {
      expandedOrder.value = null
    }
  } catch (err) {
    console.error(err)
    error.value = '取消訂單失敗'
  }
}

function changePage(newPage) {
  page.value = newPage
  loadOrders()
}

onMounted(() => {
  loadOrders()
})

function formatPrice(price) {
  return new Intl.NumberFormat('zh-TW', { style: 'currency', currency: 'TWD' }).format(price)
}

function getStatusText(status) {
  const statusMap = {
    pending: '待處理',
    paid: '已付款',
    shipping: '運送中',
    completed: '已完成',
    cancelled: '已取消'
  }
  return statusMap[status] || status
}

function getStatusClass(status) {
  return 'status-' + status
}
</script>

<template>
  <div class="orders-page">
    <h1 class="page-title">我的訂單</h1>

    <div v-if="loading" class="loading">載入中...</div>
    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="!loading && orders.length === 0" class="empty">
      <p>尚無訂單</p>
      <button @click="router.push('/')" class="go-shopping-btn">開始購物</button>
    </div>

    <div v-if="!loading && orders.length > 0" class="orders-list">
      <div v-for="order in orders" :key="order.id" class="order-card">
        <div class="order-header" @click="loadOrderDetail(order.id)">
          <div class="order-info">
            <span class="order-number">訂單 #{{ order.id }}</span>
            <span class="order-date">{{ new Date(order.created_at).toLocaleDateString('zh-TW') }}</span>
            <span class="status-badge" :class="getStatusClass(order.status)">{{ getStatusText(order.status) }}</span>
          </div>
          <div class="order-total">
            <strong>{{ formatPrice(order.total_amount) }}</strong>
            <span class="expand-icon">{{ expandedOrder === order.id ? '▼' : '▶' }}</span>
          </div>
        </div>

        <div v-if="expandedOrder === order.id" class="order-detail">
          <h4>訂單資訊</h4>
          <div class="info-row">
            <span>收件人:</span>
            <span>{{ order.contact_name }}</span>
          </div>
          <div class="info-row">
            <span>電話:</span>
            <span>{{ order.contact_phone }}</span>
          </div>
          <div class="info-row">
            <span>地址:</span>
            <span>{{ order.contact_address }}</span>
          </div>
          <div v-if="order.note" class="info-row">
            <span>備註:</span>
            <span>{{ order.note }}</span>
          </div>

          <h4>商品明細</h4>
          <div class="order-items">
            <div v-for="item in expandedItems" :key="item.id" class="order-item">
              <div class="item-info">
                <span class="item-name">{{ item.name }}</span>
                <span class="item-qty">x {{ item.quantity }}</span>
              </div>
              <span class="item-price">{{ formatPrice(item.unit_price * item.quantity) }}</span>
            </div>
          </div>

          <div class="order-actions">
            <template v-if="['pending', 'paid'].includes(order.status)">
              <button @click="cancelOrder(order.id)" class="cancel-btn">取消訂單</button>
            </template>
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
.orders-page {
  max-width: 800px;
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

.empty {
  text-align: center;
  padding: 3rem;
  color: #666;
}

.empty p {
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

.order-card {
  border: 1px solid #eee;
  border-radius: 8px;
  margin-bottom: 1rem;
  overflow: hidden;
}

.order-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  cursor: pointer;
  background: #fafafa;
}

.order-header:hover {
  background: #f5f5f5;
}

.order-info {
  display: flex;
  gap: 1rem;
  align-items: center;
  flex-wrap: wrap;
}

.order-number {
  font-weight: bold;
}

.order-date {
  color: #666;
  font-size: 0.9rem;
}

.status-badge {
  padding: 0.25rem 0.75rem;
  border-radius: 20px;
  font-size: 0.8rem;
  font-weight: 500;
}

.status-pending {
  background: #fff3cd;
  color: #856404;
}

.status-paid {
  background: #d1ecf1;
  color: #0c5460;
}

.status-shipping {
  background: #cfe2ff;
  color: #084298;
}

.status-completed {
  background: #d4edda;
  color: #155724;
}

.status-cancelled {
  background: #f8d7da;
  color: #721c24;
}

.order-total {
  display: flex;
  align-items: center;
  gap: 1rem;
}

.order-total strong {
  color: #e74c3c;
  font-size: 1.2rem;
}

.expand-icon {
  color: #999;
}

.order-detail {
  padding: 1.5rem;
  border-top: 1px solid #eee;
}

.order-detail h4 {
  margin: 0 0 1rem 0;
  font-size: 1rem;
}

.info-row {
  display: grid;
  grid-template-columns: 80px 1fr;
  margin-bottom: 0.5rem;
}

.info-row span:first-child {
  color: #666;
}

.order-items {
  margin: 1rem 0;
  border-top: 1px solid #eee;
  padding-top: 1rem;
}

.order-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 0.5rem 0;
  border-bottom: 1px solid #f5f5f5;
}

.item-info {
  display: flex;
  gap: 0.5rem;
}

.item-name {
  color: #2c3e50;
}

.item-qty {
  color: #666;
}

.item-price {
  font-weight: 500;
}

.order-actions {
  margin-top: 1rem;
  text-align: right;
}

.cancel-btn {
  background: #e74c3c;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
}

.cancel-btn:hover {
  background: #c0392b;
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

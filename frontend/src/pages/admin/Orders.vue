<script setup>
import { ref, onMounted } from 'vue'
import { ordersAPI } from '../../services/api'

const orders = ref([])
const loading = ref(true)
const error = ref('')
const page = ref(1)
const pagination = ref({})
const searchQuery = ref('')
const statusFilter = ref('')
const expandedOrder = ref(null)
expandedItems = ref([])

const statusOptions = [
  { value: '', label: '全部' },
  { value: 'pending', label: '待處理' },
  { value: 'paid', label: '已付款' },
  { value: 'shipping', label: '運送中' },
  { value: 'completed', label: '已完成' },
  { value: 'cancelled', label: '已取消' }
]

async function loadOrders() {
  loading.value = true
  try {
    const params = { page: page.value }
    if (searchQuery.value) {
      params.search = searchQuery.value
    }
    if (statusFilter.value) {
      params.status = statusFilter.value
    }
    const res = await ordersAPI.adminGetAll(params)
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

async function updateStatus(order, newStatus) {
  try {
    await ordersAPI.updateStatus(order.id, { status: newStatus })
    order.status = newStatus
    if (expandedOrder.value === order.id) {
      expandedOrder.value = null
    }
  } catch (err) {
    console.error(err)
    error.value = '更新狀態失敗'
    alert(err.response?.data?.error || '更新失敗')
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
  const map = {
    pending: '待處理',
    paid: '已付款',
    shipping: '運送中',
    completed: '已完成',
    cancelled: '已取消'
  }
  return map[status] || status
}

function getStatusClass(status) {
  return 'status-' + status
}
</script>

<template>
  <div class="admin-orders-page">
    <div class="page-header">
      <h1>訂單管理</h1>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div class="filters">
      <input
        v-model="searchQuery"
        @keyup.enter="page = 1; loadOrders()"
        placeholder="搜尋訂單編號/姓名/電話"
        class="search-input"
      />
      <select v-model="statusFilter" class="status-select">
        <option v-for="opt in statusOptions" :key="opt.value" :value="opt.value">
          {{ opt.label }}
        </option>
      </select>
      <button @click="page = 1; loadOrders()" class="search-btn">搜尋</button>
    </div>

    <div v-if="loading" class="loading">載入中...</div>

    <div v-if="!loading && orders.length === 0" class="empty">
      <p>沒有訂單</p>
    </div>

    <div v-if="!loading && orders.length > 0" class="orders-list">
      <div v-for="order in orders" :key="order.id" class="order-card">
        <div class="order-header" @click="loadOrderDetail(order.id)">
          <div class="order-info">
            <span class="order-number">訂單 #{{ order.id }}</span>
            <span v-if="order.username" class="customer">顧客: {{ order.username }}</span>
            <span class="order-date">{{ new Date(order.created_at).toLocaleDateString('zh-TW') }}</span>
            <span class="status-badge" :class="getStatusClass(order.status)">{{ getStatusText(order.status) }}</span>
          </div>
          <div class="order-total">
            <strong>{{ formatPrice(order.total_amount) }}</strong>
            <span class="expand-icon">{{ expandedOrder === order.id ? '▼' : '▶' }}</span>
          </div>
        </div>

        <div v-if="expandedOrder === order.id" class="order-detail">
          <div class="order-info-block">
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
          </div>

          <div class="order-items-block">
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
          </div>

          <div class="status-actions">
            <h4>更新狀態</h4>
            <div class="status-buttons">
              <button
                v-for="opt in statusOptions"
                v-if="opt.value"
                :key="opt.value"
                @click="updateStatus(order, opt.value)"
                :class="{ active: order.status === opt.value }"
                class="status-btn"
              >
                {{ opt.label }}
              </button>
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
.admin-orders-page {
}

.page-header h1 {
  margin-top: 0;
}

.error {
  background: #fee;
  color: #e74c3c;
  padding: 1rem;
  border-radius: 4px;
  margin-bottom: 1rem;
}

.filters {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 1.5rem;
  flex-wrap: wrap;
}

.search-input {
  flex: 1;
  min-width: 200px;
  padding: 0.5rem 1rem;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.status-select {
  padding: 0.5rem 1rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: white;
}

.search-btn {
  padding: 0.5rem 1.5rem;
  background: #2c3e50;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.loading {
  text-align: center;
  padding: 2rem;
  color: #666;
}

.empty {
  text-align: center;
  padding: 2rem;
  color: #666;
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

.customer {
  color: #666;
  font-size: 0.9rem;
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

.status-actions {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid #eee;
}

.status-buttons {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}

.status-btn {
  padding: 0.5rem 1rem;
  border: 1px solid #ddd;
  background: white;
  border-radius: 4px;
  cursor: pointer;
}

.status-btn:hover {
  border-color: #2c3e50;
}

.status-btn.active {
  background: #2c3e50;
  color: white;
  border-color: #2c3e50;
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

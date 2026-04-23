<script setup>
import { ref, onMounted } from 'vue'
import { productsAPI, categoriesAPI } from '../../services/api'

const products = ref([])
const categories = ref([])
const loading = ref(true)
const error = ref('')
const page = ref(1)
const pagination = ref({})
const searchQuery = ref('')
const selectedCategory = ref(null)
const showModal = ref(false)
const editingId = ref(null)
const formData = ref({
  name: '',
  slug: '',
  description: '',
  price: '',
  original_price: '',
  stock: 0,
  category_id: null,
  image_url: '',
  status: 'active'
})

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
    const res = await productsAPI.adminGetAll(params)
    products.value = res.data.products
    pagination.value = res.data.pagination
  } catch (err) {
    console.error(err)
    error.value = '載入商品失敗'
  } finally {
    loading.value = false
  }
}

async function loadCategories() {
  try {
    const res = await categoriesAPI.adminGetAll()
    categories.value = res.data.categories
  } catch (err) {
    console.error(err)
  }
}

function openModal(edit = null) {
  if (edit) {
    editingId.value = edit.id
    formData.value = {
      name: edit.name,
      slug: edit.slug || '',
      description: edit.description || '',
      price: edit.price,
      original_price: edit.original_price || '',
      stock: edit.stock,
      category_id: edit.category_id,
      image_url: edit.image_url || '',
      status: edit.status || 'active'
    }
  } else {
    editingId.value = null
    formData.value = {
      name: '',
      slug: '',
      description: '',
      price: '',
      original_price: '',
      stock: 0,
      category_id: null,
      image_url: '',
      status: 'active'
    }
  }
  error.value = ''
  showModal.value = true
}

async function saveProduct() {
  try {
    if (!formData.value.name || !formData.value.price || !formData.value.category_id) {
      error.value = '名稱、價格、分類不能為空'
      return
    }

    const data = {
      ...formData.value,
      price: parseFloat(formData.value.price),
      original_price: formData.value.original_price ? parseFloat(formData.value.original_price) : null,
      stock: parseInt(formData.value.stock)
    }

    if (editingId.value) {
      await productsAPI.update(editingId.value, data)
    } else {
      await productsAPI.create(data)
    }
    showModal.value = false
    loadProducts()
  } catch (err) {
    console.error(err)
    error.value = '儲存失敗'
  }
}

async function deleteProduct(id) {
  if (!confirm('確定要刪除此商品嗎？')) return
  try {
    await productsAPI.delete(id)
    loadProducts()
  } catch (err) {
    console.error(err)
    error.value = '刪除失敗'
    alert(err.response?.data?.error || '刪除失敗')
  }
}

function changePage(newPage) {
  page.value = newPage
  loadProducts()
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
  <div class="products-page">
    <div class="page-header">
      <h1>商品管理</h1>
      <button @click="openModal()" class="add-btn">新增商品</button>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div class="filters">
      <input
        v-model="searchQuery"
        @keyup.enter="page = 1; loadProducts()"
        placeholder="搜尋商品名稱..."
        class="search-input"
      />
      <select v-model="selectedCategory" class="category-select">
        <option :value="null">全部分類</option>
        <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
      </select>
      <button @click="page = 1; loadProducts()" class="search-btn">搜尋</button>
    </div>

    <div v-if="loading" class="loading">載入中...</div>

    <table v-if="!loading" class="products-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>圖片</th>
          <th>名稱</th>
          <th>分類</th>
          <th>價格</th>
          <th>庫存</th>
          <th>狀態</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="product in products" :key="product.id">
          <td>{{ product.id }}</td>
          <td>
            <img v-if="product.image_url" :src="product.image_url" class="thumb" />
            <span v-else>-</span>
          </td>
          <td>{{ product.name }}</td>
          <td>{{ product.category_name || '-' }}</td>
          <td>{{ formatPrice(product.price) }}</td>
          <td>{{ product.stock }}</td>
          <td>{{ product.status }}</td>
          <td>
            <button @click="openModal(product)" class="edit-btn">編輯</button>
            <button @click="deleteProduct(product.id)" class="delete-btn">刪除</button>
          </td>
        </tr>
      </tbody>
    </table>

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

    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ editingId ? '編輯商品' : '新增商品' }}</h2>
          <button @click="showModal = false" class="close-btn">&times;</button>
        </div>

        <div class="modal-body">
          <div v-if="error" class="error">{{ error }}</div>

          <div class="form-group">
            <label>商品名稱 *</label>
            <input v-model="formData.name" placeholder="請輸入商品名稱" />
          </div>

          <div class="form-group">
            <label>Slug (網址)</label>
            <input v-model="formData.slug" placeholder="留空會自動產生" />
          </div>

          <div class="form-group">
            <label>分類 *</label>
            <select v-model.number="formData.category_id">
              <option :value="null">請選擇分類</option>
              <option v-for="cat in categories" :key="cat.id" :value="cat.id">{{ cat.name }}</option>
            </select>
          </div>

          <div class="form-row">
            <div class="form-group">
              <label>價格 *</label>
              <input v-model.number="formData.price" type="number" step="0.01" />
            </div>
            <div class="form-group">
              <label>原價</label>
              <input v-model.number="formData.original_price" type="number" step="0.01" />
            </div>
          </div>

          <div class="form-group">
            <label>庫存</label>
            <input v-model.number="formData.stock" type="number" />
          </div>

          <div class="form-group">
            <label>商品圖片 URL</label>
            <input v-model="formData.image_url" placeholder="https://..." />
          </div>

          <div class="form-group">
            <label>商品描述</label>
            <textarea v-model="formData.description" placeholder="商品描述" rows="5"></textarea>
          </div>

          <div class="form-group">
            <label>狀態</label>
            <select v-model="formData.status">
              <option value="active">啟用</option>
              <option value="inactive">停用</option>
            </select>
          </div>
        </div>

        <div class="modal-footer">
          <button @click="showModal = false" class="cancel-btn">取消</button>
          <button @click="saveProduct" class="save-btn">儲存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.products-page {
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 1.5rem;
}

.page-header h1 {
  margin: 0;
}

.add-btn {
  background: #27ae60;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
}

.add-btn:hover {
  background: #229954;
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

.category-select {
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

.error {
  background: #fee;
  color: #e74c3c;
  padding: 1rem;
  border-radius: 4px;
  margin-bottom: 1rem;
}

.products-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  border: 1px solid #eee;
  border-radius: 8px;
  overflow: hidden;
}

.products-table th,
.products-table td {
  padding: 0.75rem 1rem;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.products-table th {
  background: #f5f5f5;
  font-weight: 500;
}

.thumb {
  width: 50px;
  height: 50px;
  object-fit: cover;
  border-radius: 4px;
}

.edit-btn {
  background: #3498db;
  color: white;
  border: none;
  padding: 0.25rem 0.75rem;
  border-radius: 3px;
  cursor: pointer;
  margin-right: 0.5rem;
}

.delete-btn {
  background: #e74c3c;
  color: white;
  border: none;
  padding: 0.25rem 0.75rem;
  border-radius: 3px;
  cursor: pointer;
}

.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}

@media (max-width: 768px) {
  .products-table {
    font-size: 0.8rem;
  }
  .products-table th,
  .products-table td {
    padding: 0.5rem 0.25rem;
  }
  .form-row {
    grid-template-columns: 1fr;
  }
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

.modal-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0,0,0,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.modal {
  background: white;
  border-radius: 8px;
  width: 100%;
  max-width: 600px;
  max-height: 90vh;
  overflow-y: auto;
}

.modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 1rem 1.5rem;
  border-bottom: 1px solid #eee;
}

.modal-header h2 {
  margin: 0;
  font-size: 1.25rem;
}

.close-btn {
  background: none;
  border: none;
  font-size: 2rem;
  cursor: pointer;
  color: #999;
  line-height: 1;
  padding: 0;
}

.modal-body {
  padding: 1.5rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.25rem;
}

.form-group input,
.form-group textarea,
.form-group select {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 1rem 1.5rem;
  border-top: 1px solid #eee;
}

.cancel-btn {
  background: #95a5a6;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
}

.save-btn {
  background: #2c3e50;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
}
</style>

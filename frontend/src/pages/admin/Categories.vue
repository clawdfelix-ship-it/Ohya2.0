<script setup>
import { ref, onMounted } from 'vue'
import { categoriesAPI } from '../../services/api'

const categories = ref([])
const loading = ref(true)
const error = ref('')
const showModal = ref(false)
const editingId = ref(null)
const formData = ref({
  name: '',
  slug: '',
  description: '',
  parent_id: null,
  sort_order: 0
})

async function loadCategories() {
  loading.value = true
  try {
    const res = await categoriesAPI.adminGetAll()
    categories.value = res.data.categories
  } catch (err) {
    console.error(err)
    error.value = '載入分類失敗'
  } finally {
    loading.value = false
  }
}

function openModal(edit = null) {
  if (edit) {
    editingId.value = edit.id
    formData.value = {
      name: edit.name,
      slug: edit.slug || '',
      description: edit.description || '',
      parent_id: edit.parent_id,
      sort_order: edit.sort_order || 0
    }
  } else {
    editingId.value = null
    formData.value = {
      name: '',
      slug: '',
      description: '',
      parent_id: null,
      sort_order: 0
    }
  }
  error.value = ''
  showModal.value = true
}

async function saveCategory() {
  try {
    if (!formData.value.name) {
      error.value = '分類名稱不能為空'
      return
    }

    if (editingId.value) {
      await categoriesAPI.update(editingId.value, formData.value)
    } else {
      await categoriesAPI.create(formData.value)
    }
    showModal.value = false
    loadCategories()
  } catch (err) {
    console.error(err)
    error.value = '儲存失敗'
  }
}

async function deleteCategory(id) {
  if (!confirm('確定要刪除此分類嗎？如果分類下有商品將無法刪除。')) return
  try {
    await categoriesAPI.delete(id)
    loadCategories()
  } catch (err) {
    console.error(err)
    error.value = '刪除失敗'
    alert(err.response?.data?.error || '刪除失敗')
  }
}

onMounted(() => {
  loadCategories()
})
</script>

<template>
  <div class="categories-page">
    <div class="page-header">
      <h1>分類管理</h1>
      <button @click="openModal()" class="add-btn">新增分類</button>
    </div>

    <div v-if="error" class="error">{{ error }}</div>

    <div v-if="loading" class="loading">載入中...</div>

    <table v-if="!loading" class="categories-table">
      <thead>
        <tr>
          <th>ID</th>
          <th>名稱</th>
          <th>Slug</th>
          <th>商品數量</th>
          <th>排序</th>
          <th>狀態</th>
          <th>操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="cat in categories" :key="cat.id">
          <td>{{ cat.id }}</td>
          <td>{{ cat.name }}</td>
          <td>{{ cat.slug }}</td>
          <td>{{ cat.product_count }}</td>
          <td>{{ cat.sort_order }}</td>
          <td>{{ cat.status }}</td>
          <td>
            <button @click="openModal(cat)" class="edit-btn">編輯</button>
            <button @click="deleteCategory(cat.id)" class="delete-btn">刪除</button>
          </td>
        </tr>
      </tbody>
    </table>

    <div v-if="showModal" class="modal-overlay" @click.self="showModal = false">
      <div class="modal">
        <div class="modal-header">
          <h2>{{ editingId ? '編輯分類' : '新增分類' }}</h2>
          <button @click="showModal = false" class="close-btn">&times;</button>
        </div>

        <div class="modal-body">
          <div v-if="error" class="error">{{ error }}</div>

          <div class="form-group">
            <label>分類名稱 *</label>
            <input v-model="formData.name" placeholder="請輸入分類名稱" />
          </div>

          <div class="form-group">
            <label>Slug (網址)</label>
            <input v-model="formData.slug" placeholder="留空會自動產生" />
          </div>

          <div class="form-group">
            <label>描述</label>
            <textarea v-model="formData.description" placeholder="分類描述" rows="3"></textarea>
          </div>

          <div class="form-group">
            <label>上層分類 ID</label>
            <input v-model.number="formData.parent_id" type="number" placeholder="選填" />
          </div>

          <div class="form-group">
            <label>排序</label>
            <input v-model.number="formData.sort_order" type="number" />
            <small>數字越小越前面</small>
          </div>
        </div>

        <div class="modal-footer">
          <button @click="showModal = false" class="cancel-btn">取消</button>
          <button @click="saveCategory" class="save-btn">儲存</button>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.categories-page {
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

.categories-table {
  width: 100%;
  border-collapse: collapse;
  background: white;
  border: 1px solid #eee;
  border-radius: 8px;
  overflow: hidden;
}

.categories-table th,
.categories-table td {
  padding: 0.75rem 1rem;
  text-align: left;
  border-bottom: 1px solid #eee;
}

.categories-table th {
  background: #f5f5f5;
  font-weight: 500;
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

@media (max-width: 768px) {
  .categories-table {
    font-size: 0.85rem;
  }
  .categories-table th,
  .categories-table td {
    padding: 0.5rem;
  }
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
  max-width: 500px;
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
.form-group textarea {
  width: 100%;
  padding: 0.5rem;
  border: 1px solid #ddd;
  border-radius: 4px;
}

.form-group small {
  color: #666;
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

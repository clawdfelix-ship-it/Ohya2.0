<script setup>
import { useAuth } from '../../stores/auth'

const auth = useAuth()
</script>

<template>
  <div class="dashboard-page">
    <h1>管理後台</h1>
    <p>歡迎回來，管理員 {{ auth.user?.username }}</p>

    <div class="menu-grid">
      <router-link to="/admin/categories" class="menu-card">
        <h3>📁 分類管理</h3>
        <p>管理商品分類</p>
      </router-link>

      <router-link to="/admin/products" class="menu-card">
        <h3>🛍️ 商品管理</h3>
        <p>管理商品資料</p>
      </router-link>

      <router-link to="/admin/orders" class="menu-card">
        <h3>📦 訂單管理</h3>
        <p>處理客戶訂單</p>
      </router-link>
    </div>
  </div>
</template>

<style scoped>
.dashboard-page h1 {
  margin-bottom: 0.5rem;
}

.dashboard-page p {
  color: #666;
  margin-bottom: 2rem;
}

.menu-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));
  gap: 1.5rem;
}

.menu-card {
  border: 1px solid #eee;
  border-radius: 8px;
  padding: 2rem;
  text-decoration: none;
  color: inherit;
  transition: all 0.2s;
}

.menu-card:hover {
  box-shadow: 0 4px 12px rgba(0,0,0,0.1);
  border-color: #2c3e50;
}

.menu-card h3 {
  margin-top: 0;
  margin-bottom: 0.5rem;
}

.menu-card p {
  margin: 0;
  color: #666;
}
</style>

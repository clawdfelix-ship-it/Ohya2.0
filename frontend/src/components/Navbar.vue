<script setup>
import { useAuth } from '../stores/auth'
import { useRouter } from 'vue-router'

const auth = useAuth()
const router = useRouter()

async function handleLogout() {
  await auth.logout()
  router.push('/')
}

function toggleMenu() {
  document.getElementById('mobile-menu').classList.toggle('hidden')
}
</script>

<template>
  <nav class="navbar">
    <div class="container">
      <div class="nav-content">
        <div class="logo" @click="router.push('/')">
          <h2>Mzakka</h2>
        </div>

        <button class="mobile-toggle" @click="toggleMenu">
          <span></span>
          <span></span>
          <span></span>
        </button>

        <div class="nav-links hidden" id="mobile-menu">
          <router-link to="/" class="nav-link">首頁</router-link>

          <template v-if="auth.isAdmin">
            <router-link to="/admin" class="nav-link">管理後台</router-link>
            <router-link to="/admin/categories" class="nav-link">分類管理</router-link>
            <router-link to="/admin/products" class="nav-link">商品管理</router-link>
            <router-link to="/admin/orders" class="nav-link">訂單管理</router-link>
          </template>

          <template v-if="auth.isLoggedIn && !auth.isAdmin">
            <router-link to="/orders" class="nav-link">我的訂單</router-link>
          </template>

          <router-link to="/cart" class="nav-link cart-link">
            🛒 購物車
          </router-link>

          <template v-if="!auth.isLoggedIn">
            <router-link to="/login" class="nav-link">登入</router-link>
            <router-link to="/register" class="nav-link">註冊</router-link>
          </template>

          <template v-if="auth.isLoggedIn">
            <span class="user-info">{{ auth.user?.username }}</span>
            <button class="logout-btn" @click="handleLogout">登出</button>
          </template>
        </div>
      </div>
    </div>
  </nav>
</template>

<style scoped>
.navbar {
  background: #2c3e50;
  color: white;
  padding: 0.75rem 0;
  box-shadow: 0 2px 4px rgba(0,0,0,0.1);
}

.container {
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 1rem;
}

.nav-content {
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-wrap: wrap;
}

.logo {
  cursor: pointer;
}

.logo h2 {
  margin: 0;
  font-size: 1.5rem;
  color: white;
}

.mobile-toggle {
  display: none;
  flex-direction: column;
  background: none;
  border: none;
  cursor: pointer;
  padding: 5px;
}

.mobile-toggle span {
  width: 25px;
  height: 3px;
  background: white;
  margin: 3px 0;
  transition: all 0.3s;
}

.nav-links {
  display: flex;
  gap: 1rem;
  align-items: center;
}

.nav-link {
  color: rgba(255,255,255,0.9);
  text-decoration: none;
  padding: 0.5rem 0.75rem;
  border-radius: 4px;
  transition: background 0.2s;
}

.nav-link:hover {
  background: rgba(255,255,255,0.1);
  color: white;
}

.nav-link.router-link-active {
  background: rgba(255,255,255,0.15);
  color: white;
}

.cart-link {
  font-weight: 500;
}

.user-info {
  color: rgba(255,255,255,0.8);
  margin-right: 0.5rem;
}

.logout-btn {
  background: #e74c3c;
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 4px;
  cursor: pointer;
  transition: background 0.2s;
}

.logout-btn:hover {
  background: #c0392b;
}

@media (max-width: 768px) {
  .mobile-toggle {
    display: flex;
  }

  .nav-links {
    width: 100%;
    flex-direction: column;
    align-items: stretch;
    margin-top: 1rem;
    gap: 0.5rem;
  }

  .nav-links.hidden {
    display: none;
  }

  .user-info {
    padding: 0.5rem 0;
  }
}
</style>

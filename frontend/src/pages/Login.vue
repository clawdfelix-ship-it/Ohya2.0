<script setup>
import { ref } from 'vue'
import { useAuth } from '../stores/auth'
import { useRouter } from 'vue-router'

const auth = useAuth()
const router = useRouter()

const username = ref('')
const password = ref('')
const error = ref('')
loading = ref(false)

async function handleLogin() {
  error.value = ''
  loading.value = true

  const result = await auth.login(username.value, password.value)
  if (result.success) {
    router.push('/')
  } else {
    error.value = result.error
  }

  loading.value = false
}
</script>

<template>
  <div class="login-page">
    <div class="login-card">
      <h1>登入</h1>

      <div v-if="error" class="error">{{ error }}</div>

      <div class="form-group">
        <label>用戶名</label>
        <input v-model="username" placeholder="請輸入用戶名" />
      </div>

      <div class="form-group">
        <label>密碼</label>
        <input v-model="password" type="password" placeholder="請輸入密碼" />
      </div>

      <button @click="handleLogin" :disabled="loading" class="login-btn">
        {{ loading ? '登入中...' : '登入' }}
      </button>

      <div class="footer">
        還沒有帳號？<router-link to="/register">立即註冊</router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.login-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 60vh;
}

.login-card {
  width: 100%;
  max-width: 400px;
  padding: 2rem;
  border: 1px solid #eee;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.05);
}

.login-card h1 {
  text-align: center;
  margin-top: 0;
  margin-bottom: 1.5rem;
}

.error {
  background: #fee;
  color: #e74c3c;
  padding: 0.75rem;
  border-radius: 4px;
  margin-bottom: 1rem;
}

.form-group {
  margin-bottom: 1rem;
}

.form-group label {
  display: block;
  margin-bottom: 0.25rem;
}

.form-group input {
  width: 100%;
  padding: 0.75rem;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 1rem;
}

.login-btn {
  width: 100%;
  padding: 0.75rem;
  background: #2c3e50;
  color: white;
  border: none;
  border-radius: 4px;
  font-size: 1rem;
  cursor: pointer;
  margin-top: 0.5rem;
}

.login-btn:hover:not(:disabled) {
  background: #34495e;
}

.login-btn:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.footer {
  text-align: center;
  margin-top: 1.5rem;
  color: #666;
}

.footer a {
  color: #2c3e50;
  text-decoration: none;
  font-weight: 500;
}

.footer a:hover {
  text-decoration: underline;
}
</style>

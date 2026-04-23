<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { authAPI } from '../services/api'

const router = useRouter()

const username = ref('')
const password = ref('')
const passwordConfirm = ref('')
const contact = ref('')
const error = ref('')
const loading = ref(false)

async function handleRegister() {
  error.value = ''

  if (password.value !== passwordConfirm.value) {
    error.value = '兩次密碼輸入不一致'
    return
  }

  if (username.value.length < 3) {
    error.value = '用戶名至少需要 3 個字元'
    return
  }

  if (password.value.length < 6) {
    error.value = '密碼至少需要 6 個字元'
    return
  }

  loading.value = true

  try {
    const res = await authAPI.register(username.value, password.value, contact.value)
    if (res.data.success) {
      router.push('/login')
    } else {
      error.value = res.data.error
    }
  } catch (err) {
    error.value = '註冊失敗，請稍後再試'
    console.error(err)
  }

  loading.value = false
}
</script>

<template>
  <div class="register-page">
    <div class="register-card">
      <h1>註冊帳號</h1>

      <div v-if="error" class="error">{{ error }}</div>

      <div class="form-group">
        <label>用戶名 *</label>
        <input v-model="username" placeholder="請輸入用戶名" />
      </div>

      <div class="form-group">
        <label>聯絡方式 (電話/Email)</label>
        <input v-model="contact" placeholder="請輸入連絡方式" />
      </div>

      <div class="form-group">
        <label>密碼 *</label>
        <input v-model="password" type="password" placeholder="請輸入密碼 (至少6字)" />
      </div>

      <div class="form-group">
        <label>確認密碼 *</label>
        <input v-model="passwordConfirm" type="password" placeholder="再次輸入密碼" />
      </div>

      <button @click="handleRegister" :disabled="loading" class="register-btn">
        {{ loading ? '註冊中...' : '註冊' }}
      </button>

      <div class="footer">
        已有帳號？<router-link to="/login">立即登入</router-link>
      </div>
    </div>
  </div>
</template>

<style scoped>
.register-page {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 60vh;
}

.register-card {
  width: 100%;
  max-width: 400px;
  padding: 2rem;
  border: 1px solid #eee;
  border-radius: 8px;
  box-shadow: 0 2px 10px rgba(0,0,0,0.05);
}

.register-card h1 {
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

.register-btn {
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

.register-btn:hover:not(:disabled) {
  background: #34495e;
}

.register-btn:disabled {
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

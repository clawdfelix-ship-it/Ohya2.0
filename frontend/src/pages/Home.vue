<template>
  <div class="home">
    <div class="hero">
      <h1>🛍️ Ohya2.0 電商平台</h1>
      <p>歡迎來到全功能電商平台</p>
      <div class="features">
        <div class="feature">
          <h3>✅ 商品瀏覽</h3>
          <p>瀏覽各類商品，詳細資訊</p>
        </div>
        <div class="feature">
          <h3>✅ 購物車</h3>
          <p>輕鬆加入購物車</p>
        </div>
        <div class="feature">
          <h3>✅ 訂單管理</h3>
          <p>隨時查詢訂單狀態</p>
        </div>
        <div class="feature">
          <h3>✅ 後台管理</h3>
          <p>管理商品、分類、訂單</p>
        </div>
      </div>
      <div class="buttons">
        <router-link to="/products" class="btn btn-primary">
          瀏覽商品
        </router-link>
        <router-link to="/login" class="btn btn-secondary">
          登入帳戶
        </router-link>
      </div>
    </div>
  </div>
</template>

<script setup>
// 完全唔需要 API，保證首頁一定有畫面！
</script>

<style scoped>
.home {
  min-height: 80vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2rem;
}

.hero {
  text-align: center;
  max-width: 800px;
}

h1 {
  font-size: 3rem;
  color: #1a1a2e;
  margin-bottom: 1rem;
}

p {
  font-size: 1.25rem;
  color: #666;
  margin-bottom: 3rem;
}

.features {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
  gap: 1.5rem;
  margin-bottom: 3rem;
}

.feature {
  background: #f8f9fa;
  padding: 1.5rem;
  border-radius: 12px;
  text-align: center;
}

.feature h3 {
  margin: 0 0 0.5rem 0;
  color: #1a1a2e;
}

.feature p {
  margin: 0;
  font-size: 0.9rem;
}

.buttons {
  display: flex;
  gap: 1rem;
  justify-content: center;
  flex-wrap: wrap;
}

.btn {
  padding: 0.875rem 2rem;
  border-radius: 8px;
  font-weight: 600;
  text-decoration: none;
  transition: all 0.2s;
}

.btn-primary {
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: white;
}

.btn-primary:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(102, 126, 234, 0.4);
}

.btn-secondary {
  background: #e9ecef;
  color: #495057;
}

.btn-secondary:hover {
  background: #dee2e6;
}
</style>

<script setup>
import { onMounted } from 'vue'
import { useAuth } from './stores/auth'
import Navbar from './components/Navbar.vue'
import { RouterView } from 'vue-router'

const auth = useAuth()

onMounted(() => {
  auth.checkAuth()
})
</script>

<template>
  <div>
    <Navbar />
    <main>
      <RouterView />
    </main>
  </div>
</template>

<style>
main {
  max-width: 1200px;
  margin: 2rem auto;
  padding: 0 1rem;
  min-height: calc(100vh - 120px);
}
</style>

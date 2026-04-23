import { reactive, computed } from 'vue'
import { authAPI } from '../services/api'

const state = reactive({
  user: null,
  loading: true,
})

export function useAuth() {
  const isLoggedIn = computed(() => !!state.user)
  const isAdmin = computed(() => state.user?.isAdmin || false)

  async function checkAuth() {
    state.loading = true
    try {
      const res = await authAPI.me()
      state.user = res.data.user
    } catch (err) {
      state.user = null
    } finally {
      state.loading = false
    }
  }

  async function login(username, password) {
    const res = await authAPI.login({ username, password })
    if (res.data.success) {
      state.user = res.data.user
      return { success: true }
    }
    return { success: false, error: res.data.error }
  }

  async function register(username, password, contact) {
    const res = await authAPI.register({ username, password, contact })
    if (res.data.success) {
      return { success: true }
    }
    return { success: false, error: res.data.error }
  }

  async function logout() {
    await authAPI.logout()
    state.user = null
  }

  return {
    state,
    user: state.user,
    isLoggedIn,
    isAdmin,
    loading: state.loading,
    checkAuth,
    login,
    register,
    logout,
  }
}

import { create } from "zustand"

interface User {
  id: number
  email: string
  full_name: string
  role: string
}

interface AuthState {
  user: User | null
  token: string | null
  setAuth: (user: User, token: string) => void
  clearAuth: () => void
  initFromStorage: () => void
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  setAuth: (user, token) => {
    if (typeof window !== "undefined") {
      localStorage.setItem("hastra_token", token)
      localStorage.setItem("hastra_user", JSON.stringify(user))
    }
    set({ user, token })
  },
  clearAuth: () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("hastra_token")
      localStorage.removeItem("hastra_user")
    }
    set({ user: null, token: null })
  },
  initFromStorage: () => {
    if (typeof window !== "undefined") {
      const token = localStorage.getItem("hastra_token")
      const userStr = localStorage.getItem("hastra_user")
      if (token && userStr) {
        try {
          const user = JSON.parse(userStr)
          set({ user, token })
        } catch {}
      }
    }
  },
}))

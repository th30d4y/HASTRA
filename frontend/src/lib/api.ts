import axios from "axios"

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api"

export const api = axios.create({
  baseURL: API_URL,
  headers: { "Content-Type": "application/json" },
})

api.interceptors.request.use((config) => {
  if (typeof window !== "undefined") {
    const token = localStorage.getItem("hastra_token")
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("hastra_token")
      localStorage.removeItem("hastra_user")
      if (window.location.pathname !== "/login") {
        window.location.href = "/login"
      }
    }
    return Promise.reject(err)
  }
)

// Auth
export const authApi = {
  register: (data: { email: string; password: string; full_name: string }) => api.post("/auth/register", data),
  login: (data: { email: string; password: string }) => api.post("/auth/login", data),
  me: () => api.get("/users/me"),
}

// Agents
export const agentsApi = {
  list: () => api.get("/agents"),
  create: (data: any) => api.post("/agents", data),
  get: (id: number) => api.get(`/agents/${id}`),
  update: (id: number, data: any) => api.put(`/agents/${id}`, data),
  delete: (id: number) => api.delete(`/agents/${id}`),
  getVersions: (id: number) => api.get(`/agents/${id}/versions`),
  chat: (id: number, messages: any[]) => api.post(`/agents/${id}/chat`, { messages }),
  attachTool: (agentId: number, toolId: number) => api.post(`/tools/${agentId}/attach/${toolId}`),
}

// Providers
export const providersApi = {
  list: () => api.get("/providers"),
  listKeys: () => api.get("/providers/api-keys"),
  createKey: (data: any) => api.post("/providers/api-keys", data),
  deleteKey: (id: number) => api.delete(`/providers/api-keys/${id}`),
  validateKey: (id: number) => api.post(`/providers/api-keys/${id}/validate`),
  getModels: (providerId: number) => api.get(`/providers/models/${providerId}`),
}

// Tools
export const toolsApi = {
  list: () => api.get("/tools"),
  create: (data: any) => api.post("/tools", data),
  update: (id: number, data: any) => api.put(`/tools/${id}`, data),
  delete: (id: number) => api.delete(`/tools/${id}`),
  attachToAgent: (agentId: number, toolId: number) => api.post(`/tools/${agentId}/attach/${toolId}`),
}

// MCP
export const mcpApi = {
  list: () => api.get("/mcp"),
  create: (data: any) => api.post("/mcp", data),
  delete: (id: number) => api.delete(`/mcp/${id}`),
}

// Recordings
export const recordingsApi = {
  list: () => api.get("/recordings"),
  create: (data: any) => api.post("/recordings", data),
  get: (id: number) => api.get(`/recordings/${id}`),
  delete: (id: number) => api.delete(`/recordings/${id}`),
  startBrowser: (id: number) => api.post(`/recordings/${id}/start-browser`),
  stop: (id: number) => api.post(`/recordings/${id}/stop`),
  replay: (id: number) => api.post(`/recordings/${id}/replay`),
  screenshot: (id: number) => api.get(`/recordings/${id}/screenshot`),
  pollEvents: (id: number, after: number) => api.get(`/recordings/${id}/events`, { params: { after } }),
  interact: (id: number, action: any) => api.post(`/recordings/${id}/interact`, action),
  addStep: (id: number, step: any) => api.post(`/recordings/${id}/steps`, step),
  updateStep: (id: number, eventId: number, data: any) => api.put(`/recordings/${id}/steps/${eventId}`, data),
  deleteStep: (id: number, eventId: number) => api.delete(`/recordings/${id}/steps/${eventId}`),
  convertToScenario: (id: number) => api.post(`/recordings/${id}/convert-to-scenario`),
}


// Scenarios
export const scenariosApi = {
  list: (agentId?: number) => api.get("/scenarios", { params: { agent_id: agentId } }),
  create: (data: any) => api.post("/scenarios", data),
  get: (id: number) => api.get(`/scenarios/${id}`),
  generate: (data: any) => api.post("/scenarios/generate", data),
}

// Test Runs
export const testRunsApi = {
  list: (agentId?: number) => api.get("/test-runs", { params: { agent_id: agentId } }),
  create: (data: any) => api.post("/test-runs", data),
  get: (id: number) => api.get(`/test-runs/${id}`),
  getTrace: (runId: number, resultId: number) => api.get(`/test-runs/${runId}/results/${resultId}/trace`),
}

// Findings
export const findingsApi = {
  list: (params?: { severity?: string; agent_id?: number }) => api.get("/findings", { params }),
  get: (id: number) => api.get(`/findings/${id}`),
}

// Reports
export const reportsApi = {
  list: () => api.get("/reports"),
  create: (data: any) => api.post("/reports", data),
  get: (id: number) => api.get(`/reports/${id}`),
}

// Admin
export const adminApi = {
  getStats: () => api.get("/admin/stats"),
  listUsers: () => api.get("/admin/users"),
  toggleUser: (id: number) => api.patch(`/admin/users/${id}/toggle`),
}

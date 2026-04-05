const API_BASE = '/api'
const WS_BASE = `ws://${window.location.hostname}:8000`

export const api = {
  async getStats() {
    const res = await fetch(`${API_BASE}/stats`)
    return res.json()
  },

  async getCameras() {
    const res = await fetch(`${API_BASE}/cameras`)
    return res.json()
  },

  async addCamera(data) {
    const res = await fetch(`${API_BASE}/cameras`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    return res.json()
  },

  async removeCamera(id) {
    const res = await fetch(`${API_BASE}/cameras/${id}`, { method: 'DELETE' })
    return res.json()
  },

  async updateCamera(id, data) {
    const res = await fetch(`${API_BASE}/cameras/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    return res.json()
  },

  async getAlerts(limit = 50) {
    const res = await fetch(`${API_BASE}/alerts?limit=${limit}`)
    return res.json()
  },

  async getLogs(limit = 200) {
    const res = await fetch(`${API_BASE}/logs?limit=${limit}`)
    return res.json()
  },

  getLogsDownloadUrl() {
    return `${API_BASE}/logs/download`
  },

  async getConfig() {
    const res = await fetch(`${API_BASE}/config`)
    return res.json()
  },

  async updateConfig(data) {
    const res = await fetch(`${API_BASE}/config`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    return res.json()
  },

  async getZones() {
    const res = await fetch(`${API_BASE}/zones`)
    return res.json()
  },

  cameraWsUrl(camId) {
    return `${WS_BASE}/ws/camera/${camId}`
  },

  browserCamWsUrl() {
    return `${WS_BASE}/ws/browser-cam`
  },

  alertsWsUrl() {
    return `${WS_BASE}/ws/alerts`
  },
}

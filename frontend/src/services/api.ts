import { useAuthStore } from '../store/useAuthStore';

const API_BASE = 'http://localhost:8000/api';

export interface Camera {
  id: string;
  name: string;
  source: string;
  zone: string;
  is_runway: boolean;
  model_type: string;
  status: string;
  fps: number;
  active_birds: number;
  birds_in_zone: number;
  total_alerts: number;
  max_risk: number;
}

export interface GlobalStats {
  active_cameras: number;
  total_cameras: number;
  runway_cameras: number;
  total_birds: number;
  birds_in_zone: number;
  high_risk: number;
  total_alerts: number;
  max_risk: number;
  model_status: string;
  available_models: string[];
}

export interface LogEntry {
  timestamp: string;
  camera_id: string;
  camera_name: string;
  zone: string;
  event_type: string;
  track_id: number | null;
  confidence: number | null;
  model_used: string;
  message: string;
}

// AdminDash types
export interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  role: string;
  auth_provider: string;
  airport_iata: string | null;
  airport_icao: string | null;
  airport_name: string | null;
  airport_city: string | null;
  airport_country: string | null;
  created_at: string | null;
}

export interface Airport {
  iata: string;
  icao: string;
  name: string;
  city: string;
  country: string;
}

// UsernameRequest: user-initiated rename, pending admin review.
export interface UsernameRequest {
  id: string;
  user_id: string;
  current_username: string;
  requested_username: string;
  reason: string | null;
  status: 'pending' | 'approved' | 'rejected';
  admin_note: string | null;
  reviewed_by: string | null;
  created_at: string | null;
  resolved_at: string | null;
  requester_email?: string | null;
  requester_role?: string | null;
}

export interface AdminUserPayload {
  username?: string;
  password?: string;
  email?: string | null;
  role?: string;
  airport_iata?: string | null;
  airport_icao?: string | null;
  airport_name?: string | null;
  airport_city?: string | null;
  airport_country?: string | null;
}

const fetchWithAuth = async (url: string, options: RequestInit = {}) => {
  const token = useAuthStore.getState().token;
  const headers = {
    ...options.headers,
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  
  const res = await fetch(url, { ...options, headers });
  if (res.status === 401) {
    useAuthStore.getState().logout();
    throw new Error("Unauthorized");
  }
  return res;
};

export const api = {
  login: async (username: string, password: string) => {
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    const res = await fetch(`${API_BASE}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: formData
    });
    if (!res.ok) throw new Error('Invalid credentials');
    return res.json();
  },

  // EditProfile
  getMe: async (): Promise<AdminUser & { updated_at?: string | null }> => {
    const res = await fetchWithAuth(`${API_BASE}/auth/me`);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Failed to load profile');
    return res.json();
  },

  updateSelf: async (body: { email?: string | null; current_password?: string; new_password?: string }) => {
    const res = await fetchWithAuth(`${API_BASE}/auth/me`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Failed to update profile');
    return res.json();
  },

  googleAuth: async (email: string, name: string, googleId: string) => {
    const res = await fetch(`${API_BASE}/auth/google`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name, googleId })
    });
    if (!res.ok) throw new Error('Google Auth Failed');
    return res.json();
  },

  getCameras: async (): Promise<Camera[]> => {
    const res = await fetchWithAuth(`${API_BASE}/cameras`);
    return res.json();
  },
  
  addCamera: async (data: Partial<Camera>): Promise<Camera> => {
    const res = await fetchWithAuth(`${API_BASE}/cameras`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  deleteCamera: async (id: string) => {
    await fetchWithAuth(`${API_BASE}/cameras/${id}`, { method: 'DELETE' });
  },

  updateCamera: async (id: string, data: Partial<Camera>): Promise<Camera> => {
    const res = await fetchWithAuth(`${API_BASE}/cameras/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    return res.json();
  },

  getStats: async (): Promise<GlobalStats> => {
    const res = await fetchWithAuth(`${API_BASE}/stats`);
    return res.json();
  },

  getLogs: async (limit = 200): Promise<LogEntry[]> => {
    const res = await fetchWithAuth(`${API_BASE}/logs?limit=${limit}`);
    return res.json();
  },

  getSettings: async (): Promise<Record<string, any>> => {
    const res = await fetchWithAuth(`${API_BASE}/settings`);
    return res.json();
  },

  updateSettings: async (config: Record<string, any>) => {
    const res = await fetchWithAuth(`${API_BASE}/settings`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(config),
    });
    return res.json();
  },

  // AdminDash
  listUsers: async (): Promise<AdminUser[]> => {
    const res = await fetchWithAuth(`${API_BASE}/admin/users`);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Failed to load users');
    return res.json();
  },

  createUser: async (body: AdminUserPayload): Promise<AdminUser> => {
    const res = await fetchWithAuth(`${API_BASE}/admin/users`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Failed to create user');
    return res.json();
  },

  updateUser: async (id: string, body: Partial<AdminUserPayload>): Promise<AdminUser> => {
    const res = await fetchWithAuth(`${API_BASE}/admin/users/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Failed to update user');
    return res.json();
  },

  deleteUser: async (id: string) => {
    const res = await fetchWithAuth(`${API_BASE}/admin/users/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      throw new Error((await res.json().catch(() => ({}))).detail || 'Failed to delete user');
    }
  },

  // UsernameRequest
  getMyUsernameRequests: async (): Promise<UsernameRequest[]> => {
    const res = await fetchWithAuth(`${API_BASE}/auth/username-requests`);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Failed to load requests');
    return res.json();
  },

  submitUsernameRequest: async (body: { requested_username: string; reason?: string | null }): Promise<UsernameRequest> => {
    const res = await fetchWithAuth(`${API_BASE}/auth/username-requests`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Failed to submit request');
    return res.json();
  },

  cancelUsernameRequest: async (id: string) => {
    const res = await fetchWithAuth(`${API_BASE}/auth/username-requests/${id}`, { method: 'DELETE' });
    if (!res.ok && res.status !== 204) {
      throw new Error((await res.json().catch(() => ({}))).detail || 'Failed to cancel request');
    }
  },

  listPendingUsernameRequests: async (status: 'pending' | 'approved' | 'rejected' | 'all' = 'pending'): Promise<UsernameRequest[]> => {
    const res = await fetchWithAuth(`${API_BASE}/admin/username-requests?status=${status}`);
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Failed to load requests');
    return res.json();
  },

  approveUsernameRequest: async (id: string, note?: string): Promise<UsernameRequest> => {
    const res = await fetchWithAuth(`${API_BASE}/admin/username-requests/${id}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_note: note || null }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Failed to approve');
    return res.json();
  },

  rejectUsernameRequest: async (id: string, note?: string): Promise<UsernameRequest> => {
    const res = await fetchWithAuth(`${API_BASE}/admin/username-requests/${id}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ admin_note: note || null }),
    });
    if (!res.ok) throw new Error((await res.json().catch(() => ({}))).detail || 'Failed to reject');
    return res.json();
  },

  searchAirports: async (q: string, limit = 10): Promise<Airport[]> => {
    const res = await fetchWithAuth(`${API_BASE}/airports/search?q=${encodeURIComponent(q)}&limit=${limit}`);
    if (!res.ok) throw new Error('Airport search failed');
    return res.json();
  },
};

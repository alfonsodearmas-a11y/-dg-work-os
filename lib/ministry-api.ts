// API Service for Ministry Dashboard
// Converted from Vite import.meta.env to Next.js relative paths

class ApiService {
  private token: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      this.token = localStorage.getItem('authToken');
    }
  }

  setToken(token: string | null) {
    this.token = token;
    if (typeof window !== 'undefined') {
      token ? localStorage.setItem('authToken', token) : localStorage.removeItem('authToken');
    }
  }

  getToken(): string | null {
    if (typeof window !== 'undefined') {
      return this.token || localStorage.getItem('authToken');
    }
    return this.token;
  }

  async request<T = any>(endpoint: string, options: RequestInit = {}): Promise<T> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(options.headers as Record<string, string>),
    };

    const token = this.getToken();
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`/api${endpoint}`, { ...options, headers });

    if (response.status === 401) {
      this.setToken(null);
      if (typeof window !== 'undefined') {
        window.location.href = '/admin';
      }
      throw new Error('Session expired');
    }

    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Request failed');
    return data;
  }

  // Auth
  async login(username: string, password: string) {
    const data = await this.request<any>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
    if (data.data?.accessToken) {
      this.setToken(data.data.accessToken);
    }
    return data;
  }

  async logout() {
    try {
      await this.request('/auth/logout', { method: 'POST' });
    } finally {
      this.setToken(null);
    }
  }

  async getProfile() { return this.request('/auth/profile'); }

  // Dashboard
  async getDashboardMetrics() { return this.request('/dashboard/metrics'); }

  // Metrics Submission
  async submitCJIAMetrics(data: any) { return this.request('/metrics/cjia', { method: 'POST', body: JSON.stringify(data) }); }
  async submitGWIMetrics(data: any) { return this.request('/metrics/gwi', { method: 'POST', body: JSON.stringify(data) }); }
  async submitGPLMetrics(data: any) { return this.request('/metrics/gpl', { method: 'POST', body: JSON.stringify(data) }); }
  async submitGCAAMetrics(data: any) { return this.request('/metrics/gcaa', { method: 'POST', body: JSON.stringify(data) }); }

  // Admin
  async getUsers() { return this.request('/admin/users'); }
  async getAuditLogs(filters: Record<string, string> = {}) {
    return this.request(`/admin/audit-logs?${new URLSearchParams(filters)}`);
  }
}

export const api = new ApiService();

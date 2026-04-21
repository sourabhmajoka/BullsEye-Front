import axios from 'axios';

const API_BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 30000,
});

// Request interceptor to add JWT token
api.interceptors.request.use(config => {
  const token = localStorage.getItem('bullseye_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Response interceptor
api.interceptors.response.use(
  res => res,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('bullseye_token');
      localStorage.removeItem('bullseye_user');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// Auth APIs
export const authAPI = {
  register: data => api.post('/auth/register', data),
  login: data => api.post('/auth/login', data),
  guestLogin: () => api.post('/auth/guest'),
  getMe: () => api.get('/auth/me'),
  updateProfile: data => api.put('/auth/update-profile', data),
  changePassword: data => api.put('/auth/change-password', data),
};

// Stock APIs
export const stockAPI = {
  search: query => api.get(`/stocks/search?q=${encodeURIComponent(query)}`),
  quote: (symbol, exchange = 'NSE') => api.get(`/stocks/quote/${symbol}?exchange=${exchange}`),
  history: (symbol, period = '1y', interval = '1d', exchange = 'NSE') =>
    api.get(`/stocks/history/${symbol}?period=${period}&interval=${interval}&exchange=${exchange}`),
  fundamentals: (symbol, exchange = 'NSE') => api.get(`/stocks/fundamentals/${symbol}?exchange=${exchange}`),
  batchQuotes: symbols => api.post('/stocks/batch-quotes', { symbols }),
  listAll: () => api.get('/stocks/list'),
};

// Market APIs
export const marketAPI = {
  indices: () => api.get('/market/indices'),
  movers: () => api.get('/market/movers'),
  sectors: () => api.get('/market/sectors'),
  overview: () => api.get('/market/overview'),
};

// Portfolio APIs
export const portfolioAPI = {
  getAll: () => api.get('/portfolio/'),
  create: data => api.post('/portfolio/', data),
  getById: id => api.get(`/portfolio/${id}`),
  addHolding: (portfolioId, data) => api.post(`/portfolio/${portfolioId}/holding`, data),
  removeHolding: (portfolioId, holdingId) => api.delete(`/portfolio/${portfolioId}/holding/${holdingId}`),
  getTransactions: () => api.get('/portfolio/transactions'),
  getAnalytics: id => api.get(`/portfolio/analytics/${id}`),
};

// Watchlist APIs
export const watchlistAPI = {
  get: () => api.get('/watchlist/'),
  add: data => api.post('/watchlist/', data),
  remove: symbol => api.delete(`/watchlist/${symbol}`),
};

// AI APIs
export const aiAPI = {
  chat: data => api.post('/ai/chat', data),
  analyzeStock: symbol => api.get(`/ai/analyze-stock/${symbol}`),
  history: sessionId => api.get(`/ai/history${sessionId ? `?session_id=${sessionId}` : ''}`),
};

export default api;

import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || 'http://localhost:8000/api',
  timeout: 45000,   // never wait forever on a dead connection
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Token ${token}`;
  return config;
});

// Signed out on the server (token removed, account deleted...): go to the login page
// and come back to the same page afterwards. Answers of a running test stay saved.
api.interceptors.response.use(r => r, err => {
  const path = window.location.pathname;
  if (err?.response?.status === 401 && localStorage.getItem('token') && !/^\/(login|register)/.test(path)) {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    window.location.assign(`/login?expired=1&next=${encodeURIComponent(path)}`);
  }
  return Promise.reject(err);
});

export default api;

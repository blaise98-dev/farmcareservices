import { useState, useCallback } from 'react';
import axios from 'axios';
import { AuthCtx } from '../hooks/useAuth';
import { FARM_KEY, TOKEN_KEY, USER_KEY, readKey, writeKey } from '../lib/storage';

// Shared axios instance with auth header injection
const authApi = axios.create({ baseURL: '' });

authApi.interceptors.request.use((config) => {
  const token = readKey(TOKEN_KEY);
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

export function AuthProvider({ children }) {
  const [token, setToken]   = useState(() => readKey(TOKEN_KEY));
  const [user, setUser]     = useState(() => {
    try { return JSON.parse(readKey(USER_KEY)); } catch { return null; }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError]     = useState('');

  const login = useCallback(async (username, password) => {
    setLoading(true);
    setError('');
    try {
      const form = new URLSearchParams();
      form.append('username', username);
      form.append('password', password);
      const { data } = await axios.post('/api/auth/login', form, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      });
      writeKey(TOKEN_KEY, data.access_token);
      writeKey(USER_KEY, JSON.stringify(data.user));
      writeKey(FARM_KEY, null);
      setToken(data.access_token);
      setUser(data.user);
      return true;
    } catch (e) {
      setError(e.response?.data?.detail || 'Login failed. Check your credentials.');
      return false;
    } finally {
      setLoading(false);
    }
  }, []);

  const logout = useCallback(() => {
    writeKey(TOKEN_KEY, null);
    writeKey(USER_KEY, null);
    writeKey(FARM_KEY, null);
    setToken(null);
    setUser(null);
  }, []);

  const changePassword = useCallback(async (newPassword) => {
    const { data } = await authApi.post('/api/auth/change-password', { new_password: newPassword });
    return data;
  }, []);

  // Token is stored in localStorage; the api.js interceptor reads it per-request.
  // No global axios.defaults patching needed: axios.create() instances don't inherit them.

  return (
    <AuthCtx.Provider value={{ token, user, login, logout, changePassword, loading, error, isAuthenticated: !!token }}>
      {children}
    </AuthCtx.Provider>
  );
}

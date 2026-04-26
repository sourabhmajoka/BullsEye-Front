import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken]     = useState(null);

  useEffect(() => {
    const savedToken = localStorage.getItem('bullseye_token');
    const savedUser  = localStorage.getItem('bullseye_user');

    if (savedToken && savedUser && savedUser !== 'undefined') {
      try {
        const parsed = JSON.parse(savedUser);
        setToken(savedToken);
        setUser(parsed); // show the app immediately from cache

        // Refresh user data from server in the background
        authAPI.getMe()
          .then(res => {
            setUser(res.data.user);
            localStorage.setItem('bullseye_user', JSON.stringify(res.data.user));
          })
          .catch(err => {
            // Only log out if the server explicitly says the token is invalid (401).
            // Network errors (Render waking up, timeout, etc.) must NOT log the user out —
            // the cached user data is still valid.
            const status = err?.response?.status;
            if (status === 401) {
              logout();
            }
            // For any other error (503, timeout, network) — stay logged in with cache
          })
          .finally(() => setLoading(false));
      } catch {
        // Corrupted localStorage — clear and start fresh
        localStorage.removeItem('bullseye_token');
        localStorage.removeItem('bullseye_user');
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (credentials) => {
    const res = await authAPI.login(credentials);
    const { token: t, user: u } = res.data;
    localStorage.setItem('bullseye_token', t);
    localStorage.setItem('bullseye_user', JSON.stringify(u));
    setToken(t);
    setUser(u);
    return res.data;
  };

  const register = async (data) => {
    const res = await authAPI.register(data);
    const { token: t, user: u } = res.data;
    if (t && u) {
      localStorage.setItem('bullseye_token', t);
      localStorage.setItem('bullseye_user', JSON.stringify(u));
      setToken(t);
      setUser(u);
    }
    return res.data;
  };

  const guestLogin = async () => {
    const res = await authAPI.guestLogin();
    const { token: t, user: u } = res.data;
    localStorage.setItem('bullseye_token', t);
    localStorage.setItem('bullseye_user', JSON.stringify(u));
    setToken(t);
    setUser(u);
    return res.data;
  };

  const logout = () => {
    localStorage.removeItem('bullseye_token');
    localStorage.removeItem('bullseye_user');
    setToken(null);
    setUser(null);
  };

  const updateUser = (updatedUser) => {
    setUser(updatedUser);
    localStorage.setItem('bullseye_user', JSON.stringify(updatedUser));
  };

  return (
    <AuthContext.Provider value={{
      user,
      token,
      loading,
      isGuest: user?.is_guest === true,
      isAuthenticated: !!user,
      login,
      register,
      guestLogin,
      logout,
      updateUser,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

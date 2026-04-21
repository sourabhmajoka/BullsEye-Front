import React, { createContext, useContext, useState, useEffect } from 'react';
import { authAPI } from '../services/api';

const AuthContext = createContext(null);

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [token, setToken] = useState(null);

  useEffect(() => {
    const savedToken = localStorage.getItem('bullseye_token');
    const savedUser = localStorage.getItem('bullseye_user');
    if (savedToken && savedUser) {
      setToken(savedToken);
      setUser(JSON.parse(savedUser));
      // Verify token
      authAPI.getMe().then(res => {
        setUser(res.data.user);
        localStorage.setItem('bullseye_user', JSON.stringify(res.data.user));
      }).catch(() => {
        logout();
      }).finally(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (credentials) => {
    const res = await authAPI.login(credentials);
    const { token, user } = res.data;
    localStorage.setItem('bullseye_token', token);
    localStorage.setItem('bullseye_user', JSON.stringify(user));
    setToken(token);
    setUser(user);
    return res.data;
  };

  const register = async (data) => {
    const res = await authAPI.register(data);
    const { token, user } = res.data;
    localStorage.setItem('bullseye_token', token);
    localStorage.setItem('bullseye_user', JSON.stringify(user));
    setToken(token);
    setUser(user);
    return res.data;
  };

  const guestLogin = async () => {
    const res = await authAPI.guestLogin();
    const { token, user } = res.data;
    localStorage.setItem('bullseye_token', token);
    localStorage.setItem('bullseye_user', JSON.stringify(user));
    setToken(token);
    setUser(user);
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

  const isGuest = user?.is_guest === true;
  const isAuthenticated = !!user;

  return (
    <AuthContext.Provider value={{
      user, token, loading, isGuest, isAuthenticated,
      login, register, guestLogin, logout, updateUser
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

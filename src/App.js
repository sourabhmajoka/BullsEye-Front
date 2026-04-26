import React, { useState, useEffect, useCallback, useRef, createContext, useContext } from 'react';
import { LineChart, Line, AreaChart, Area, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Search, Bell, User, Settings, LogOut, Home, BarChart2, Briefcase, Star, MessageCircle, RefreshCw, Plus, Minus, X, ChevronRight, ChevronDown, ChevronUp, Info, Shield, Target, Activity, DollarSign, Globe, ArrowUpRight, ArrowDownRight, Zap, Eye, EyeOff, Menu, AlertCircle, Check, Loader, Sun, Moon } from 'lucide-react';

// ============================================================
// UTILITIES
// ============================================================
const formatCurrency = (val, decimals = 2) => {
  if (!val && val !== 0) return '—';
  const n = parseFloat(val);
  if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (Math.abs(n) >= 1000) return `₹${n.toLocaleString('en-IN', { maximumFractionDigits: decimals })}`;
  return `₹${n.toFixed(decimals)}`;
};
const formatNum = (val, dec = 2) => val != null ? parseFloat(val).toFixed(dec) : '—';
const formatVolume = (vol) => {
  if (!vol) return '—';
  if (vol >= 10000000) return `${(vol / 10000000).toFixed(2)}Cr`;
  if (vol >= 100000) return `${(vol / 100000).toFixed(2)}L`;
  if (vol >= 1000) return `${(vol / 1000).toFixed(1)}K`;
  return vol;
};
const clsx = (...classes) => classes.filter(Boolean).join(' ');
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ============================================================
// CONFIG
// ============================================================
const API_BASE = 'https://bullseye-back.onrender.com/api';

const apiFetch = async (path, options = {}) => {
  const token = localStorage.getItem('bullseye_token');
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_BASE}${path}`, { ...options, headers });

  // Only force-logout on 401 from protected routes.
  // /auth/login and /auth/register legitimately return 401/403 for wrong
  // credentials — clearing localStorage there would wipe a valid session.
  const isAuthEndpoint = path.includes('/auth/login') ||
    path.includes('/auth/register') ||
    path.includes('/auth/guest');
  if (res.status === 401 && localStorage.getItem('bullseye_token') && !isAuthEndpoint) {
    localStorage.clear();
    window.location.reload();
    return;
  }

  const body = await res.json().catch(() => ({ error: 'Network error' }));

  if (!res.ok) {
    // Attach the full body to the error so callers can read needs_verification, email, etc.
    const err = new Error(body.error || `HTTP ${res.status}`);
    err.data = body;
    throw err;
  }
  return body;
};

// ============================================================
// AUTH CONTEXT
// ============================================================
const AuthContext = createContext(null);
const useAuth = () => useContext(AuthContext);

const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('bullseye_token');
    const saved = localStorage.getItem('bullseye_user');

    if (token && saved && saved !== "undefined") {
      try {
        setUser(JSON.parse(saved)); // show app immediately from cache
        apiFetch('/auth/me').then(d => {
          setUser(d.user);
          localStorage.setItem('bullseye_user', JSON.stringify(d.user));
        }).catch((err) => {
          // Only clear session on a real 401 (invalid/expired token).
          // Network errors, timeouts, 503s (Render waking up) must NOT
          // log the user out — their cached session is still valid.
          if (err?.message?.includes('401') || err?.status === 401) {
            localStorage.clear();
            setUser(null);
          }
          // Any other error: stay logged in with cached data
        }).finally(() => setLoading(false));
      } catch (error) {
        localStorage.clear();
        setLoading(false);
      }
    } else {
      setLoading(false);
    }
  }, []);

  const login = async (creds) => {
    const d = await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(creds) });
    // d.needs_verification means password was correct but email unverified
    if (d.needs_verification) return d;
    localStorage.setItem('bullseye_token', d.token);
    localStorage.setItem('bullseye_user', JSON.stringify(d.user));
    setUser(d.user);
    return d;
  };
  const register = async (data) => {
    const d = await apiFetch('/auth/register', { method: 'POST', body: JSON.stringify(data) });
    // Registration never returns a token — user must verify email first.
    // Just return the response so the caller can show the verify screen.
    return d;
  };
  const guestLogin = async () => {
    const d = await apiFetch('/auth/guest', { method: 'POST' });
    localStorage.setItem('bullseye_token', d.token);
    localStorage.setItem('bullseye_user', JSON.stringify(d.user));
    setUser(d.user); return d;
  };
  const logout = () => {
    localStorage.clear();
    setUser(null);
  };
  const updateUser = (u) => { setUser(u); localStorage.setItem('bullseye_user', JSON.stringify(u)); };

  return (
    <AuthContext.Provider value={{ user, loading, isGuest: user?.is_guest, isAuth: !!user, login, register, guestLogin, logout, updateUser }}>
      {children}
    </AuthContext.Provider>
  );
};

// ============================================================
// THEME CONTEXT
// ============================================================
const ThemeContext = createContext();
const useTheme = () => useContext(ThemeContext);
const ThemeProvider = ({ children }) => {
  const [isDark, setIsDark] = useState(() => {
    const saved = localStorage.getItem('bullseye_theme');
    return saved ? saved === 'dark' : true;
  });

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const toggleTheme = () => {
    setIsDark(prev => {
      const next = !prev;
      localStorage.setItem('bullseye_theme', next ? 'dark' : 'light');
      return next;
    });
  };

  return (
    <ThemeContext.Provider value={{ isDark, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

// ============================================================
// TOAST
// ============================================================
const ToastContext = createContext(null);
const useToast = () => useContext(ToastContext);
const ToastProvider = ({ children }) => {
  const [toasts, setToasts] = useState([]);
  const show = (msg, type = 'info') => {
    const id = Date.now();
    setToasts(t => [...t, { id, msg, type }]);
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3500);
  };
  return (
    <ToastContext.Provider value={{ success: m => show(m, 'success'), error: m => show(m, 'error'), info: m => show(m, 'info') }}>
      {children}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2">
        {toasts.map(t => (
          <div key={t.id} className={clsx('px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2 text-sm font-medium animate-slide-up',
            t.type === 'success' ? 'bg-emerald-500 text-white' : t.type === 'error' ? 'bg-red-500 text-white' : 'bg-slate-700 text-white')}>
            {t.type === 'success' ? <Check size={16} /> : t.type === 'error' ? <AlertCircle size={16} /> : <Info size={16} />}
            {t.msg}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

// ============================================================
// LOADING SPINNER
// ============================================================
const Spinner = ({ size = 20, className = '' }) => (
  <Loader size={size} className={clsx('animate-spin', className)} />
);

// ============================================================
// LANDING PAGE
// ============================================================
const LandingPage = ({ onLogin, onRegister, onGuest }) => {
  const features = [
    { icon: '📊', title: 'Real-Time Market Data', desc: 'Live NSE & BSE quotes for 150+ Indian stocks. Nifty 50, Sensex, Bank Nifty updated live.' },
    { icon: '💼', title: 'Portfolio Tracker', desc: 'Track holdings, P&L, day gains and overall returns. See your portfolio grow in real time.' },
    { icon: '🤖', title: 'AI Stock Analyst', desc: 'Ask anything about Indian markets. Personalised to your risk profile.' },
    { icon: '📈', title: 'Full Stock Analysis', desc: 'Fundamental data: P/E, ROE, revenue growth. Price history charts for any period.' },
    { icon: '⭐', title: 'Smart Watchlist', desc: 'Save favourite stocks and track live prices and day changes in one clean view.' },
    { icon: '🎯', title: 'Risk-Based Advice', desc: 'Conservative, Moderate, or Aggressive — the AI adapts every recommendation to your profile.' },
  ];
  return (
    <div className="min-h-screen bg-slate-950 text-white overflow-x-hidden">
      {/* Fixed Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-slate-950/80 backdrop-blur-xl border-b border-slate-800">
        <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <TrendingUp size={18} className="text-white" />
            </div>
            <span className="text-white font-black text-xl">BullsEye</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={onGuest} className="text-slate-400 hover:text-white text-sm font-medium transition-colors px-3 py-1.5">
              Browse as Guest
            </button>
            <button onClick={onLogin} className="border border-slate-600 text-slate-300 hover:bg-slate-800 text-sm font-semibold px-4 py-2 rounded-xl transition-all">
              Sign In
            </button>
            <button onClick={onRegister} className="bg-gradient-to-r from-emerald-500 to-cyan-500 text-white text-sm font-bold px-4 py-2 rounded-xl hover:from-emerald-400 hover:to-cyan-400 transition-all shadow-lg shadow-emerald-500/25">
              Sign Up Free
            </button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <section className="relative pt-36 pb-24 px-6 overflow-hidden">
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[700px] h-[400px] bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute top-40 right-1/4 w-[300px] h-[300px] bg-cyan-500/8 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-5xl mx-auto text-center relative">
          <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-full px-4 py-1.5 mb-6">
            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            <span className="text-emerald-400 text-xs font-semibold tracking-wide">NSE & BSE Live Data</span>
          </div>
          <h1 className="text-6xl font-black leading-tight mb-6">
            <span className="text-white">India's Smartest</span>
            <br />
            <span className="bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-400 bg-clip-text text-transparent">
              Stock Market App
            </span>
          </h1>
          <p className="text-slate-400 text-xl max-w-2xl mx-auto mb-10 leading-relaxed">
            Real-time NSE & BSE data, AI-powered stock analysis, portfolio tracking, and personalised investment advice — all free.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <button onClick={onRegister}
              className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-bold px-8 py-4 rounded-2xl hover:from-emerald-400 hover:to-cyan-400 transition-all shadow-xl shadow-emerald-500/30 text-base">
              <TrendingUp size={20} /> Get Started Free
            </button>
            <button onClick={onGuest}
              className="flex items-center gap-2 border border-slate-600 text-slate-300 hover:bg-slate-800 font-semibold px-8 py-4 rounded-2xl transition-all text-base">
              <Eye size={20} /> Explore as Guest
            </button>
          </div>
          <p className="text-slate-600 text-sm mt-4">No credit card · Free forever · Ready in 30 seconds</p>
        </div>

        {/* Stats */}
        <div className="max-w-3xl mx-auto mt-16 grid grid-cols-4 gap-4">
          {[['150+', 'Indian Stocks'], ['NSE', 'Live Data'], ['AI', 'Powered'], ['Free', 'To Use']].map(([val, label]) => (
            <div key={label} className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5 text-center hover:border-emerald-500/30 transition-all">
              <div className="text-3xl font-black text-emerald-400 mb-1">{val}</div>
              <div className="text-slate-500 text-sm">{label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Mock App Preview */}
      <section className="max-w-6xl mx-auto px-6 mb-20">
        <div className="bg-slate-900 border border-slate-700/50 rounded-3xl p-6 shadow-2xl">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-3 h-3 rounded-full bg-red-500" /><div className="w-3 h-3 rounded-full bg-yellow-500" /><div className="w-3 h-3 rounded-full bg-emerald-500" />
            <span className="ml-3 text-slate-500 text-xs font-mono">BullsEye Dashboard</span>
          </div>
          <div className="grid grid-cols-4 gap-3 mb-4">
            {[['NIFTY 50', '24,834', '+0.58%', true], ['SENSEX', '81,520', '+0.62%', true], ['BANK NIFTY', '53,210', '-0.23%', false], ['NIFTY IT', '38,950', '+1.12%', true]].map(([n, v, c, up]) => (
              <div key={n} className="bg-slate-800 rounded-xl p-3">
                <div className="text-slate-400 text-xs">{n}</div>
                <div className="text-white font-bold">{v}</div>
                <div className={clsx('text-sm font-semibold', up ? 'text-emerald-400' : 'text-red-400')}>{c}</div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-800 rounded-xl p-4">
              <div className="text-slate-400 text-xs mb-2 font-semibold tracking-wider">TOP GAINERS</div>
              {[['HINDUNILVR', '₹2,240', '+4.72%'], ['NESTLEIND', '₹1,285', '+2.20%'], ['JSWSTEEL', '₹1,241', '+2.20%']].map(([s, p, c]) => (
                <div key={s} className="flex justify-between py-1.5 border-b border-slate-700/50 last:border-0">
                  <div><div className="text-white text-sm font-semibold">{s}</div><div className="text-slate-500 text-xs">{p}</div></div>
                  <span className="text-emerald-400 text-sm font-bold self-center">{c}</span>
                </div>
              ))}
            </div>
            <div className="bg-slate-800 rounded-xl p-4">
              <div className="text-slate-400 text-xs mb-2 font-semibold tracking-wider">AI ASSISTANT</div>
              <div className="space-y-2">
                <div className="bg-slate-700 rounded-2xl rounded-tl-none px-3 py-2 text-slate-300 text-xs leading-relaxed">
                  📊 <strong>RELIANCE</strong> — Strong Buy at ₹1,364. P/E 26x is reasonable. Jio and retail are high-growth catalysts. Suitable for moderate-risk investors.
                </div>
                <div className="bg-emerald-500 rounded-2xl rounded-tr-none px-3 py-2 text-white text-xs ml-10">
                  Is HDFC Bank a good buy?
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Grid */}
      <section className="max-w-6xl mx-auto px-6 mb-24">
        <div className="text-center mb-12">
          <h2 className="text-4xl font-black text-white mb-3">Everything you need</h2>
          <p className="text-slate-400 text-lg">Professional tools for every Indian investor</p>
        </div>
        <div className="grid grid-cols-3 gap-5">
          {features.map(f => (
            <div key={f.title} className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 hover:border-emerald-500/30 transition-all group cursor-default">
              <div className="text-3xl mb-3">{f.icon}</div>
              <h3 className="text-white font-bold text-base mb-2 group-hover:text-emerald-400 transition-colors">{f.title}</h3>
              <p className="text-slate-500 text-sm leading-relaxed">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA Section */}
      <section className="max-w-4xl mx-auto px-6 mb-24 text-center">
        <div className="bg-gradient-to-br from-emerald-500/10 via-cyan-500/10 to-blue-500/10 border border-emerald-500/20 rounded-3xl p-12">
          <h2 className="text-4xl font-black text-white mb-4">Start investing smarter today</h2>
          <p className="text-slate-400 text-lg mb-8 max-w-xl mx-auto">Real data, AI insights, and a portfolio tracker — all in one free app built for Indian investors.</p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <button onClick={onRegister}
              className="flex items-center gap-2 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-bold px-8 py-4 rounded-2xl hover:from-emerald-400 hover:to-cyan-400 transition-all shadow-xl shadow-emerald-500/30 text-base">
              <TrendingUp size={20} /> Create Free Account
            </button>
            <button onClick={onLogin}
              className="border border-slate-600 text-slate-300 hover:bg-slate-800 font-semibold px-8 py-4 rounded-2xl transition-all text-base">
              Sign In
            </button>
            <button onClick={onGuest}
              className="text-slate-500 hover:text-slate-300 font-medium px-6 py-4 transition-colors text-base">
              Browse as Guest →
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-800 px-6 py-8 text-center">
        <div className="flex items-center justify-center gap-2 mb-2">
          <div className="w-6 h-6 rounded-lg bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center">
            <TrendingUp size={12} className="text-white" />
          </div>
          <span className="text-white font-bold">BullsEye</span>
        </div>
        <p className="text-slate-500 text-sm">Indian Stock Market Intelligence · NSE & BSE Data</p>
        <p className="mt-1 text-slate-600 text-xs">⚠️ Not SEBI-registered financial advice. Invest at your own risk.</p>
      </footer>
    </div>
  );
};

// ============================================================
// AUTH PAGE — Login / Signup
// ============================================================
// ============================================================
// VERIFY EMAIL SCREEN
// Shown after register OR when login returns needs_verification
// ============================================================
const VerifyEmailScreen = ({ email, onBack }) => {
  const toast = useToast();
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  const handleResend = async () => {
    setResending(true);
    try {
      await apiFetch('/auth/resend-verification', {
        method: 'POST',
        body: JSON.stringify({ email }),
      });
      setResent(true);
      toast.success('Verification email resent! Check your inbox.');
    } catch (err) {
      toast.error(err.message || 'Failed to resend. Please try again.');
    } finally {
      setResending(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center p-4">
      <div className="relative w-full max-w-md text-center">
        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8 shadow-2xl">
          {/* Icon */}
          <div className="w-20 h-20 mx-auto mb-5 rounded-full bg-gradient-to-br from-emerald-500/20 to-cyan-500/20 border border-emerald-500/30 flex items-center justify-center">
            <span className="text-4xl">📧</span>
          </div>
          <h2 className="text-2xl font-black text-white mb-2">Check your inbox</h2>
          <p className="text-slate-400 text-sm mb-1">We sent a verification link to</p>
          <p className="text-emerald-400 font-semibold mb-5">{email}</p>

          <div className="bg-slate-800/60 border border-slate-700 rounded-xl p-4 text-left mb-6 space-y-2">
            {[
              'Open the email from BullsEye',
              'Click the "Verify My Email" button',
              'You\'ll be signed in automatically',
            ].map((step, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center flex-shrink-0">
                  <span className="text-emerald-400 text-xs font-bold">{i + 1}</span>
                </div>
                <p className="text-slate-300 text-sm">{step}</p>
              </div>
            ))}
          </div>

          <p className="text-slate-500 text-xs mb-4">
            Can't find it? Check your spam folder.
          </p>

          {/* Resend button */}
          <button
            onClick={handleResend}
            disabled={resending || resent}
            className="w-full py-2.5 border border-slate-600 text-slate-300 font-semibold rounded-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2 mb-3 disabled:opacity-50"
          >
            {resending ? <Spinner size={16} /> : resent ? <Check size={16} className="text-emerald-400" /> : null}
            {resent ? 'Email resent!' : resending ? 'Sending…' : '🔄 Resend verification email'}
          </button>

          <button
            onClick={onBack}
            className="text-slate-500 hover:text-slate-300 text-sm transition-colors"
          >
            ← Back to sign in
          </button>
        </div>
      </div>
    </div>
  );
};

const AuthPage = ({ initialMode = 'login', onBack }) => {
  const [mode, setMode] = useState(initialMode);
  const [pendingEmail, setPendingEmail] = useState(null); // set when verification needed
  const { login, register, guestLogin } = useAuth();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [showPwd, setShowPwd] = useState(false);
  const [showRiskInfo, setShowRiskInfo] = useState(false);
  const [form, setForm] = useState({
    identifier: '', password: '', username: '',
    email: '', full_name: '', risk_profile: 'moderate'
  });

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const riskProfiles = {
    conservative: { emoji: '🛡️', label: 'Conservative', desc: 'Safety first. Large-cap stocks, dividends, low volatility. Capital preservation over growth.' },
    moderate: { emoji: '⚖️', label: 'Moderate', desc: 'Balanced risk-reward. Mix of large and mid-cap stocks. Long-term wealth building.' },
    aggressive: { emoji: '🚀', label: 'Aggressive', desc: 'High risk, high reward. Small/mid-cap growth stocks and momentum plays. 5+ year horizon.' },
  };

  // Show the verify screen if we're waiting for email confirmation
  if (pendingEmail) {
    return <VerifyEmailScreen email={pendingEmail} onBack={() => setPendingEmail(null)} />;
  }

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      if (mode === 'login') {
        const result = await login({ identifier: form.identifier, password: form.password });
        if (result?.needs_verification) {
          setPendingEmail(result.email);
          return;
        }
        toast.success('Welcome back!');
      } else {
        const result = await register({
          username: form.username, email: form.email,
          password: form.password, full_name: form.full_name,
          risk_profile: form.risk_profile,
        });
        // Registration always requires verification — show the verify screen
        setPendingEmail(result.email || form.email);
      }
    } catch (err) {
      // 403 from login when email not verified — err.data has needs_verification + email
      if (err.data?.needs_verification) {
        setPendingEmail(err.data.email || (form.identifier.includes('@') ? form.identifier : form.email));
        return;
      }
      toast.error(err.message || 'Something went wrong');
    } finally {
      setLoading(false);
    }
  };

  const handleGuest = async () => {
    setLoading(true);
    try { await guestLogin(); toast.info('Browsing as guest'); }
    catch (err) { toast.error(err.message); }
    finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-950 via-slate-900 to-indigo-950 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-[url('data:image/svg+xml,%3Csvg xmlns=%22http://www.w3.org/2000/svg%22 width=%2260%22 height=%2260%22%3E%3Cpath d=%22M 60 0 L 0 0 0 60%22 fill=%22none%22 stroke=%22%23ffffff06%22 stroke-width=%221%22/%3E%3C/svg%3E')]" />
      <div className="relative w-full max-w-md">
        {onBack && (
          <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm mb-5 transition-colors">
            <ChevronRight size={16} className="rotate-180" /> Back to home
          </button>
        )}
        <div className="text-center mb-7">
          <div className="inline-flex items-center gap-2 mb-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/30">
              <TrendingUp size={22} className="text-white" />
            </div>
            <span className="text-3xl font-black text-white tracking-tight">BullsEye</span>
          </div>
          <p className="text-slate-400 text-sm">Indian Stock Market Intelligence</p>
        </div>

        <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-8 shadow-2xl">
          <div className="flex bg-slate-800 rounded-xl p-1 mb-6">
            {[['login', 'Sign In'], ['register', 'Sign Up']].map(([m, lbl]) => (
              <button key={m} onClick={() => setMode(m)}
                className={clsx('flex-1 py-2 rounded-lg text-sm font-semibold transition-all',
                  mode === m ? 'bg-emerald-500 text-white shadow-lg' : 'text-slate-400 hover:text-white')}>
                {lbl}
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === 'login' && (
              <Input label="Email or Username" value={form.identifier}
                onChange={v => set('identifier', v)} placeholder="email or username" required />
            )}
            {mode === 'register' && (
              <>
                <Input label="Full Name" value={form.full_name} autoComplete="name"
                  onChange={v => set('full_name', v)} placeholder="Rahul Sharma" />
                <Input label="Username" value={form.username} autoComplete="username"
                  onChange={v => set('username', v)} placeholder="rahul123" required />
                <Input label="Email" type="email" value={form.email} autoComplete="email"
                  onChange={v => set('email', v)} placeholder="rahul@example.com" required />
              </>
            )}

            <div className="relative">
              <Input label="Password" type={showPwd ? 'text' : 'password'}
                value={form.password} onChange={v => set('password', v)}
                autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                placeholder="Min 6 characters" required />
              <button type="button" onClick={() => setShowPwd(p => !p)}
                className="absolute right-3 top-8 text-slate-400 hover:text-white">
                {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>

            {mode === 'register' && (
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <label className="text-xs text-slate-400">Risk Profile</label>
                  <button type="button" onClick={() => setShowRiskInfo(v => !v)}
                    className="text-slate-500 hover:text-slate-300 transition-colors">
                    <Info size={13} />
                  </button>
                  <span className="text-xs text-indigo-400 italic">shapes AI responses</span>
                </div>
                {showRiskInfo && (
                  <div className="mb-3 bg-slate-800 border border-slate-600 rounded-xl p-3 space-y-2">
                    <p className="text-xs text-slate-300 font-semibold mb-1">
                      Your risk profile personalises every AI recommendation:
                    </p>
                    {Object.entries(riskProfiles).map(([key, p]) => (
                      <div key={key} className="text-xs text-slate-400 leading-relaxed">
                        <span className="font-semibold text-white">{p.emoji} {p.label}:</span> {p.desc}
                      </div>
                    ))}
                  </div>
                )}
                <div className="grid grid-cols-3 gap-2">
                  {Object.entries(riskProfiles).map(([key, p]) => (
                    <button key={key} type="button" onClick={() => set('risk_profile', key)}
                      className={clsx('py-2.5 rounded-xl text-xs font-semibold border transition-all flex flex-col items-center gap-0.5',
                        form.risk_profile === key
                          ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400'
                          : 'border-slate-600 text-slate-400 hover:border-slate-500')}>
                      <span className="text-base">{p.emoji}</span>
                      <span className="capitalize">{key}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            <button type="submit" disabled={loading}
              className="w-full py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-bold rounded-xl hover:from-emerald-400 hover:to-cyan-400 transition-all shadow-lg shadow-emerald-500/25 disabled:opacity-50 flex items-center justify-center gap-2">
              {loading && <Spinner size={18} />}
              {mode === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          </form>

          {mode === 'register' && (
            <div className="mt-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-2.5 flex items-start gap-2">
              <Check size={13} className="text-emerald-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-400">
                A <strong className="text-emerald-400">verification email</strong> will be sent — you must verify before signing in.
              </p>
            </div>
          )}

          <div className="my-4 flex items-center gap-3">
            <div className="flex-1 h-px bg-slate-700" />
            <span className="text-slate-500 text-xs">or</span>
            <div className="flex-1 h-px bg-slate-700" />
          </div>

          <button onClick={handleGuest} disabled={loading}
            className="w-full py-3 border border-slate-600 text-slate-300 font-semibold rounded-xl hover:bg-slate-800 transition-all flex items-center justify-center gap-2">
            <Eye size={16} /> Continue as Guest
          </button>
          <p className="text-center text-xs text-slate-600 mt-2">
            Guest: market data only · No portfolio or AI
          </p>
        </div>
      </div>
    </div>
  );
};

const Input = ({ label, type = 'text', value, onChange, placeholder, required, autoComplete }) => (
  <div>
    {label && <label className="block text-xs text-slate-400 mb-1.5">{label}</label>}
    <input type={type} value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder} required={required}
      autoComplete={autoComplete || (type === 'email' ? 'email' : type === 'password' ? 'current-password' : 'off')}
      className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-2.5 text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all" />
  </div>
);

// ============================================================
// SIDEBAR NAVIGATION
// ─── Market status helper ─────────────────────────────────────────────────────
const getMarketStatus = () => {
  // NSE market hours: 9:15 AM – 3:30 PM IST, Mon–Fri
  const now = new Date();
  // Convert to IST (UTC+5:30)
  const utc = now.getTime() + now.getTimezoneOffset() * 60000;
  const ist = new Date(utc + 5.5 * 3600000);
  const day = ist.getDay(); // 0=Sun, 6=Sat
  const hour = ist.getHours();
  const min = ist.getMinutes();
  const totalMin = hour * 60 + min;
  const openMin = 9 * 60 + 15;   // 9:15 AM
  const closeMin = 15 * 60 + 30;  // 3:30 PM
  if (day === 0 || day === 6) return { open: false, label: 'Closed (Weekend)' };
  if (totalMin >= openMin && totalMin < closeMin) return { open: true, label: 'Live' };
  if (totalMin < openMin) return { open: false, label: 'Pre-Market' };
  return { open: false, label: 'Closed' };
};

// ============================================================
const ThemeToggleButton = () => {
  const { isDark, toggleTheme } = useTheme();
  return (
    <button
      onClick={toggleTheme}
      title={isDark ? 'Switch to light mode' : 'Switch to dark mode'}
      className="flex items-center justify-center w-9 h-9 rounded-xl border border-slate-700 text-slate-400 hover:text-white hover:border-emerald-500/50 hover:bg-emerald-500/10 transition-all flex-shrink-0"
    >
      {isDark ? <Sun size={16} /> : <Moon size={16} />}
    </button>
  );
};
const Sidebar = ({ activeTab, setActiveTab }) => {
  const { user, isGuest, logout } = useAuth();
  const navItems = [
    { id: 'dashboard', icon: Home, label: 'Dashboard' },
    { id: 'stocks', icon: BarChart2, label: 'Stocks' },
    { id: 'portfolio', icon: Briefcase, label: 'Portfolio', guestLock: true },
    { id: 'watchlist', icon: Star, label: 'Watchlist', guestLock: true },
    { id: 'ai', icon: MessageCircle, label: 'AI Assistant', guestLock: true },
    { id: 'profile', icon: Settings, label: 'Profile' },
  ];

  return (
    <aside className="w-64 bg-slate-950 border-r border-slate-800 flex flex-col h-screen fixed left-0 top-0 z-40">
      {/* Logo */}
      <div className="px-6 py-5 border-b border-slate-800">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/20">
            <TrendingUp size={18} className="text-white" />
          </div>
          <div>
            <div className="text-white font-black text-lg leading-none">BullsEye</div>
            <div className="text-slate-500 text-[10px] tracking-widest uppercase">India Markets</div>
          </div>
        </div>
      </div>

      {/* User */}
      <div className="px-4 py-4 border-b border-slate-800">
        <div className="flex items-center gap-3 p-3 bg-slate-900 rounded-xl">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-white font-bold text-sm">
            {user?.full_name?.[0] || user?.username?.[0] || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-white text-sm font-semibold truncate">{user?.full_name || user?.username}</div>
            <div className="text-slate-500 text-xs">{isGuest ? 'Guest User' : user?.email?.split('@')[0]}</div>
          </div>
          {isGuest && <span className="bg-amber-500/20 text-amber-400 text-[10px] px-2 py-0.5 rounded-full font-medium">Guest</span>}
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 overflow-y-auto">
        {navItems.map(item => (
          <button key={item.id} onClick={() => setActiveTab(item.id)}
            className={clsx('w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-1 text-sm font-medium transition-all group',
              activeTab === item.id ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'text-slate-400 hover:bg-slate-800 hover:text-white')}>
            <item.icon size={18} />
            {item.label}
            {item.guestLock && isGuest && <Shield size={12} className="ml-auto text-amber-500" />}
          </button>
        ))}
      </nav>

      {/* Bottom */}
      {/* Bottom */}
      <div className="p-4 border-t border-slate-800">
        <div className="flex items-center gap-2 mb-2">
          <button onClick={logout} className="flex-1 flex items-center gap-3 px-3 py-2.5 rounded-xl text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all text-sm font-medium">
            <LogOut size={18} /> Sign Out
          </button>
          <ThemeToggleButton />
        </div>
        {isGuest && (
          <div className="mt-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-xl text-xs text-amber-400">
            Register for full access to portfolio, watchlist & AI
          </div>
        )}
      </div>
    </aside>
  );
};

// ============================================================
// HEADER
// ============================================================
const Header = ({ title, onSearch }) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [show, setShow] = useState(false);
  const searchRef = useRef(null);

  const handleSearch = useCallback(async (q) => {
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    try {
      const data = await apiFetch(`/stocks/search?q=${encodeURIComponent(q)}`);
      setResults(data.results || []);
    } catch { setResults([]); }
    finally { setSearching(false); }
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => { if (query) handleSearch(query); else setResults([]); }, 300);
    return () => clearTimeout(timer);
  }, [query, handleSearch]);

  return (
    <header className="bg-slate-900/80 backdrop-blur-xl border-b border-slate-800 px-6 py-4 flex items-center justify-between sticky top-0 z-30">
      <h1 className="text-white font-bold text-xl">{title}</h1>
      <div className="flex items-center gap-4">
        {/* Search */}
        <div className="relative" ref={searchRef}>
          <div className="flex items-center gap-2 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 w-72">
            {searching ? <Spinner size={16} className="text-slate-400" /> : <Search size={16} className="text-slate-400" />}
            <input value={query} onChange={e => { setQuery(e.target.value); setShow(true); }}
              onFocus={() => setShow(true)} onBlur={() => setTimeout(() => setShow(false), 200)}
              placeholder="Search stocks (TCS, RELIANCE...)"
              className="bg-transparent text-white text-sm outline-none flex-1 placeholder-slate-500 w-full" />
            {query && <button onClick={() => { setQuery(''); setResults([]); }}><X size={14} className="text-slate-500" /></button>}
          </div>
          {show && results.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl overflow-hidden z-50 max-h-72 overflow-y-auto">
              {results.map(r => (
                <button key={r.symbol} onClick={() => { onSearch && onSearch(r); setShow(false); setQuery(''); }}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-700 text-left transition-colors">
                  <div>
                    <div className="text-white font-semibold text-sm">{r.symbol}</div>
                    <div className="text-slate-400 text-xs truncate max-w-[200px]">{r.company_name}</div>
                  </div>
                  <span className="text-slate-500 text-xs">{r.exchange}</span>
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="w-px h-6 bg-slate-700" />
        {(() => {
          const ms = getMarketStatus();
          return (
            <div className={clsx('flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border',
              ms.open ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : 'bg-slate-700/50 border-slate-600 text-slate-400')}>
              <div className={clsx('w-1.5 h-1.5 rounded-full', ms.open ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500')} />
              NSE {ms.label}
            </div>
          );
        })()}
        <div className="w-px h-6 bg-slate-700" />
        <ThemeToggleButton />
      </div>
    </header>
  );
};

// ============================================================
// MARKET INDEX TICKER
// ============================================================
const IndexCard = ({ name, data }) => {
  const isUp = (data?.change_percent || 0) >= 0;
  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 hover:border-slate-600 transition-all">
      <div className="text-slate-400 text-xs font-medium mb-1">{name}</div>
      <div className="text-white font-bold text-lg">{data?.current?.toLocaleString('en-IN') || '—'}</div>
      <div className={clsx('flex items-center gap-1 text-sm font-semibold mt-0.5', isUp ? 'text-emerald-400' : 'text-red-400')}>
        {isUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
        {Math.abs(data?.change_percent || 0).toFixed(2)}%
        <span className="text-xs font-normal opacity-70">
          ({isUp ? '+' : ''}{data?.change?.toFixed(2) || '0.00'})
        </span>
      </div>
    </div>
  );
};

// ============================================================
// DASHBOARD — progressive parallel loading
// ============================================================
const Dashboard = ({ onSelectStock }) => {
  const { isGuest } = useAuth();
  const toast = useToast();
  const [indices, setIndices] = useState({});
  const [movers, setMovers] = useState({ gainers: [], losers: [] });
  const [sectors, setSectors] = useState({});
  const [portfolio, setPortfolio] = useState(null);
  const [indicesLoading, setIndicesLoading] = useState(true);
  const [moversLoading, setMoversLoading] = useState(true);
  const [sectorsLoading, setSectorsLoading] = useState(true);

  useEffect(() => {
    // Fire all three requests in parallel — render as each resolves
    apiFetch('/market/indices')
      .then(d => setIndices(d || {}))
      .catch(() => { })
      .finally(() => setIndicesLoading(false));

    apiFetch('/market/movers')
      .then(d => setMovers(d || { gainers: [], losers: [] }))
      .catch(() => { })
      .finally(() => setMoversLoading(false));

    apiFetch('/market/sectors')
      .then(d => setSectors(d || {}))
      .catch(() => { })
      .finally(() => setSectorsLoading(false));

    if (!isGuest) {
      apiFetch('/portfolio/')
        .then(async d => {
          if (d.portfolios?.length > 0) {
            const p = await apiFetch(`/portfolio/${d.portfolios[0].id}`);
            setPortfolio(p);
          }
        })
        .catch(() => { });
    }
  }, [isGuest]);

  const sectorData = Object.entries(sectors).map(([name, change]) => ({
    name, change: parseFloat(change), fill: change >= 0 ? '#10b981' : '#ef4444'
  }));

  const SkeletonCard = () => (
    <div className="bg-slate-900 border border-slate-700/50 rounded-xl p-4 animate-pulse">
      <div className="h-3 bg-slate-700 rounded w-16 mb-2" /><div className="h-6 bg-slate-700 rounded w-24 mb-2" /><div className="h-4 bg-slate-700 rounded w-20" />
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Market Status Banner */}
      <div className="bg-gradient-to-r from-emerald-500/10 via-cyan-500/10 to-blue-500/10 border border-emerald-500/20 rounded-2xl p-5 flex items-center justify-between">
        <div>
          <div className="text-white font-bold text-lg">Indian Market Overview</div>
          <div className="text-slate-400 text-sm mt-0.5">NSE &amp; BSE • Real-time Data</div>
        </div>
        <div className="flex items-center gap-2">
          {indicesLoading ? <Spinner size={14} className="text-emerald-400" /> : null}
          {(() => {
            const ms = getMarketStatus();
            return (
              <div className={clsx('flex items-center gap-1.5 text-sm font-semibold',
                ms.open ? 'text-emerald-400' : 'text-slate-400')}>
                <div className={clsx('w-2 h-2 rounded-full', ms.open ? 'bg-emerald-400 animate-pulse' : 'bg-slate-500')} />
                {indicesLoading ? 'Loading…' : ms.label}
              </div>
            );
          })()}
        </div>
      </div>

      {/* Indices */}
      <div className="grid grid-cols-4 gap-4">
        {indicesLoading
          ? Array(4).fill(0).map((_, i) => <SkeletonCard key={i} />)
          : <>
            <IndexCard name="NIFTY 50" data={indices.NIFTY50} />
            <IndexCard name="SENSEX" data={indices.SENSEX} />
            <IndexCard name="BANK NIFTY" data={indices.BANKNIFTY} />
            <IndexCard name="NIFTY IT" data={indices.NIFTYIT} />
          </>
        }
      </div>

      {/* Portfolio Summary (logged in) */}
      {!isGuest && portfolio && (
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-bold text-base">My Portfolio</h2>
            <span className="text-slate-400 text-sm">{portfolio.portfolio?.name}</span>
          </div>
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: 'Total Invested', val: formatCurrency(portfolio.summary?.total_invested), color: 'text-white' },
              { label: 'Current Value', val: formatCurrency(portfolio.summary?.total_current_value), color: 'text-white' },
              { label: 'Total P&L', val: `${portfolio.summary?.total_pnl >= 0 ? '+' : ''}${formatCurrency(portfolio.summary?.total_pnl)}`, color: portfolio.summary?.total_pnl >= 0 ? 'text-emerald-400' : 'text-red-400' },
              { label: 'Returns', val: `${portfolio.summary?.total_pnl_percent >= 0 ? '+' : ''}${formatNum(portfolio.summary?.total_pnl_percent)}%`, color: portfolio.summary?.total_pnl_percent >= 0 ? 'text-emerald-400' : 'text-red-400' },
            ].map(item => (
              <div key={item.label} className="bg-slate-800 rounded-xl p-4">
                <div className="text-slate-400 text-xs mb-1">{item.label}</div>
                <div className={clsx('font-bold text-lg', item.color)}>{item.val}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Gainers & Losers + Sectors */}
      <div className="grid grid-cols-2 gap-6">
        {/* Movers */}
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5">
          <h2 className="text-white font-bold text-sm mb-4 flex items-center gap-2">
            Top Movers Today {moversLoading && <Spinner size={14} className="text-slate-400" />}
          </h2>
          {moversLoading ? (
            <div className="space-y-2 animate-pulse">
              {Array(6).fill(0).map((_, i) => (
                <div key={i} className="flex justify-between items-center py-2 px-3">
                  <div><div className="h-3 bg-slate-700 rounded w-16 mb-1" /><div className="h-3 bg-slate-700 rounded w-12" /></div>
                  <div className="h-3 bg-slate-700 rounded w-14" />
                </div>
              ))}
            </div>
          ) : (
            <div className="space-y-1">
              <div className="text-emerald-400 text-xs font-semibold mb-2 flex items-center gap-1"><TrendingUp size={12} />Top Gainers</div>
              {(movers.gainers || []).slice(0, 4).map(s => (
                <button key={s.symbol} onClick={() => onSelectStock(s.symbol)}
                  className="w-full flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-800 transition-all">
                  <div className="text-left">
                    <div className="text-white text-sm font-semibold">{s.symbol}</div>
                    <div className="text-slate-500 text-xs">{formatCurrency(s.price)}</div>
                  </div>
                  <span className="text-emerald-400 text-sm font-bold">+{(s.change_percent || 0).toFixed(2)}%</span>
                </button>
              ))}
              {(movers.gainers || []).length === 0 && <div className="text-slate-500 text-xs px-3">No data available</div>}
              <div className="text-red-400 text-xs font-semibold mt-3 mb-2 flex items-center gap-1"><TrendingDown size={12} />Top Losers</div>
              {(movers.losers || []).slice(0, 4).map(s => (
                <button key={s.symbol} onClick={() => onSelectStock(s.symbol)}
                  className="w-full flex items-center justify-between py-2 px-3 rounded-lg hover:bg-slate-800 transition-all">
                  <div className="text-left">
                    <div className="text-white text-sm font-semibold">{s.symbol}</div>
                    <div className="text-slate-500 text-xs">{formatCurrency(s.price)}</div>
                  </div>
                  <span className="text-red-400 text-sm font-bold">{(s.change_percent || 0).toFixed(2)}%</span>
                </button>
              ))}
              {(movers.losers || []).length === 0 && <div className="text-slate-500 text-xs px-3">No data available</div>}
            </div>
          )}
        </div>

        {/* Sectors */}
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5">
          <h2 className="text-white font-bold text-sm mb-4 flex items-center gap-2">
            Sector Performance {sectorsLoading && <Spinner size={14} className="text-slate-400" />}
          </h2>
          {sectorsLoading ? (
            <div className="space-y-3 animate-pulse pt-2">
              {Array(6).fill(0).map((_, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="h-3 bg-slate-700 rounded w-16" />
                  <div className="flex-1 h-5 bg-slate-700 rounded" />
                </div>
              ))}
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={sectorData} layout="vertical" margin={{ left: 0 }}>
                <XAxis type="number" tickFormatter={v => `${v}%`} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} width={65} />
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <Tooltip formatter={v => [`${parseFloat(v).toFixed(2)}%`, 'Change']} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', color: '#fff' }} />
                <Bar dataKey="change" radius={[0, 4, 4, 0]}>
                  {sectorData.map((d, i) => <Cell key={i} fill={d.fill} fillOpacity={0.8} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {isGuest && (
        <div className="bg-gradient-to-r from-amber-500/10 to-orange-500/10 border border-amber-500/20 rounded-2xl p-5 flex items-center gap-4">
          <Shield size={24} className="text-amber-400 flex-shrink-0" />
          <div>
            <div className="text-white font-semibold">You're browsing as a guest</div>
            <div className="text-slate-400 text-sm mt-0.5">Register to access portfolio tracking, watchlist, AI assistant, and more features.</div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// STOCK DETAIL — progressive parallel loading
// ============================================================
const StockDetail = ({ symbol, onBack }) => {
  const { isGuest } = useAuth();
  const toast = useToast();
  const [quote, setQuote] = useState(null);
  const [quoteLoading, setQuoteLoading] = useState(true);
  const [history, setHistory] = useState([]);
  const [histLoading, setHistLoading] = useState(true);
  const [fundamentals, setFundamentals] = useState(null);
  const [fundLoading, setFundLoading] = useState(true);
  const [period, setPeriod] = useState('6mo');
  const [activeTab, setActiveTab] = useState('chart');
  const [inWatchlist, setInWatchlist] = useState(false);
  const [addingToBuy, setAddingToBuy] = useState(false);
  const [buyForm, setBuyForm] = useState({ qty: '', price: '', portfolioId: '' });
  const [portfolios, setPortfolios] = useState([]);
  const [showBuyModal, setShowBuyModal] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  const periods = ['1mo', '3mo', '6mo', '1y', '2y', '5y'];

  // Load quote immediately (fast via nsetools)
  useEffect(() => {
    setQuoteLoading(true);
    apiFetch(`/stocks/quote/${symbol}`)
      .then(q => {
        setQuote(q);
        setBuyForm(prev => ({ ...prev, price: q.current_price || '' }));
      })
      .catch(() => toast.error('Could not load quote'))
      .finally(() => setQuoteLoading(false));

    // Watchlist + portfolios in parallel (non-blocking)
    if (!isGuest) {
      apiFetch('/portfolio/').then(d => {
        setPortfolios(d.portfolios || []);
        if (d.portfolios?.length > 0) setBuyForm(prev => ({ ...prev, portfolioId: d.portfolios[0].id }));
      }).catch(() => { });
      apiFetch('/watchlist/').then(d => {
        setInWatchlist((d.watchlist || []).some(w => w.symbol === symbol));
      }).catch(() => { });
    }
  }, [symbol]);

  // Load history when period changes
  useEffect(() => {
    setHistLoading(true);
    setHistory([]);
    apiFetch(`/stocks/history/${symbol}?period=${period}`)
      .then(h => setHistory(h.data || []))
      .catch(() => { })
      .finally(() => setHistLoading(false));
  }, [symbol, period]);

  // Load fundamentals once (heavy, separate)
  useEffect(() => {
    setFundLoading(true);
    apiFetch(`/stocks/fundamentals/${symbol}`)
      .then(f => setFundamentals(f))
      .catch(() => { })
      .finally(() => setFundLoading(false));
  }, [symbol]);

  const toggleWatchlist = async () => {
    if (isGuest) { toast.error('Register to use watchlist'); return; }
    try {
      if (inWatchlist) {
        await apiFetch(`/watchlist/${symbol}`, { method: 'DELETE' });
        setInWatchlist(false); toast.success('Removed from watchlist');
      } else {
        await apiFetch('/watchlist/', { method: 'POST', body: JSON.stringify({ symbol, company_name: quote?.company_name || symbol }) });
        setInWatchlist(true); toast.success('Added to watchlist');
      }
    } catch (err) { toast.error(err.message); }
  };

  const handleBuy = async () => {
    if (!buyForm.qty || !buyForm.price || !buyForm.portfolioId) { toast.error('Fill all fields'); return; }
    setAddingToBuy(true);
    try {
      await apiFetch(`/portfolio/${buyForm.portfolioId}/holding`, {
        method: 'POST',
        body: JSON.stringify({ symbol, company_name: quote?.company_name, quantity: parseFloat(buyForm.qty), price: parseFloat(buyForm.price), exchange: 'NSE' })
      });
      toast.success(`${buyForm.qty} shares of ${symbol} added to portfolio!`);
      setShowBuyModal(false);
    } catch (err) { toast.error(err.message); }
    setAddingToBuy(false);
  };

  const getAIAnalysis = async () => {
    if (isGuest) { toast.error('Register to use AI analysis'); return; }
    setAiLoading(true);
    try {
      const data = await apiFetch(`/ai/analyze-stock/${symbol}`);
      setAiAnalysis(data.analysis);
      setActiveTab('ai');
    } catch (err) { toast.error('AI analysis unavailable'); }
    setAiLoading(false);
  };

  const chartData = history.map(d => ({
    date: d.date.split(' ')[0].slice(5),
    close: d.close, open: d.open, high: d.high, low: d.low, volume: d.volume
  }));

  const isUp = (quote?.change_percent || 0) >= 0;

  return (
    <div className="space-y-4">
      {/* Back button */}
      <button onClick={onBack} className="flex items-center gap-2 text-slate-400 hover:text-white text-sm transition-colors">
        <ChevronRight size={16} className="rotate-180" /> Back
      </button>

      {/* Header */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6">
        {quoteLoading ? (
          <div className="animate-pulse space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-slate-700 rounded-xl" />
              <div><div className="h-6 bg-slate-700 rounded w-20 mb-2" /><div className="h-4 bg-slate-700 rounded w-40" /></div>
            </div>
            <div className="h-10 bg-slate-700 rounded w-48" />
            <div className="grid grid-cols-6 gap-3 pt-4 border-t border-slate-800">
              {Array(6).fill(0).map((_, i) => <div key={i} className="h-8 bg-slate-700 rounded" />)}
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-400/20 to-cyan-500/20 border border-emerald-500/20 flex items-center justify-center text-emerald-400 font-black text-lg">
                    {symbol[0]}
                  </div>
                  <div>
                    <h1 className="text-white font-black text-2xl">{symbol}</h1>
                    <p className="text-slate-400 text-sm">{quote?.company_name || symbol}</p>
                  </div>
                </div>
                <div className="mt-4 flex items-end gap-3">
                  <span className="text-white font-black text-4xl">{formatCurrency(quote?.current_price)}</span>
                  <div className={clsx('flex items-center gap-1 text-lg font-bold pb-1', isUp ? 'text-emerald-400' : 'text-red-400')}>
                    {isUp ? <ArrowUpRight size={20} /> : <ArrowDownRight size={20} />}
                    {isUp ? '+' : ''}{(quote?.change || 0).toFixed(2)} ({isUp ? '+' : ''}{(quote?.change_percent || 0).toFixed(2)}%)
                  </div>
                </div>
                <div className="mt-2 text-slate-500 text-sm">{quote?.sector && quote.sector !== 'N/A' ? `${quote.sector} • ` : ''}{quote?.exchange || 'NSE'} • <span className={clsx('text-xs font-medium', quote?.source === 'nsetools' ? 'text-emerald-400' : 'text-slate-500')}>{quote?.source === 'nsetools' ? 'NSE Live' : 'Yahoo Finance'}</span></div>
              </div>
              <div className="flex gap-2 flex-wrap justify-end">
                <button onClick={toggleWatchlist}
                  className={clsx('px-4 py-2.5 rounded-xl border text-sm font-semibold flex items-center gap-2 transition-all',
                    inWatchlist ? 'bg-amber-500/20 border-amber-500/50 text-amber-400' : 'border-slate-600 text-slate-400 hover:border-slate-500')}>
                  <Star size={16} fill={inWatchlist ? 'currentColor' : 'none'} />
                  {inWatchlist ? 'Watching' : 'Watchlist'}
                </button>
                {!isGuest && (
                  <button onClick={() => setShowBuyModal(true)}
                    className="px-4 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-semibold flex items-center gap-2 hover:bg-emerald-400 transition-all">
                    <Plus size={16} /> Add to Portfolio
                  </button>
                )}
                <button onClick={getAIAnalysis} disabled={aiLoading}
                  className="px-4 py-2.5 rounded-xl bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 text-sm font-semibold flex items-center gap-2 hover:bg-indigo-500/30 transition-all disabled:opacity-50">
                  {aiLoading ? <Spinner size={14} /> : <Zap size={16} />}
                  AI Analysis
                </button>
              </div>
            </div>

            {/* Quick stats */}
            <div className="grid grid-cols-6 gap-3 mt-5 pt-5 border-t border-slate-800">
              {[
                ['Open', formatCurrency(quote?.open)],
                ['High', formatCurrency(quote?.high)],
                ['Low', formatCurrency(quote?.low)],
                ['Volume', formatVolume(quote?.volume)],
                ['52W High', formatCurrency(quote?.week_52_high)],
                ['52W Low', formatCurrency(quote?.week_52_low)],
              ].map(([label, val]) => (
                <div key={label} className="text-center">
                  <div className="text-slate-500 text-xs">{label}</div>
                  <div className="text-white text-sm font-semibold mt-0.5">{val}</div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-slate-900 border border-slate-700/50 rounded-xl p-1 w-fit">
        {['chart', 'fundamentals', 'ai'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={clsx('px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-all',
              activeTab === tab ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white')}>
            {tab === 'ai' ? 'AI Analysis' : tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Chart Tab */}
      {activeTab === 'chart' && (
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-bold flex items-center gap-2">
              Price History {histLoading && <Spinner size={14} className="text-slate-400" />}
            </h2>
            <div className="flex gap-1">
              {periods.map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={clsx('px-3 py-1.5 rounded-lg text-xs font-semibold transition-all',
                    period === p ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white hover:bg-slate-800')}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          {histLoading ? (
            <div className="h-80 flex items-center justify-center">
              <div className="text-center">
                <Spinner size={28} className="text-emerald-400 mx-auto mb-3" />
                <div className="text-slate-500 text-sm">Loading price history…</div>
              </div>
            </div>
          ) : chartData.length === 0 ? (
            <div className="h-80 flex items-center justify-center text-slate-500 text-sm">No historical data available</div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={320}>
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={isUp ? '#10b981' : '#ef4444'} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={isUp ? '#10b981' : '#ef4444'} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} tickFormatter={v => `₹${v.toLocaleString('en-IN')}`} width={70} />
                  <Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px', color: '#fff' }}
                    formatter={(v) => [formatCurrency(v), 'Close']} />
                  <Area type="monotone" dataKey="close" stroke={isUp ? '#10b981' : '#ef4444'} strokeWidth={2} fill="url(#priceGrad)" />
                </AreaChart>
              </ResponsiveContainer>
              {/* Volume chart */}
              <ResponsiveContainer width="100%" height={80} className="mt-2">
                <BarChart data={chartData}>
                  <Bar dataKey="volume" fill="#334155" radius={[2, 2, 0, 0]} />
                  <XAxis dataKey="date" hide />
                  <YAxis hide />
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </div>
      )}

      {/* Fundamentals Tab */}
      {activeTab === 'fundamentals' && (
        fundLoading ? (
          <div className="grid grid-cols-2 gap-4">
            {Array(2).fill(0).map((_, i) => (
              <div key={i} className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5 animate-pulse space-y-3">
                <div className="h-4 bg-slate-700 rounded w-24 mb-4" />
                {Array(6).fill(0).map((_, j) => (
                  <div key={j} className="flex justify-between py-2 border-b border-slate-800">
                    <div className="h-3 bg-slate-700 rounded w-24" />
                    <div className="h-3 bg-slate-700 rounded w-16" />
                  </div>
                ))}
              </div>
            ))}
          </div>
        ) : fundamentals ? (
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5">
              <h3 className="text-white font-bold mb-4">Valuation</h3>
              <div className="space-y-3">
                {[
                  ['P/E Ratio', fundamentals.pe_ratio],
                  ['Forward P/E', fundamentals.forward_pe],
                  ['P/B Ratio', fundamentals.pb_ratio],
                  ['P/S Ratio', fundamentals.ps_ratio],
                  ['Market Cap', formatCurrency(fundamentals.market_cap)],
                  ['Enterprise Value', formatCurrency(fundamentals.enterprise_value)],
                  ['EPS', formatCurrency(fundamentals.eps)],
                  ['Beta', formatNum(fundamentals.beta)],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between items-center py-2 border-b border-slate-800 last:border-0">
                    <span className="text-slate-400 text-sm">{label}</span>
                    <span className="text-white font-semibold text-sm">{typeof val === 'number' ? formatNum(val) : (val || '—')}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5">
              <h3 className="text-white font-bold mb-4">Financials</h3>
              <div className="space-y-3">
                {[
                  ['Revenue', formatCurrency(fundamentals.revenue)],
                  ['Net Income', formatCurrency(fundamentals.net_income)],
                  ['EBITDA', formatCurrency(fundamentals.ebitda)],
                  ['ROE', `${formatNum(fundamentals.roe)}%`],
                  ['ROA', `${formatNum(fundamentals.roa)}%`],
                  ['Profit Margin', `${formatNum(fundamentals.profit_margin)}%`],
                  ['Revenue Growth', `${formatNum(fundamentals.revenue_growth)}%`],
                  ['Debt/Equity', formatNum(fundamentals.debt_to_equity)],
                  ['Current Ratio', formatNum(fundamentals.current_ratio)],
                  ['Dividend Yield', `${formatNum(fundamentals.dividend_yield)}%`],
                ].map(([label, val]) => (
                  <div key={label} className="flex justify-between items-center py-2 border-b border-slate-800 last:border-0">
                    <span className="text-slate-400 text-sm">{label}</span>
                    <span className="text-white font-semibold text-sm">{val}</span>
                  </div>
                ))}
              </div>
            </div>
            {fundamentals.description && (
              <div className="col-span-2 bg-slate-900 border border-slate-700/50 rounded-2xl p-5">
                <h3 className="text-white font-bold mb-3">About {quote?.company_name || symbol}</h3>
                <p className="text-slate-400 text-sm leading-relaxed">{fundamentals.description}</p>
                {fundamentals.sector && fundamentals.sector !== 'N/A' && (
                  <div className="mt-3 flex gap-2">
                    <span className="bg-emerald-500/10 text-emerald-400 text-xs px-2 py-1 rounded-full">{fundamentals.sector}</span>
                    <span className="bg-cyan-500/10 text-cyan-400 text-xs px-2 py-1 rounded-full">{fundamentals.industry}</span>
                  </div>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-8 text-center">
            <div className="text-slate-500 text-sm">Fundamental data not available for {symbol}</div>
          </div>
        )
      )}

      {/* AI Analysis Tab */}
      {activeTab === 'ai' && (
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-4">
            <Zap size={18} className="text-indigo-400" />
            <h2 className="text-white font-bold">AI Analysis - {symbol}</h2>
          </div>
          {aiAnalysis ? (
            <div className="prose-invert">
              <div className="text-slate-300 text-sm leading-relaxed whitespace-pre-wrap">{aiAnalysis}</div>
            </div>
          ) : (
            <div className="text-center py-8">
              <Zap size={36} className="text-indigo-400 mx-auto mb-3" />
              <p className="text-slate-400 text-sm">Click "AI Analysis" button to get an AI-powered stock analysis</p>
              {isGuest && <p className="text-amber-400 text-xs mt-2">Register to access AI analysis</p>}
            </div>
          )}
        </div>
      )}

      {/* Buy Modal */}
      {showBuyModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-white font-bold text-lg">Add {symbol} to Portfolio</h2>
              <button onClick={() => setShowBuyModal(false)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="text-slate-400 text-xs mb-1.5 block">Portfolio</label>
                <select value={buyForm.portfolioId} onChange={e => setBuyForm(f => ({ ...f, portfolioId: e.target.value }))}
                  className="w-full bg-slate-800 border border-slate-600 text-white rounded-xl px-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500">
                  {portfolios.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <Input label="Quantity (shares)" type="number" value={buyForm.qty} onChange={v => setBuyForm(f => ({ ...f, qty: v }))} placeholder="e.g. 10" />
              <Input label="Buy Price (₹)" type="number" value={buyForm.price} onChange={v => setBuyForm(f => ({ ...f, price: v }))} placeholder="Current market price" />
              {buyForm.qty && buyForm.price && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-sm">
                  <span className="text-slate-400">Total Amount: </span>
                  <span className="text-emerald-400 font-bold">{formatCurrency(parseFloat(buyForm.qty) * parseFloat(buyForm.price))}</span>
                </div>
              )}
              <button onClick={handleBuy} disabled={addingToBuy}
                className="w-full py-3 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-400 transition-all flex items-center justify-center gap-2 disabled:opacity-50">
                {addingToBuy ? <Spinner size={18} /> : <Plus size={18} />}
                Add to Portfolio
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// MARKET PAGE
// ============================================================
const MarketPage = ({ onSelectStock }) => {
  const [allStocks, setAllStocks] = useState([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const toast = useToast();

  useEffect(() => {
    apiFetch('/stocks/list').then(d => {
      setAllStocks(d.stocks || []);
    }).catch(() => toast.error('Failed to load stocks')).finally(() => setLoading(false));
  }, []);

  const filtered = allStocks.filter(s =>
    !search || s.symbol.toLowerCase().includes(search.toLowerCase()) ||
    s.company_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <div className="flex-1 flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5">
          <Search size={16} className="text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search all Indian stocks..."
            className="bg-transparent text-white text-sm outline-none flex-1 placeholder-slate-500" />
          {search && <button onClick={() => setSearch('')}><X size={14} className="text-slate-500" /></button>}
        </div>
        <div className="text-slate-400 text-sm">{filtered.length} stocks</div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><Spinner size={28} className="text-emerald-400" /></div>
      ) : (
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-3 gap-0 bg-slate-800 px-5 py-3 text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <div>Symbol / Company</div>
            <div>Exchange</div>
            <div>Action</div>
          </div>
          <div className="divide-y divide-slate-800 max-h-[600px] overflow-y-auto">
            {filtered.map(s => (
              <button key={s.symbol} onClick={() => onSelectStock(s.symbol)}
                className="w-full grid grid-cols-3 gap-0 px-5 py-3.5 hover:bg-slate-800/50 transition-colors text-left">
                <div>
                  <div className="text-white font-semibold text-sm">{s.symbol}</div>
                  <div className="text-slate-500 text-xs truncate max-w-xs">{s.company_name}</div>
                </div>
                <div className="flex items-center">
                  <span className="bg-emerald-500/10 text-emerald-400 text-xs px-2 py-0.5 rounded-full font-medium">{s.exchange}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-slate-400 text-xs hover:text-emerald-400 transition-colors flex items-center gap-1">
                    View <ChevronRight size={12} />
                  </span>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// PORTFOLIO PAGE
// ============================================================
const PortfolioPage = ({ onSelectStock }) => {
  const { isGuest } = useAuth();
  const toast = useToast();
  const [portfolios, setPortfolios] = useState([]);
  const [activePortfolioId, setActivePortfolioId] = useState(null);
  const [portfolioData, setPortfolioData] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('holdings');
  const [editHolding, setEditHolding] = useState(null); // {id, qty, price}
  const [editLoading, setEditLoading] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState(null);
  const [aiLoading, setAiLoading] = useState(false);

  const loadPortfolio = async (id) => {
    try {
      const [pd, an] = await Promise.all([
        apiFetch(`/portfolio/${id}`),
        apiFetch(`/portfolio/analytics/${id}`)
      ]);
      setPortfolioData(pd);
      setAnalytics(an);
    } catch { toast.error('Failed to load portfolio'); }
  };

  useEffect(() => {
    if (isGuest) { setLoading(false); return; }
    apiFetch('/portfolio/').then(async p => {
      setPortfolios(p.portfolios || []);
      if (p.portfolios?.length > 0) {
        const id = p.portfolios[0].id;
        setActivePortfolioId(id);
        await loadPortfolio(id);
      }
    }).catch(() => toast.error('Failed to load portfolio'))
      .finally(() => setLoading(false));
  }, []);

  const handleRemoveHolding = async (holdingId) => {
    if (!window.confirm('Remove this holding from portfolio?')) return;
    try {
      await apiFetch(`/portfolio/${activePortfolioId}/holding/${holdingId}`, { method: 'DELETE' });
      toast.success('Holding removed');
      await loadPortfolio(activePortfolioId);
    } catch (err) { toast.error(err.message); }
  };

  const handleEditHolding = async () => {
    if (!editHolding) return;
    setEditLoading(true);
    try {
      await apiFetch(`/portfolio/${activePortfolioId}/holding/${editHolding.id}`, {
        method: 'PUT',
        body: JSON.stringify({ quantity: parseFloat(editHolding.qty), avg_buy_price: parseFloat(editHolding.price) })
      });
      toast.success('Holding updated');
      setEditHolding(null);
      await loadPortfolio(activePortfolioId);
    } catch (err) { toast.error(err.message); }
    setEditLoading(false);
  };

  const handleAIAnalysis = async () => {
    if (!activePortfolioId) return;
    setAiLoading(true);
    setTab('ai');
    try {
      const data = await apiFetch(`/ai/analyze-portfolio/${activePortfolioId}`);
      setAiAnalysis(data);
    } catch (err) { toast.error('AI analysis failed'); }
    setAiLoading(false);
  };

  if (isGuest) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <Shield size={48} className="text-amber-400" />
      <div className="text-center">
        <div className="text-white font-bold text-lg">Portfolio Tracking</div>
        <div className="text-slate-400 text-sm mt-1">Register for a free account to track your portfolio</div>
      </div>
    </div>
  );

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size={32} className="text-emerald-400" /></div>;

  const s = portfolioData?.summary;
  const holdings = portfolioData?.holdings || [];
  const sectorData = analytics?.sector_allocation ?
    Object.entries(analytics.sector_allocation).map(([name, pct]) => ({ name, value: pct })) : [];
  const COLORS = ['#10b981', '#06b6d4', '#8b5cf6', '#f59e0b', '#ef4444', '#ec4899', '#84cc16'];

  return (
    <div className="space-y-5">
      {/* Summary Cards — 4 cards, Returns% shown inside P&L cards */}
      {s && (
        <div className="grid grid-cols-4 gap-4">
          {/* Total Invested */}
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5">
            <div className="text-slate-400 text-xs font-medium mb-2">Total Invested</div>
            <div className="text-white text-xl font-black">{formatCurrency(s.total_invested)}</div>
          </div>
          {/* Current Value */}
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5">
            <div className="text-slate-400 text-xs font-medium mb-2">Current Value</div>
            <div className="text-white text-xl font-black">{formatCurrency(s.total_current_value)}</div>
          </div>
          {/* Day P&L — value + % together */}
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5">
            <div className="text-slate-400 text-xs font-medium mb-2">Day P&amp;L</div>
            <div className={clsx('text-xl font-black', (s.day_pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
              {(s.day_pnl || 0) >= 0 ? '+' : ''}{formatCurrency(s.day_pnl || 0)}
            </div>
            <div className={clsx('text-xs font-semibold mt-1', (s.day_pnl || 0) >= 0 ? 'text-emerald-400/70' : 'text-red-400/70')}>
              {/* day % not separately in summary; just show indicator */}
              {(s.day_pnl || 0) >= 0 ? '▲' : '▼'} Today
            </div>
          </div>
          {/* Total P&L — value + % together */}
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5">
            <div className="text-slate-400 text-xs font-medium mb-2">Total P&amp;L</div>
            <div className={clsx('text-xl font-black', s.total_pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
              {s.total_pnl >= 0 ? '+' : ''}{formatCurrency(s.total_pnl)}
            </div>
            <div className={clsx('text-xs font-semibold mt-1', s.total_pnl_percent >= 0 ? 'text-emerald-400/70' : 'text-red-400/70')}>
              {s.total_pnl_percent >= 0 ? '+' : ''}{formatNum(s.total_pnl_percent)}% returns
            </div>
          </div>
        </div>
      )}

      {/* Tabs + AI button */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1 bg-slate-900 border border-slate-700/50 rounded-xl p-1">
          {['holdings', 'analytics', 'transactions', 'ai'].map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={clsx('px-4 py-2 rounded-lg text-sm font-semibold capitalize transition-all',
                tab === t ? 'bg-emerald-500 text-white' : 'text-slate-400 hover:text-white')}>
              {t === 'ai' ? '✨ AI Analysis' : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
        {holdings.length > 0 && tab !== 'ai' && (
          <button onClick={handleAIAnalysis} disabled={aiLoading}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 rounded-xl text-sm font-semibold hover:bg-indigo-500/30 transition-all disabled:opacity-50">
            {aiLoading ? <Spinner size={14} /> : <Zap size={14} />}
            Analyze Portfolio with AI
          </button>
        )}
      </div>

      {/* Holdings Tab */}
      {tab === 'holdings' && (
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
          {holdings.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-center">
              <Briefcase size={48} className="text-slate-600 mb-3" />
              <div className="text-white font-semibold">No holdings yet</div>
              <div className="text-slate-500 text-sm mt-1">Search for a stock and click "Add to Portfolio"</div>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-9 gap-0 bg-slate-800 px-5 py-3 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                <div className="col-span-2">Stock</div>
                <div>Qty</div>
                <div>Avg Price</div>
                <div>Current</div>
                <div>Value</div>
                <div>Day P&amp;L</div>
                <div>Total P&amp;L</div>
                <div>Actions</div>
              </div>
              <div className="divide-y divide-slate-800">
                {holdings.map(h => (
                  <div key={h.id} className="grid grid-cols-9 gap-0 px-5 py-3.5 hover:bg-slate-800/30 transition-colors items-center">
                    <button onClick={() => onSelectStock(h.symbol)} className="col-span-2 text-left">
                      <div className="text-white font-semibold text-sm">{h.symbol}</div>
                      <div className="text-slate-500 text-xs truncate max-w-[130px]">{h.company_name}</div>
                    </button>
                    <div className="text-slate-300 text-sm">{h.quantity}</div>
                    <div className="text-slate-300 text-sm">{formatCurrency(h.avg_buy_price)}</div>
                    <div className="text-slate-300 text-sm">{formatCurrency(h.current_price)}</div>
                    <div className="text-white font-semibold text-sm">{formatCurrency(h.current_value)}</div>
                    <div className={clsx('text-sm font-semibold', (h.day_pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {(h.day_pnl || 0) >= 0 ? '+' : ''}{formatCurrency(h.day_pnl || 0)}
                      <span className="text-xs opacity-70 block">({(h.change_percent || 0) >= 0 ? '+' : ''}{formatNum(h.change_percent || 0)}%)</span>
                    </div>
                    <div className={clsx('text-sm font-semibold', h.pnl >= 0 ? 'text-emerald-400' : 'text-red-400')}>
                      {h.pnl >= 0 ? '+' : ''}{formatCurrency(h.pnl)}
                      <span className="text-xs opacity-70 block">({h.pnl_percent >= 0 ? '+' : ''}{formatNum(h.pnl_percent)}%)</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setEditHolding({ id: h.id, symbol: h.symbol, qty: h.quantity, price: h.avg_buy_price })}
                        className="p-1.5 rounded-lg bg-slate-700 text-slate-300 hover:bg-emerald-500/20 hover:text-emerald-400 transition-all" title="Edit">
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
                      </button>
                      <button onClick={() => handleRemoveHolding(h.id)}
                        className="p-1.5 rounded-lg bg-slate-700 text-slate-300 hover:bg-red-500/20 hover:text-red-400 transition-all" title="Remove">
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {/* Analytics Tab */}
      {tab === 'analytics' && analytics && (
        <div className="grid grid-cols-2 gap-5">
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5">
            <h3 className="text-white font-bold mb-4">Sector Allocation</h3>
            {sectorData.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={sectorData} cx="50%" cy="50%" outerRadius={90} dataKey="value"
                    label={({ name, value }) => `${name}: ${value}%`} labelLine={true}>
                    {sectorData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={v => [`${v}%`, 'Allocation']} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: '12px' }} />
                </PieChart>
              </ResponsiveContainer>
            ) : <div className="text-slate-500 text-sm text-center py-8">No sector data available</div>}
          </div>
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-5">
            <h3 className="text-white font-bold mb-4">Portfolio Metrics</h3>
            <div className="space-y-3">
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400 text-sm">Total Holdings</span>
                <span className="text-white font-semibold">{analytics.num_holdings}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400 text-sm">Total Value</span>
                <span className="text-white font-semibold">{formatCurrency(analytics.total_value)}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-slate-800">
                <span className="text-slate-400 text-sm">Diversification Score</span>
                <div className="flex items-center gap-2">
                  <div className="w-24 h-2 bg-slate-700 rounded-full overflow-hidden">
                    <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${analytics.diversification_score}%` }} />
                  </div>
                  <span className={clsx('text-sm font-semibold', analytics.diversification_score > 60 ? 'text-emerald-400' : 'text-amber-400')}>
                    {analytics.diversification_score}/100
                  </span>
                </div>
              </div>
              {analytics.holdings_allocation?.map(h => (
                <div key={h.symbol} className="flex justify-between py-2 border-b border-slate-800">
                  <span className="text-slate-400 text-sm">{h.symbol}</span>
                  <div className="flex items-center gap-2">
                    <div className="w-16 h-1.5 bg-slate-700 rounded-full overflow-hidden">
                      <div className="h-full bg-emerald-400 rounded-full" style={{ width: `${Math.min(h.weight, 100)}%` }} />
                    </div>
                    <span className="text-white text-sm font-semibold w-10 text-right">{h.weight}%</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Transactions Tab */}
      {tab === 'transactions' && <TransactionHistory />}

      {/* AI Analysis Tab */}
      {tab === 'ai' && (
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6">
          <div className="flex items-center gap-2 mb-5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 flex items-center justify-center">
              <Zap size={16} className="text-indigo-400" />
            </div>
            <div>
              <div className="text-white font-bold">AI Portfolio Analysis</div>
              <div className="text-slate-500 text-xs">AI-powered analysis</div>
            </div>
          </div>
          {aiLoading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3">
              <Spinner size={32} className="text-indigo-400" />
              <div className="text-slate-400 text-sm">Analyzing your portfolio…</div>
            </div>
          ) : aiAnalysis ? (
            <div>
              <div className="grid grid-cols-3 gap-4 mb-5">
                {[
                  { label: 'Total Invested', val: formatCurrency(aiAnalysis.summary?.total_invested) },
                  { label: 'Current Value', val: formatCurrency(aiAnalysis.summary?.total_current) },
                  {
                    label: 'Total P&L', val: `${(aiAnalysis.summary?.total_pnl || 0) >= 0 ? '+' : ''}${formatCurrency(aiAnalysis.summary?.total_pnl)}`,
                    color: (aiAnalysis.summary?.total_pnl || 0) >= 0 ? 'text-emerald-400' : 'text-red-400'
                  },
                ].map(item => (
                  <div key={item.label} className="bg-slate-800 rounded-xl p-3">
                    <div className="text-slate-500 text-xs mb-1">{item.label}</div>
                    <div className={clsx('font-bold text-base', item.color || 'text-white')}>{item.val}</div>
                  </div>
                ))}
              </div>
              <div className="bg-slate-800/50 rounded-xl p-4">
                <div className="space-y-0.5">
                  {aiAnalysis.analysis.split('\n').map((line, i) => {
                    if (line.startsWith('### ')) return <div key={i} className="font-bold text-white text-sm mt-3 mb-1 border-b border-slate-700/50 pb-1">{line.replace(/^### /, '').replace(/\*\*(.*?)\*\*/g, '$1')}</div>;
                    if (line.startsWith('## ')) return <div key={i} className="font-bold text-emerald-400 text-base mt-3 mb-1">{line.replace(/^## /, '').replace(/\*\*(.*?)\*\*/g, '$1')}</div>;
                    if (line.match(/^\d+\.\s/)) { const num = line.match(/^(\d+)\.\s/)[1]; const raw = line.replace(/^\d+\.\s/, ''); return <div key={i} className="flex items-start gap-2 text-[13px] text-slate-300 leading-relaxed mt-0.5"><span className="text-emerald-400 font-bold flex-shrink-0 min-w-[16px] mt-0.5">{num}.</span><span dangerouslySetInnerHTML={{ __html: raw.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>') }} /></div>; }
                    if (line.match(/^[\-•]\s/)) { const raw = line.replace(/^\s*[\-•]\s/, ''); return <div key={i} className="flex items-start gap-2 text-[13px] text-slate-300 leading-relaxed mt-0.5"><span className="text-emerald-400 flex-shrink-0 mt-0.5">•</span><span dangerouslySetInnerHTML={{ __html: raw.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>') }} /></div>; }
                    if (line.trim() === '') return <div key={i} className="h-1" />;
                    return <p key={i} className="text-[13px] text-slate-300 leading-relaxed" dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>') }} />;
                  })}
                </div>           
              </div>
              <button onClick={handleAIAnalysis}
                className="mt-4 flex items-center gap-2 text-sm text-indigo-400 hover:text-indigo-300 transition-colors">
                <RefreshCw size={13} /> Refresh Analysis
              </button>
            </div>
          ) : (
            <div className="text-center py-12">
              <Zap size={40} className="text-indigo-400/50 mx-auto mb-3" />
              <div className="text-white font-semibold mb-2">Get AI Portfolio Analysis</div>
              <div className="text-slate-400 text-sm mb-5">AI will analyze your holdings, identify risks, suggest improvements, and recommend stocks to add.</div>
              <button onClick={handleAIAnalysis} disabled={holdings.length === 0}
                className="px-6 py-3 bg-indigo-500 text-white font-semibold rounded-xl hover:bg-indigo-400 transition-all disabled:opacity-50 flex items-center gap-2 mx-auto">
                <Zap size={16} /> Analyze My Portfolio
              </button>
              {holdings.length === 0 && <div className="text-slate-500 text-xs mt-3">Add holdings to your portfolio first</div>}
            </div>
          )}
        </div>
      )}

      {/* Edit Holding Modal */}
      {editHolding && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-white font-bold">Edit {editHolding.symbol}</h2>
              <button onClick={() => setEditHolding(null)} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="space-y-4">
              <Input label="Quantity (shares)" type="number" value={editHolding.qty}
                onChange={v => setEditHolding(e => ({ ...e, qty: v }))} />
              <Input label="Avg Buy Price (₹)" type="number" value={editHolding.price}
                onChange={v => setEditHolding(e => ({ ...e, price: v }))} />
              {editHolding.qty && editHolding.price && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-sm">
                  <span className="text-slate-400">New invested value: </span>
                  <span className="text-emerald-400 font-bold">{formatCurrency(parseFloat(editHolding.qty) * parseFloat(editHolding.price))}</span>
                </div>
              )}
              <div className="flex gap-3">
                <button onClick={() => setEditHolding(null)} className="flex-1 py-2.5 border border-slate-600 text-slate-400 rounded-xl hover:bg-slate-800 transition-all text-sm font-semibold">Cancel</button>
                <button onClick={handleEditHolding} disabled={editLoading}
                  className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl hover:bg-emerald-400 transition-all text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                  {editLoading ? <Spinner size={16} /> : <Check size={16} />} Save
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const TransactionHistory = () => {
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/portfolio/transactions').then(d => setTransactions(d.transactions || []))
      .catch(() => { }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center h-24"><Spinner size={24} className="text-emerald-400" /></div>;

  return (
    <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
      {transactions.length === 0 ? (
        <div className="py-12 text-center text-slate-500">No transactions yet</div>
      ) : (
        <div className="divide-y divide-slate-800">
          {transactions.map(t => (
            <div key={t.id} className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                <div className={clsx('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold',
                  t.transaction_type === 'BUY' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400')}>
                  {t.transaction_type === 'BUY' ? 'B' : 'S'}
                </div>
                <div>
                  <div className="text-white font-semibold text-sm">{t.symbol}</div>
                  <div className="text-slate-500 text-xs">{t.transaction_date?.split('T')[0]}</div>
                </div>
              </div>
              <div className="text-right">
                <div className="text-white text-sm">{t.quantity} @ {formatCurrency(t.price)}</div>
                <div className={clsx('text-sm font-semibold', t.transaction_type === 'BUY' ? 'text-emerald-400' : 'text-red-400')}>
                  {t.transaction_type === 'BUY' ? '-' : '+'}{formatCurrency(t.total_amount)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================
// WATCHLIST PAGE
// ============================================================
const WatchlistPage = ({ onSelectStock }) => {
  const { isGuest } = useAuth();
  const toast = useToast();
  const [watchlist, setWatchlist] = useState([]);
  const [quotes, setQuotes] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isGuest) { setLoading(false); return; }
    apiFetch('/watchlist/').then(async d => {
      const wl = d.watchlist || [];
      setWatchlist(wl);
      if (wl.length > 0) {
        const symbols = wl.map(w => w.symbol);
        try {
          const data = await apiFetch('/stocks/batch-quotes', {
            method: 'POST',
            body: JSON.stringify({ symbols })
          });
          setQuotes(data);
        } catch { }
      }
    }).catch(() => toast.error('Failed to load watchlist')).finally(() => setLoading(false));
  }, []);

  const remove = async (symbol) => {
    try {
      await apiFetch(`/watchlist/${symbol}`, { method: 'DELETE' });
      setWatchlist(prev => prev.filter(w => w.symbol !== symbol));
      toast.success('Removed from watchlist');
    } catch { }
  };

  if (isGuest) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <Star size={48} className="text-amber-400" />
      <div className="text-center">
        <div className="text-white font-bold text-lg">Watchlist</div>
        <div className="text-slate-400 text-sm mt-1">Register to save and track your favorite stocks</div>
      </div>
    </div>
  );

  if (loading) return <div className="flex items-center justify-center h-64"><Spinner size={32} className="text-emerald-400" /></div>;

  return (
    <div className="space-y-4">
      {watchlist.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3">
          <Star size={48} className="text-slate-600" />
          <div className="text-white font-semibold">Your watchlist is empty</div>
          <div className="text-slate-400 text-sm">Search for stocks and click the star icon to add them</div>
        </div>
      ) : (
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-8 gap-0 bg-slate-800 px-5 py-3 text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <div className="col-span-2">Stock</div>
            <div>Sector</div>
            <div>Price</div>
            <div>Change</div>
            <div>Day Range</div>
            <div>Mkt Cap</div>
            <div>Action</div>
          </div>
          <div className="divide-y divide-slate-800">
            {watchlist.map(w => {
              const q = quotes[w.symbol];
              const isUp = (q?.change_percent || 0) >= 0;
              const sector = q?.sector && q.sector !== 'N/A' ? q.sector : '—';
              const mktCap = q?.market_cap || 0;
              return (
                <div key={w.symbol} className="grid grid-cols-8 gap-0 px-5 py-3.5 hover:bg-slate-800/30 transition-colors items-center">
                  <button onClick={() => onSelectStock(w.symbol)} className="col-span-2 text-left">
                    <div className="text-white font-semibold text-sm">{w.symbol}</div>
                    <div className="text-slate-500 text-xs truncate">{w.company_name}</div>
                  </button>
                  <div className="text-slate-400 text-xs">
                    {sector !== '—'
                      ? <span className="bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full text-[10px] font-medium">{sector}</span>
                      : '—'}
                  </div>
                  <div className="text-white font-semibold text-sm">{formatCurrency(q?.current_price)}</div>
                  <div className={clsx('flex items-center gap-0.5 text-sm font-semibold', isUp ? 'text-emerald-400' : 'text-red-400')}>
                    {isUp ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                    {isUp ? '+' : ''}{q?.change_percent?.toFixed(2) || '—'}%
                  </div>
                  <div className="text-slate-400 text-xs">
                    {q?.low ? `${formatCurrency(q.low)} - ${formatCurrency(q.high)}` : '—'}
                  </div>
                  <div className="text-slate-400 text-xs">
                    {mktCap >= 10000000000 ? `₹${(mktCap / 10000000).toFixed(0)}Cr`
                      : mktCap >= 100000000 ? `₹${(mktCap / 10000000).toFixed(1)}Cr`
                        : '—'}
                  </div>
                  <div className="flex items-center gap-2">
                    <button onClick={() => onSelectStock(w.symbol)} className="text-emerald-400 hover:text-emerald-300 text-xs font-medium transition-colors">View</button>
                    <button onClick={() => remove(w.symbol)} className="text-red-400 hover:text-red-300 transition-colors"><X size={14} /></button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// AI ASSISTANT PAGE
// ============================================================
const AIAssistantPage = () => {
  const { isGuest } = useAuth();
  const [messages, setMessages] = useState([
    { role: 'assistant', content: `👋 Namaste! I'm BullsEye AI, your Indian stock market analyst!\n\nI can help you with anything related to Indian markets:\n• 📈 Stock Analysis — "Analyze RELIANCE" or "Is TCS a good buy at current price?"\n• 🏦 Market Insights — "What is Bank Nifty?" or "How is FMCG sector doing?"\n• 💼 Portfolio Advice — "How to diversify my Indian stock portfolio?"\n• 🔍 Comparisons — "Compare HDFC Bank vs ICICI Bank"\n• 📚 Education — "Explain P/E ratio" or "What is SEBI?"\n• 💰 Taxation — "How is LTCG taxed in India?"\n\nAsk me anything! I answer all questions about Indian markets.` }
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [sessionId] = useState(() => `sess_${Date.now()}`);
  const bottomRef = useRef(null);
  const inputRef = useRef(null);
  const toast = useToast();

  const suggestions = [
    'Analyze TCS stock — should I buy now?',
    'Compare HDFC Bank vs ICICI Bank fundamentals',
    'What is a good P/E for Indian IT stocks?',
    'How to build a balanced Indian portfolio?',
    'Which sectors are best for 2025?',
    'Explain LTCG tax on Indian stocks',
    'Is Reliance Industries overvalued?',
    'Best mid-cap stocks to invest in India',
  ];

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const send = async (msg) => {
    const text = (msg || input).trim();
    if (!text) return;
    if (isGuest) { toast.error('Register to use AI Assistant'); return; }
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setLoading(true);
    try {
      const data = await apiFetch('/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message: text, session_id: sessionId })
      });
      setMessages(prev => [...prev, { role: 'assistant', content: data.response }]);
    } catch (err) {
      setMessages(prev => [...prev, { role: 'assistant', content: `⚠️ ${err.message || 'Error — please try again.'}` }]);
    }
    setLoading(false);
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  if (isGuest) return (
    <div className="flex flex-col items-center justify-center h-64 gap-4">
      <MessageCircle size={48} className="text-amber-400" />
      <div className="text-center">
        <div className="text-white font-bold text-lg">AI Assistant</div>
        <div className="text-slate-400 text-sm mt-1">Register for free to chat with our AI stock analyst</div>
      </div>
    </div>
  );

  // Markdown → React renderer for AI responses
  const renderMarkdown = (text) => {
    const lines = text.split('\n');
    const elements = [];
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      // H3 ### heading
      if (line.startsWith('### ')) {
        const content = line.replace(/^### /, '').replace(/\*\*(.*?)\*\*/g, '$1');
        elements.push(<div key={i} className="font-bold text-white text-sm mt-3 mb-1 border-b border-slate-700/50 pb-1">{content}</div>);
      }
      // H2 ## heading
      else if (line.startsWith('## ')) {
        const content = line.replace(/^## /, '').replace(/\*\*(.*?)\*\*/g, '$1');
        elements.push(<div key={i} className="font-bold text-emerald-400 text-base mt-3 mb-1">{content}</div>);
      }
      // Bold line starting with **
      else if (line.match(/^\*\*[^*]+\*\*/) && !line.includes('**', line.indexOf('**') + 2)) {
        const content = line.replace(/\*\*(.*?)\*\*/g, '$1');
        elements.push(<div key={i} className="font-bold text-white text-sm mt-2">{content}</div>);
      }
      // Bullet point - or •
      else if (line.match(/^[\-•]\s/) || line.match(/^\s+[\-•]\s/)) {
        const raw = line.replace(/^\s*[\-•]\s/, '');
        elements.push(
          <div key={i} className="flex items-start gap-2 text-[13px] text-slate-300 leading-relaxed mt-0.5">
            <span className="text-emerald-400 flex-shrink-0 mt-0.5">•</span>
            <span dangerouslySetInnerHTML={{ __html: raw.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>') }} />
          </div>
        );
      }
      // Numbered list 1. 2. etc
      else if (line.match(/^\d+\.\s/)) {
        const num = line.match(/^(\d+)\.\s/)[1];
        const raw = line.replace(/^\d+\.\s/, '');
        elements.push(
          <div key={i} className="flex items-start gap-2 text-[13px] text-slate-300 leading-relaxed mt-0.5">
            <span className="text-emerald-400 font-bold flex-shrink-0 min-w-[16px] mt-0.5">{num}.</span>
            <span dangerouslySetInnerHTML={{ __html: raw.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>') }} />
          </div>
        );
      }
      // Horizontal rule ---
      else if (line.match(/^[-=]{3,}$/)) {
        elements.push(<hr key={i} className="border-slate-700/50 my-2" />);
      }
      // Empty line → small gap
      else if (line.trim() === '') {
        elements.push(<div key={i} className="h-1" />);
      }
      // Normal paragraph with possible inline **bold**
      else {
        elements.push(
          <p key={i} className="text-[13px] text-slate-300 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: line.replace(/\*\*(.*?)\*\*/g, '<strong class="text-white">$1</strong>') }} />
        );
      }
      i++;
    }
    return elements;
  };

  return (
    <div className="flex flex-col h-[calc(100vh-80px)]">
      {/* Header */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-4 mb-4 flex items-center gap-3 flex-shrink-0">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center shadow-lg">
          <Zap size={20} className="text-white" />
        </div>
        <div>
          <div className="text-white font-bold">BullsEye AI</div>
          <div className="text-slate-400 text-xs">Indian Stock Market Expert · Always learning</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-emerald-400 text-xs font-medium">Active</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-0">
        {messages.map((msg, i) => (
          <div key={i} className={clsx('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center flex-shrink-0 mr-2 mt-0.5 shadow">
                <Zap size={14} className="text-white" />
              </div>
            )}
            <div className={clsx('max-w-[80%] rounded-2xl px-4 py-3',
              msg.role === 'user'
                ? 'bg-emerald-500 text-white rounded-br-sm text-sm leading-relaxed'
                : 'bg-slate-800 rounded-bl-sm border border-slate-700/80')}>
              {msg.role === 'user'
                ? <span className="text-sm">{msg.content}</span>
                : <div className="space-y-0.5">{renderMarkdown(msg.content)}</div>
              }
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex justify-start">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-indigo-500 to-purple-500 flex items-center justify-center mr-2 shadow">
              <Zap size={14} className="text-white" />
            </div>
            <div className="bg-slate-800 border border-slate-700 rounded-2xl rounded-bl-sm px-4 py-3.5 flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '0ms' }} />
              <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '160ms' }} />
              <div className="w-2 h-2 rounded-full bg-indigo-400 animate-bounce" style={{ animationDelay: '320ms' }} />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Suggestions (only shown initially) */}
      {messages.length === 1 && (
        <div className="flex flex-wrap gap-2 my-3 flex-shrink-0">
          {suggestions.map(s => (
            <button key={s} onClick={() => send(s)}
              className="text-xs bg-slate-800 border border-slate-700 text-slate-300 px-3 py-1.5 rounded-full hover:bg-slate-700 hover:text-white hover:border-slate-600 transition-all">
              {s}
            </button>
          ))}
        </div>
      )}

      {/* Status bar */}
      <div className="flex-shrink-0 mb-3 bg-emerald-500/5 border border-emerald-500/20 rounded-xl px-4 py-2.5 flex items-center gap-2">
        <div className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse flex-shrink-0" />
        <span className="text-emerald-300/80 text-xs font-medium">
          AI Active · Ask anything about Indian stocks, market analysis, or portfolio advice
        </span>
      </div>

      {/* Input */}
      <div className="flex gap-2 flex-shrink-0">
        <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && !e.shiftKey && !loading && send()}
          placeholder="Ask about any Indian stock, market, or investment topic…"
          className="flex-1 bg-slate-900 border border-slate-700 text-white rounded-xl px-4 py-3 text-sm placeholder-slate-500 focus:outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500/30 transition-all" />
        <button onClick={() => send()} disabled={loading || !input.trim()}
          className="px-5 py-3 bg-emerald-500 text-white rounded-xl hover:bg-emerald-400 transition-all disabled:opacity-50 flex items-center gap-2 font-semibold text-sm flex-shrink-0">
          {loading ? <Spinner size={16} /> : <ArrowUpRight size={16} />}
          Send
        </button>
      </div>
    </div>
  );
};

// ============================================================
// PROFILE PAGE
// ============================================================
const ProfilePage = () => {
  const { user, isGuest, updateUser, logout } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ full_name: user?.full_name || '', phone: user?.phone || '', risk_profile: user?.risk_profile || 'moderate', investment_goal: user?.investment_goal || '' });
  const [pwdForm, setPwdForm] = useState({ old_password: '', new_password: '' });
  const [saving, setSaving] = useState(false);

  const saveProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const data = await apiFetch('/auth/update-profile', { method: 'PUT', body: JSON.stringify(form) });
      updateUser(data.user);
      toast.success('Profile updated!');
    } catch (err) { toast.error(err.message); }
    setSaving(false);
  };

  const changePassword = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await apiFetch('/auth/change-password', { method: 'PUT', body: JSON.stringify(pwdForm) });
      toast.success('Password changed!');
      setPwdForm({ old_password: '', new_password: '' });
    } catch (err) { toast.error(err.message); }
    setSaving(false);
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* Profile Header */}
      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6 flex items-center gap-4">
        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-emerald-500/20">
          {user?.full_name?.[0] || user?.username?.[0] || 'U'}
        </div>
        <div>
          <div className="text-white font-bold text-xl">{user?.full_name || user?.username}</div>
          <div className="text-slate-400 text-sm">{user?.email}</div>
          <div className="flex items-center gap-2 mt-1">
            <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium',
              isGuest ? 'bg-amber-500/20 text-amber-400' : 'bg-emerald-500/20 text-emerald-400')}>
              {isGuest ? 'Guest' : 'Member'}
            </span>
            <span className="bg-indigo-500/20 text-indigo-400 text-xs px-2 py-0.5 rounded-full font-medium capitalize">{user?.risk_profile}</span>
          </div>
        </div>
      </div>

      {!isGuest && (
        <>
          {/* Edit Profile */}
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6">
            <h3 className="text-white font-bold mb-4">Edit Profile</h3>
            <form onSubmit={saveProfile} className="space-y-4">
              <Input label="Full Name" value={form.full_name} onChange={v => setForm(f => ({ ...f, full_name: v }))} />
              <Input label="Phone" value={form.phone} onChange={v => setForm(f => ({ ...f, phone: v }))} placeholder="+91 98765 43210" />
              <Input label="Investment Goal" value={form.investment_goal} onChange={v => setForm(f => ({ ...f, investment_goal: v }))} placeholder="e.g. Retirement in 2040" />
              <div>
                <label className="block text-xs text-slate-400 mb-1.5">Risk Profile</label>
                <div className="grid grid-cols-3 gap-2">
                  {['conservative', 'moderate', 'aggressive'].map(r => (
                    <button key={r} type="button" onClick={() => setForm(f => ({ ...f, risk_profile: r }))}
                      className={clsx('py-2 rounded-lg text-xs font-semibold capitalize border transition-all',
                        form.risk_profile === r ? 'bg-emerald-500/20 border-emerald-500 text-emerald-400' : 'border-slate-600 text-slate-400 hover:border-slate-500')}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
              <button type="submit" disabled={saving} className="px-6 py-2.5 bg-emerald-500 text-white font-semibold rounded-xl hover:bg-emerald-400 transition-all flex items-center gap-2 disabled:opacity-50">
                {saving ? <Spinner size={16} /> : <Check size={16} />} Save Changes
              </button>
            </form>
          </div>

          {/* Change Password */}
          <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-6">
            <h3 className="text-white font-bold mb-4">Change Password</h3>
            <form onSubmit={changePassword} className="space-y-4">
              <Input label="Current Password" type="password" value={pwdForm.old_password} onChange={v => setPwdForm(f => ({ ...f, old_password: v }))} autoComplete="current-password" required />
              <Input label="New Password" type="password" value={pwdForm.new_password} onChange={v => setPwdForm(f => ({ ...f, new_password: v }))} autoComplete="new-password" placeholder="Min 6 characters" required />
              <button type="submit" disabled={saving} className="px-6 py-2.5 bg-indigo-500 text-white font-semibold rounded-xl hover:bg-indigo-400 transition-all disabled:opacity-50 flex items-center gap-2">
                {saving ? <Spinner size={16} /> : <Shield size={16} />} Update Password
              </button>
            </form>
          </div>
        </>
      )}

      {/* Danger Zone */}
      <div className="bg-red-500/5 border border-red-500/20 rounded-2xl p-6">
        <h3 className="text-red-400 font-bold mb-3">Sign Out</h3>
        <p className="text-slate-400 text-sm mb-4">You'll be logged out of your account.</p>
        <button onClick={logout} className="px-6 py-2.5 bg-red-500/20 border border-red-500/30 text-red-400 font-semibold rounded-xl hover:bg-red-500/30 transition-all flex items-center gap-2">
          <LogOut size={16} /> Sign Out
        </button>
      </div>
    </div>
  );
};

// ============================================================
// STOCKS PAGE — price, change, sector, quick actions
// ============================================================
const StocksPage = ({ onSelectStock }) => {
  const { isGuest } = useAuth();
  const toast = useToast();
  const [allStocks, setAllStocks] = useState([]);
  const [quotes, setQuotes] = useState({});
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [portfolioId, setPortfolioId] = useState(null);
  const [actionStock, setActionStock] = useState(null); // {symbol, action: 'watchlist'|'portfolio'}

  // Sector colours
  const sectorColour = {
    IT: 'bg-cyan-500/15 text-cyan-400',
    Banking: 'bg-blue-500/15 text-blue-400',
    Finance: 'bg-indigo-500/15 text-indigo-400',
    Pharma: 'bg-green-500/15 text-green-400',
    Healthcare: 'bg-emerald-500/15 text-emerald-400',
    Auto: 'bg-orange-500/15 text-orange-400',
    Energy: 'bg-yellow-500/15 text-yellow-400',
    FMCG: 'bg-pink-500/15 text-pink-400',
    Metals: 'bg-slate-400/15 text-slate-300',
    Chemicals: 'bg-purple-500/15 text-purple-400',
    Infra: 'bg-amber-500/15 text-amber-400',
    Defense: 'bg-red-500/15 text-red-400',
    Telecom: 'bg-teal-500/15 text-teal-400',
    Logistics: 'bg-lime-500/15 text-lime-400',
    'Real Estate': 'bg-rose-500/15 text-rose-400',
    Consumer: 'bg-fuchsia-500/15 text-fuchsia-400',
    Media: 'bg-violet-500/15 text-violet-400',
  };

  // Hardcoded sector map (same as backend STOCK_SECTOR)
  const SECTOR = {
    TCS: 'IT', INFY: 'IT', WIPRO: 'IT', HCLTECH: 'IT', TECHM: 'IT', PERSISTENT: 'IT', MPHASIS: 'IT', LTIM: 'IT', LTTS: 'IT', OFSS: 'IT', KPITTECH: 'IT', HAPPSTMNDS: 'IT',
    HDFCBANK: 'Banking', ICICIBANK: 'Banking', SBIN: 'Banking', KOTAKBANK: 'Banking', AXISBANK: 'Banking', INDUSINDBK: 'Banking', BANKBARODA: 'Banking', PNB: 'Banking', CANBK: 'Banking', FEDERALBNK: 'Banking', BANDHANBNK: 'Banking', IDFCFIRSTB: 'Banking', UNIONBANK: 'Banking', AUBANK: 'Banking',
    BAJFINANCE: 'Finance', BAJAJFINSV: 'Finance', HDFCAMC: 'Finance', CHOLAFIN: 'Finance', SBICARD: 'Finance', PFC: 'Finance', RECLTD: 'Finance', LICHSGFIN: 'Finance', SBILIFE: 'Finance', HDFCLIFE: 'Finance', ICICIGI: 'Finance', ICICIPRULI: 'Finance', CDSL: 'Finance', JIOFIN: 'Finance', IRFC: 'Finance', LICI: 'Finance', ABCAPITAL: 'Finance', SHRIRAMFIN: 'Finance', PAYTM: 'Finance', POLICYBZR: 'Finance',
    SUNPHARMA: 'Pharma', DRREDDY: 'Pharma', CIPLA: 'Pharma', DIVISLAB: 'Pharma', LUPIN: 'Pharma', BIOCON: 'Pharma', TORNTPHARM: 'Pharma', APOLLOHOSP: 'Healthcare', FORTIS: 'Healthcare',
    MARUTI: 'Auto', TATAMOTORS: 'Auto', MM: 'Auto', 'BAJAJ-AUTO': 'Auto', HEROMOTOCO: 'Auto', EICHERMOT: 'Auto', TVSMOTOR: 'Auto', BOSCHLTD: 'Auto', MOTHERSON: 'Auto', MRF: 'Auto', TIINDIA: 'Auto', SCHAEFFLER: 'Auto',
    RELIANCE: 'Energy', ONGC: 'Energy', BPCL: 'Energy', IOC: 'Energy', GAIL: 'Energy', PETRONET: 'Energy', COALINDIA: 'Energy', NTPC: 'Energy', POWERGRID: 'Energy', TATAPOWER: 'Energy', ADANIGREEN: 'Energy', NHPC: 'Energy', SJVN: 'Energy', TORNTPOWER: 'Energy', CESC: 'Energy', IREDA: 'Energy', IEX: 'Energy',
    HINDUNILVR: 'FMCG', ITC: 'FMCG', NESTLEIND: 'FMCG', DABUR: 'FMCG', MARICO: 'FMCG', COLPAL: 'FMCG', BRITANNIA: 'FMCG', GODREJCP: 'FMCG', TATACONSUM: 'FMCG',
    TATASTEEL: 'Metals', JSWSTEEL: 'Metals', HINDALCO: 'Metals', VEDL: 'Metals', SAIL: 'Metals', NMDC: 'Metals', APLAPOLLO: 'Metals', JINDALSTEL: 'Metals',
    PIDILITIND: 'Chemicals', DEEPAKNTR: 'Chemicals', NAVINFLUOR: 'Chemicals', SRF: 'Chemicals', PIIND: 'Chemicals', UPL: 'Chemicals', SOLARINDS: 'Chemicals',
    LT: 'Infra', ULTRACEMCO: 'Infra', GRASIM: 'Infra', AMBUJACEM: 'Infra', HAL: 'Defense', BEL: 'Defense', CONCOR: 'Logistics', RVNL: 'Infra', RAILTEL: 'Infra', IRCTC: 'Logistics', POLYCAB: 'Infra', CGPOWER: 'Infra', THERMAX: 'Infra', CUMMINSIND: 'Infra',
    TITAN: 'Consumer', TRENT: 'Consumer', DMART: 'Consumer', PAGEIND: 'Consumer', VOLTAS: 'Consumer', HAVELLS: 'Consumer', JUBLFOOD: 'Consumer', NYKAA: 'Consumer', ZOMATO: 'Consumer',
    DLF: 'Real Estate', GODREJPROP: 'Real Estate', OBEROIRLTY: 'Real Estate',
    BHARTIARTL: 'Telecom', TATACOMM: 'Telecom', HFCL: 'Telecom',
    SUNTV: 'Media', ZEEL: 'Media', PVRINOX: 'Media',
    INDIGO: 'Logistics', DELHIVERY: 'Logistics',
    DIXON: 'Technology', KAYNES: 'Technology', NAUKRI: 'Technology', TATAELXSI: 'Technology',
  };

  useEffect(() => {
    apiFetch('/stocks/list').then(d => {
      setAllStocks(d.stocks || []);
      setLoading(false);
      const top30 = (d.stocks || []).slice(0, 30).map(s => s.symbol);
      if (top30.length) {
        setQuotesLoading(true);
        apiFetch('/stocks/batch-quotes', { method: 'POST', body: JSON.stringify({ symbols: top30 }) })
          .then(q => setQuotes(q)).catch(() => { }).finally(() => setQuotesLoading(false));
      }
    }).catch(() => setLoading(false));

    if (!isGuest) {
      apiFetch('/portfolio/').then(d => {
        if (d.portfolios?.length > 0) setPortfolioId(d.portfolios[0].id);
      }).catch(() => { });
    }
  }, []);

  const quickWatchlist = async (e, symbol, company_name) => {
    e.stopPropagation();
    if (isGuest) { toast.error('Register to use watchlist'); return; }
    try {
      await apiFetch('/watchlist/', { method: 'POST', body: JSON.stringify({ symbol, company_name }) });
      toast.success(`${symbol} added to watchlist`);
    } catch (err) { toast.error(err.message); }
  };

  const quickPortfolio = async (e, symbol, company_name) => {
    e.stopPropagation();
    if (isGuest) { toast.error('Register to use portfolio'); return; }
    setActionStock({ symbol, company_name });
  };

  const [buyForm, setBuyForm] = useState({ qty: '', price: '' });
  const [buyLoading, setBuyLoading] = useState(false);

  const handleQuickBuy = async () => {
    if (!buyForm.qty || !buyForm.price || !portfolioId) { toast.error('Fill quantity and price'); return; }
    setBuyLoading(true);
    try {
      await apiFetch(`/portfolio/${portfolioId}/holding`, {
        method: 'POST',
        body: JSON.stringify({ symbol: actionStock.symbol, company_name: actionStock.company_name, quantity: parseFloat(buyForm.qty), price: parseFloat(buyForm.price), exchange: 'NSE' })
      });
      toast.success(`${actionStock.symbol} added to portfolio`);
      setActionStock(null);
      setBuyForm({ qty: '', price: '' });
    } catch (err) { toast.error(err.message); }
    setBuyLoading(false);
  };

  const filtered = allStocks.filter(s =>
    !search ||
    s.symbol.toLowerCase().includes(search.toLowerCase()) ||
    s.company_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-4">
        <div className="flex-1 flex items-center gap-2 bg-slate-900 border border-slate-700 rounded-xl px-4 py-2.5">
          <Search size={16} className="text-slate-400" />
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="Search all Indian stocks by name or symbol..."
            className="bg-transparent text-white text-sm outline-none flex-1 placeholder-slate-500" />
          {search && <button onClick={() => setSearch('')}><X size={14} className="text-slate-500" /></button>}
        </div>
        <div className="text-slate-400 text-sm">{filtered.length} stocks</div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-48"><Spinner size={28} className="text-emerald-400" /></div>
      ) : (
        <div className="bg-slate-900 border border-slate-700/50 rounded-2xl overflow-hidden">
          <div className="grid grid-cols-6 gap-0 bg-slate-800 px-5 py-3 text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <div className="col-span-2">Symbol / Company</div>
            <div>Sector</div>
            <div>Price</div>
            <div>Day Change</div>
            <div>Quick Add</div>
          </div>
          <div className="divide-y divide-slate-800 max-h-[640px] overflow-y-auto">
            {filtered.map(s => {
              const q = quotes[s.symbol];
              const isUp = (q?.change_percent || 0) >= 0;
              const sector = SECTOR[s.symbol] || '—';
              const sColour = sectorColour[sector] || 'bg-slate-700/40 text-slate-400';
              return (
                <div key={s.symbol} className="grid grid-cols-6 gap-0 px-5 py-3 hover:bg-slate-800/50 transition-colors items-center group">
                  {/* Symbol + Company */}
                  <button onClick={() => onSelectStock(s.symbol)} className="col-span-2 text-left">
                    <div className="text-white font-semibold text-sm group-hover:text-emerald-400 transition-colors">{s.symbol}</div>
                    <div className="text-slate-500 text-xs truncate max-w-[180px]">{s.company_name}</div>
                  </button>
                  {/* Sector badge */}
                  <div>
                    {sector !== '—'
                      ? <span className={clsx('text-[10px] font-semibold px-2 py-0.5 rounded-full', sColour)}>{sector}</span>
                      : <span className="text-slate-600 text-xs">—</span>}
                  </div>
                  {/* Price */}
                  <div className="text-white text-sm font-semibold">
                    {q?.current_price ? formatCurrency(q.current_price)
                      : (quotesLoading ? <Spinner size={12} className="text-slate-500" /> : '—')}
                  </div>
                  {/* Day Change */}
                  <div className={clsx('flex items-center gap-0.5 text-sm font-semibold',
                    !q ? 'text-slate-500' : isUp ? 'text-emerald-400' : 'text-red-400')}>
                    {q ? (<>{isUp ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}{isUp ? '+' : ''}{(q.change_percent || 0).toFixed(2)}%</>) : '—'}
                  </div>
                  {/* Quick Add buttons */}
                  <div className="flex items-center gap-1.5">
                    <button title="Add to Watchlist" onClick={e => quickWatchlist(e, s.symbol, s.company_name)}
                      className="p-1.5 rounded-lg bg-slate-700/50 text-amber-400 hover:bg-amber-500/20 hover:text-amber-300 transition-all">
                      <Star size={13} fill="none" />
                    </button>
                    <button title="Add to Portfolio" onClick={e => quickPortfolio(e, s.symbol, s.company_name)}
                      className="p-1.5 rounded-lg bg-slate-700/50 text-emerald-400 hover:bg-emerald-500/20 hover:text-emerald-300 transition-all">
                      <Briefcase size={13} />
                    </button>
                    <button onClick={() => onSelectStock(s.symbol)}
                      className="p-1.5 rounded-lg bg-slate-700/50 text-slate-400 hover:bg-slate-600 hover:text-white transition-all">
                      <ChevronRight size={13} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Quick Portfolio Add Modal */}
      {actionStock && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl p-6 w-full max-w-sm shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <div>
                <h2 className="text-white font-bold">Add to Portfolio</h2>
                <p className="text-slate-400 text-sm">{actionStock.symbol} · {actionStock.company_name}</p>
              </div>
              <button onClick={() => { setActionStock(null); setBuyForm({ qty: '', price: '' }); }} className="text-slate-400 hover:text-white"><X size={20} /></button>
            </div>
            <div className="space-y-3">
              <Input label="Quantity (shares)" type="number" value={buyForm.qty} onChange={v => setBuyForm(f => ({ ...f, qty: v }))} placeholder="e.g. 10" />
              <Input label="Buy Price (₹)" type="number" value={buyForm.price}
                onChange={v => setBuyForm(f => ({ ...f, price: v }))}
                placeholder={quotes[actionStock.symbol]?.current_price ? `Current: ₹${quotes[actionStock.symbol].current_price}` : 'Enter price'} />
              {buyForm.qty && buyForm.price && (
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-3 py-2 text-sm">
                  <span className="text-slate-400">Total: </span>
                  <span className="text-emerald-400 font-bold">{formatCurrency(parseFloat(buyForm.qty) * parseFloat(buyForm.price))}</span>
                </div>
              )}
              <div className="flex gap-3 mt-2">
                <button onClick={() => { setActionStock(null); setBuyForm({ qty: '', price: '' }); }}
                  className="flex-1 py-2.5 border border-slate-600 text-slate-400 rounded-xl hover:bg-slate-800 text-sm font-semibold">Cancel</button>
                <button onClick={handleQuickBuy} disabled={buyLoading}
                  className="flex-1 py-2.5 bg-emerald-500 text-white rounded-xl hover:bg-emerald-400 text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-50">
                  {buyLoading ? <Spinner size={14} /> : <Plus size={14} />} Add
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ============================================================
// MAIN APP
// ============================================================
const PAGE_TITLES = {
  dashboard: 'Dashboard',
  stocks: 'All Stocks',
  portfolio: 'My Portfolio',
  watchlist: 'Watchlist',
  ai: 'AI Assistant',
  profile: 'Profile & Settings',
};

// Auto-triggers guest login then redirects
const GuestRedirect = ({ onBack }) => {
  const { guestLogin } = useAuth();
  const toast = useToast();
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (done) return;
    setDone(true);
    guestLogin().then(() => toast.info('Browsing as guest')).catch(e => toast.error(e.message));
  }, []);
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Spinner size={32} className="text-emerald-400" />
        <div className="text-white">Loading guest access…</div>
        <button onClick={onBack} className="text-slate-400 hover:text-white text-sm mt-2">← Back to home</button>
      </div>
    </div>
  );
};

// ============================================================
// EMAIL VERIFICATION PAGE
// ============================================================
const EmailVerificationPage = ({ token }) => {
  const [status, setStatus] = useState('verifying'); // 'verifying' | 'success' | 'error'
  const [message, setMessage] = useState('');
  const [errorData, setErrorData] = useState(null);
  const { updateUser } = useAuth();

  useEffect(() => {
    apiFetch('/auth/verify-email', {
      method: 'POST',
      body: JSON.stringify({ token }),
    })
      .then(data => {
        setStatus('success');
        setMessage(data.message || 'Email verified!');
        // Auto-login: store the token & user, then redirect to the app
        if (data.token && data.user) {
          localStorage.setItem('bullseye_token', data.token);
          localStorage.setItem('bullseye_user', JSON.stringify(data.user));
          updateUser(data.user);
        }
        // Short pause so user sees the success message, then go to app
        setTimeout(() => {
          window.history.replaceState({}, document.title, '/');
          window.location.reload();
        }, 2000);
      })
      .catch(err => {
        setStatus('error');
        setMessage(err.message || 'Verification failed. The link may have expired.');
        setErrorData(err.data || null);
      });
  }, [token]);

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700/50 rounded-2xl p-8 w-full max-w-md text-center shadow-2xl">
        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center mx-auto mb-5 shadow-lg shadow-emerald-500/30">
          <TrendingUp size={26} className="text-white" />
        </div>
        <div className="text-white font-black text-2xl mb-1">BullsEye</div>
        <div className="text-slate-400 text-sm mb-7">Email Verification</div>

        {status === 'verifying' && (
          <>
            <Spinner size={32} className="text-emerald-400 mx-auto mb-3" />
            <div className="text-slate-300 text-sm">Verifying your email address…</div>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-14 h-14 rounded-full bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center mx-auto mb-4">
              <Check size={28} className="text-emerald-400" />
            </div>
            <div className="text-white font-bold text-xl mb-2">Email Verified! 🎉</div>
            <div className="text-slate-400 text-sm mb-4 leading-relaxed">{message}</div>
            <div className="text-slate-500 text-xs">Signing you in automatically…</div>
            <Spinner size={20} className="text-emerald-400 mx-auto mt-3" />
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-14 h-14 rounded-full bg-red-500/20 border border-red-500/30 flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={28} className="text-red-400" />
            </div>
            <div className="text-white font-bold text-xl mb-2">
              {errorData?.expired ? 'Link Expired' : 'Link Already Used'}
            </div>
            <div className="text-slate-400 text-sm mb-6 leading-relaxed">{message}</div>
            {errorData?.expired && errorData?.email ? (
              /* Expired token — offer to resend */
              <ResendFromError email={errorData.email} />
            ) : (
              /* Already used — just go sign in */
              <button
                onClick={() => window.location.href = '/'}
                className="w-full py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-bold rounded-xl hover:from-emerald-400 hover:to-cyan-400 transition-all shadow-lg shadow-emerald-500/25"
              >
                Sign In
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

/* Inline resend widget used by EmailVerificationPage when token is expired */
const ResendFromError = ({ email }) => {
  const toast = useToast();
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const handle = async () => {
    setLoading(true);
    try {
      await apiFetch('/auth/resend-verification', { method: 'POST', body: JSON.stringify({ email }) });
      setSent(true);
      toast.success('New verification email sent!');
    } catch (err) {
      toast.error(err.message || 'Failed to resend');
    } finally {
      setLoading(false);
    }
  };
  if (sent) return (
    <div className="text-emerald-400 font-semibold text-sm">
      ✅ New link sent to {email} — check your inbox!
    </div>
  );
  return (
    <button onClick={handle} disabled={loading}
      className="w-full py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-white font-bold rounded-xl hover:from-emerald-400 hover:to-cyan-400 transition-all disabled:opacity-50 flex items-center justify-center gap-2">
      {loading && <Spinner size={16} />}
      🔄 Send New Verification Email
    </button>
  );
};

const AppContent = () => {
  const { user, loading, guestLogin } = useAuth();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState('dashboard');
  const [selectedStock, setSelectedStock] = useState(null);
  const [prevTab, setPrevTab] = useState('dashboard');
  // 'landing' | 'login' | 'register' — no 'guest' state needed anymore
  const [authView, setAuthView] = useState('landing');
  const [guestLoading, setGuestLoading] = useState(false);

  const handleGuestLogin = async () => {
    setGuestLoading(true);
    try {
      await guestLogin();
      toast.info('Browsing as guest');
    } catch (err) {
      toast.error(err.message || 'Failed to load guest access');
    } finally {
      setGuestLoading(false);
    }
  };

  if (loading) return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shadow-lg shadow-emerald-500/30 animate-pulse">
          <TrendingUp size={24} className="text-white" />
        </div>
        <div className="text-white font-bold text-lg">BullsEye</div>
        <Spinner size={24} className="text-emerald-400" />
      </div>
    </div>
  );

  // Not logged in — show landing or auth form
  if (!user) {
    if (authView === 'landing') {
      if (guestLoading) {
        return (
          <div className="min-h-screen bg-slate-950 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <Spinner size={32} className="text-emerald-400" />
              <div className="text-white text-sm">Loading guest access…</div>
            </div>
          </div>
        );
      }
      return (
        <LandingPage
          onLogin={() => setAuthView('login')}
          onRegister={() => setAuthView('register')}
          onGuest={handleGuestLogin}
        />
      );
    }
    return (
      <AuthPage
        initialMode={authView === 'register' ? 'register' : 'login'}
        onBack={() => setAuthView('landing')}
      />
    );
  }

  const handleSelectStock = (symbol) => {
    setPrevTab(activeTab);
    setSelectedStock(symbol);
    setActiveTab('stockDetail');
  };

  const handleNavigation = (tab) => {
    setActiveTab(tab);
    if (tab !== 'stockDetail') setSelectedStock(null);
  };

  const renderPage = () => {
    if (activeTab === 'stockDetail' && selectedStock) {
      return <StockDetail symbol={selectedStock} onBack={() => handleNavigation(prevTab || 'stocks')} />;
    }
    switch (activeTab) {
      case 'dashboard': return <Dashboard onSelectStock={handleSelectStock} />;
      case 'stocks': return <StocksPage onSelectStock={handleSelectStock} />;
      case 'portfolio': return <PortfolioPage onSelectStock={handleSelectStock} />;
      case 'watchlist': return <WatchlistPage onSelectStock={handleSelectStock} />;
      case 'ai': return <AIAssistantPage />;
      case 'profile': return <ProfilePage />;
      default: return <Dashboard onSelectStock={handleSelectStock} />;
    }
  };

  const title = activeTab === 'stockDetail'
    ? `${selectedStock} - Stock Details`
    : (PAGE_TITLES[activeTab] || '');

  return (
    <div className="flex bg-slate-950 min-h-screen">
      <Sidebar activeTab={activeTab} setActiveTab={handleNavigation} />
      <div className="flex-1 ml-64 flex flex-col min-h-screen">
        <Header title={title} onSearch={r => handleSelectStock(r.symbol)} />
        <main className="flex-1 p-6 overflow-auto">
          {renderPage()}
        </main>
      </div>
    </div>
  );
};

// ============================================================
// ROOT
// ============================================================
export default function App() {
  const urlParams = new URLSearchParams(window.location.search);
  const verifyToken = urlParams.get('token');
  const isVerifyPath = window.location.pathname === '/verify-email';

  if (isVerifyPath && verifyToken) {
    return (
      <ThemeProvider>
        <ToastProvider>
          <style>{`
            * { box-sizing: border-box; }
            body { margin: 0; background: #020617; }
            [data-theme="light"] body { background: #f8fafc; }
          `}</style>
          <EmailVerificationPage token={verifyToken} />
        </ToastProvider>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <AuthProvider>
        <ToastProvider>
          <style>{`
          * { box-sizing: border-box; }
          body { margin: 0; background: #020617; transition: background 0.2s; }
          @keyframes slide-up {
            from { opacity: 0; transform: translateY(20px); }
            to { opacity: 1; transform: translateY(0); }
          }
          .animate-slide-up { animation: slide-up 0.3s ease-out; }
          ::-webkit-scrollbar { width: 6px; height: 6px; }
          ::-webkit-scrollbar-track { background: #0f172a; }
          ::-webkit-scrollbar-thumb { background: #334155; border-radius: 3px; }
          ::-webkit-scrollbar-thumb:hover { background: #475569; }

          /* ─── LIGHT THEME ─── */
          [data-theme="light"] body { background: #eef2f7 !important; }
          [data-theme="light"] ::-webkit-scrollbar-track { background: #e2e8f0; }
          [data-theme="light"] ::-webkit-scrollbar-thumb { background: #94a3b8; }

          /* Backgrounds — slate-950/900 → white, slate-800 → light gray, slate-700 → border gray */
          [data-theme="light"] .bg-slate-950 { background-color: #ffffff !important; }
          [data-theme="light"] .bg-slate-900 { background-color: #ffffff !important; }
          [data-theme="light"] .bg-slate-900\\/80 { background-color: rgba(255,255,255,0.95) !important; }  [data-theme="light"] .bg-slate-800 { background-color: #f1f5f9 !important; }
          [data-theme="light"] .bg-slate-700 { background-color: #e2e8f0 !important; }
          [data-theme="light"] .bg-slate-700\/50 { background-color: rgba(226,232,240,0.6) !important; }

          /* Borders */
          [data-theme="light"] .border-slate-800 { border-color: #e2e8f0 !important; }
          [data-theme="light"] .border-slate-700 { border-color: #e2e8f0 !important; }
          [data-theme="light"] .border-slate-700\/50 { border-color: rgba(226,232,240,0.9) !important; }
          [data-theme="light"] .border-slate-600 { border-color: #cbd5e1 !important; }

          /* Text */
          [data-theme="light"] .text-white { color: #1e293b !important; }
          [data-theme="light"] .text-slate-300 { color: #334155 !important; }
          [data-theme="light"] .text-slate-400 { color: #475569 !important; }
          [data-theme="light"] .text-slate-500 { color: #94a3b8 !important; }

          /* Hover states */
          [data-theme="light"] .hover\\:bg-slate-800:hover { background-color: #f1f5f9 !important; }
          [data-theme="light"] .hover\\:bg-slate-700:hover { background-color: #e2e8f0 !important; }
          [data-theme="light"] .hover\\:text-white:hover { color: #0f172a !important; }

          /* Inputs and textareas */
          [data-theme="light"] input { color: #1e293b !important; }
          [data-theme="light"] input::placeholder { color: #94a3b8 !important; }
          [data-theme="light"] textarea { color: #1e293b !important; }
          [data-theme="light"] .placeholder-slate-500::placeholder { color: #94a3b8 !important; }

          /* Card depth — subtle shadow so white cards lift off the gray page */
          [data-theme="light"] .border.rounded-xl,
          [data-theme="light"] .border.rounded-2xl,
          [data-theme="light"] .border.rounded-3xl {
            box-shadow: 0 1px 4px rgba(0,0,0,0.07), 0 0 0 1px rgba(0,0,0,0.04);
          }
        `}</style>
          <AppContent />
        </ToastProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

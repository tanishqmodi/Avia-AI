import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Lock, User, AlertTriangle, Eye, EyeOff, Radar, Activity, Cpu, Radio } from 'lucide-react';
import { api } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';
import { Button } from '../components/ui/Button';

type LocationState = { from?: { pathname?: string } } | null;

const highlights = [
  { icon: Radar, title: 'Real-time airspace awareness', body: 'Live sensor grid across runway and perimeter zones.' },
  { icon: Cpu, title: 'YOLOv8 & RT-DETR', body: 'Switch engines per sensor. Tune thresholds globally.' },
  { icon: Activity, title: 'Alerting & forensics', body: 'Severity-ranked events, filterable logs, CSV export.' },
];

export default function Login() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const navigate = useNavigate();
  const location = useLocation();
  const token = useAuthStore(state => state.token);
  const setAuth = useAuthStore(state => state.setAuth);

  const redirectTo = (location.state as LocationState)?.from?.pathname || '/';

  useEffect(() => {
    if (token) navigate(redirectTo, { replace: true });
  }, [token, redirectTo, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const data = await api.login(username, password);
      setAuth(data.access_token, data.user);
      navigate(redirectTo, { replace: true });
    } catch (err: any) {
      setError(err.message || 'Authentication failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGoogleSimulate = async () => {
    setIsSubmitting(true);
    setError(null);
    try {
      const mockGoogleId = 'google_user_' + Math.floor(Math.random() * 10000);
      const data = await api.googleAuth('pilot@aviaai.com', 'Test Pilot', mockGoogleId);
      setAuth(data.access_token, data.user);
      navigate(redirectTo, { replace: true });
    } catch (err: any) {
      setError(err.message || 'Google Auth failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const inputCls =
    'w-full bg-black/40 border border-white/10 rounded-lg h-11 pl-10 pr-3 text-sm text-white placeholder:text-white/30 focus:border-cyan-400/50 focus:bg-black/60 outline-none transition-colors disabled:opacity-50';

  return (
    <div className="w-screen h-screen app-bg relative overflow-hidden text-white flex">
      <div className="absolute inset-0 grid-overlay opacity-60 pointer-events-none" aria-hidden="true" />

      {/* Left brand panel */}
      <aside className="hidden lg:flex flex-col justify-between relative w-[46%] min-w-[480px] p-12 border-r border-white/5 overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -top-40 -left-40 w-[520px] h-[520px] rounded-full bg-cyan-500/10 blur-[120px]" />
          <div className="absolute -bottom-40 -right-20 w-[420px] h-[420px] rounded-full bg-blue-500/10 blur-[120px]" />
        </div>

        {/* LogoChange: desktop brand lockup uses the full Avia AI logo */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative"
        >
          <img
            src="/logo-avia.png"
            alt="Avia AI — Intelligent Aviation Systems"
            className="h-36 xl:h-40 w-auto select-none pointer-events-none drop-shadow-[0_0_28px_rgba(34,211,238,0.28)]"
            draggable={false}
          />
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
          className="relative max-w-lg"
        >
          <div className="label-kicker mb-4 flex items-center gap-2">
            <Radio size={12} className="text-cyan-300" />
            <span>Command Center</span>
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse ml-1" />
            <span className="text-emerald-300 normal-case tracking-normal">Online</span>
          </div>
          <h1 className="text-4xl xl:text-5xl font-semibold leading-[1.1] tracking-tight mb-4">
            Detect. Track. <span className="bg-gradient-to-r from-cyan-300 to-blue-400 bg-clip-text text-transparent">Protect the skies.</span>
          </h1>
          <p className="text-sm text-white/55 leading-relaxed">
            An end-to-end bird monitoring platform for airfields. Sign in to access the live sensor grid, runway watch, and alert forensics.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.5, delay: 0.25 }}
          className="relative flex flex-col gap-3"
        >
          {highlights.map((h, i) => (
            <motion.div
              key={h.title}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.35 + i * 0.08 }}
              className="flex items-start gap-3 p-3 rounded-xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-sm"
            >
              <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-400/20 flex items-center justify-center text-cyan-300 flex-shrink-0">
                <h.icon size={14} />
              </div>
              <div className="min-w-0">
                <div className="text-xs font-medium text-white/90">{h.title}</div>
                <div className="text-[11px] text-white/45 leading-relaxed mt-0.5">{h.body}</div>
              </div>
            </motion.div>
          ))}
        </motion.div>
      </aside>

      {/* Right form panel */}
      <main className="flex-1 flex items-center justify-center p-6 sm:p-10 relative">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-[420px]"
        >
          {/* LogoChange: mobile brand lockup uses the Avia AI mark + text */}
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <img
              src="/logo-avia-mark.png"
              alt=""
              aria-hidden="true"
              className="h-12 w-auto select-none pointer-events-none drop-shadow-[0_0_16px_rgba(34,211,238,0.3)]"
              draggable={false}
            />
            <div>
              <div className="text-base font-semibold tracking-tight">Avia AI</div>
              <div className="label-kicker">Command Center</div>
            </div>
          </div>

          <div className="mb-8">
            <div className="label-kicker mb-2">Sign in</div>
            <h2 className="text-2xl font-semibold tracking-tight">Welcome back, operator</h2>
            <p className="text-sm text-white/50 mt-1.5">
              Authenticate to access the live sensor grid.
            </p>
          </div>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, height: 0, marginBottom: 0 }}
                animate={{ opacity: 1, height: 'auto', marginBottom: 20 }}
                exit={{ opacity: 0, height: 0, marginBottom: 0 }}
                role="alert"
                className="bg-red-500/10 border border-red-500/20 text-red-300 p-3 rounded-lg flex items-center gap-2 text-sm overflow-hidden"
              >
                <AlertTriangle size={14} className="flex-shrink-0" />
                <span className="truncate">{error}</span>
              </motion.div>
            )}
          </AnimatePresence>

          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="login-user" className="text-xs text-white/60">Operator ID</label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} aria-hidden="true" />
                <input
                  id="login-user"
                  type="text"
                  autoComplete="username"
                  autoFocus
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  className={inputCls}
                  placeholder="Username or email"
                  disabled={isSubmitting}
                />
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="login-pass" className="text-xs text-white/60">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} aria-hidden="true" />
                <input
                  id="login-pass"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  className={inputCls + ' pr-10'}
                  placeholder="Enter password"
                  disabled={isSubmitting}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(v => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-white/40 hover:text-white transition-colors p-1.5 rounded hover:bg-white/5"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <Button
              type="submit"
              variant="primary"
              size="lg"
              fullWidth
              loading={isSubmitting}
              disabled={!username || !password}
              className="mt-2"
            >
              {isSubmitting ? 'Authenticating...' : 'Sign in'}
            </Button>
          </form>

          <div className="flex items-center gap-3 my-6">
            <div className="h-px flex-1 bg-white/10" />
            <span className="text-[10px] mono-data uppercase tracking-widest text-white/30">or</span>
            <div className="h-px flex-1 bg-white/10" />
          </div>

          <Button
            type="button"
            variant="secondary"
            size="lg"
            fullWidth
            onClick={handleGoogleSimulate}
            disabled={isSubmitting}
            leftIcon={
              <svg className="w-4 h-4" viewBox="0 0 24 24" aria-hidden="true">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
            }
          >
            Continue with Google
          </Button>

          <p className="text-[11px] text-white/35 text-center mt-8 leading-relaxed">
            By continuing, you acknowledge this is a monitored system. Unauthorized access is prohibited.
          </p>
        </motion.div>
      </main>
    </div>
  );
}

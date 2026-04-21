import { useState, useRef, useEffect } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard, Camera, Plane, AlertTriangle, FileText,
  Settings, ChevronLeft, ChevronRight, Activity, Upload,
  LogOut, User as UserIcon, Radio, Users, UserCircle2
} from 'lucide-react';
import { useStore } from '../store/useStore';
import { useAuthStore } from '../store/useAuthStore';

type NavItem = {
  to: string;
  icon: typeof LayoutDashboard;
  label: string;
  group: 'monitor' | 'manage' | 'data' | 'admin';
  adminOnly?: boolean;
};

const navItems: NavItem[] = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard', group: 'monitor' },
  { to: '/airspace', icon: Radio, label: '3D Airspace', group: 'monitor' },
  { to: '/runway', icon: Plane, label: 'Runway Watch', group: 'monitor' },
  { to: '/cameras', icon: Camera, label: 'Sensors', group: 'manage' },
  { to: '/upload', icon: Upload, label: 'Upload & Infer', group: 'manage' },
  { to: '/alerts', icon: AlertTriangle, label: 'Alerts', group: 'data' },
  { to: '/logs', icon: FileText, label: 'Detection Logs', group: 'data' },
  { to: '/settings', icon: Settings, label: 'Configuration', group: 'data' },
  { to: '/admin', icon: Users, label: 'Operators', group: 'admin', adminOnly: true },
];

const groups: { key: NavItem['group']; label: string }[] = [
  { key: 'monitor', label: 'Monitor' },
  { key: 'manage', label: 'Manage' },
  { key: 'data', label: 'Data' },
  { key: 'admin', label: 'Administration' },
];

function Sidebar({ collapsed, setCollapsed }: { collapsed: boolean; setCollapsed: (val: boolean) => void }) {
  const role = useAuthStore(s => s.user?.role);
  const isAdmin = role === 'admin';
  const visibleItems = navItems.filter(n => !n.adminOnly || isAdmin);
  const visibleGroups = groups.filter(g => visibleItems.some(n => n.group === g.key));
  return (
    <motion.aside
      animate={{ width: collapsed ? 72 : 232 }}
      transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
      className="fixed left-0 top-0 h-screen z-40 flex flex-col border-r border-white/5 bg-[rgba(8,10,14,0.9)] backdrop-blur-xl"
      aria-label="Primary navigation"
    >
      {/* DashChange: sidebar brand is now a clickable link to the Dashboard, using the Avia AI mark */}
      <Link
        to="/"
        aria-label="Go to Dashboard"
        title="Dashboard"
        className="flex items-center gap-3 px-4 h-[72px] border-b border-white/5 hover:bg-white/[0.03] transition-colors group"
      >
        <img
          src="/logo-avia-mark.png"
          alt=""
          aria-hidden="true"
          draggable={false}
          className="w-9 h-9 flex-shrink-0 object-contain select-none pointer-events-none drop-shadow-[0_0_12px_rgba(34,211,238,0.35)] group-hover:drop-shadow-[0_0_16px_rgba(34,211,238,0.55)] transition-[filter]"
        />
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.18 }}
              className="overflow-hidden whitespace-nowrap"
            >
              <div className="text-base font-semibold text-white tracking-tight leading-none">Avia AI</div>
              <div className="text-[10px] text-cyan-300/70 font-medium tracking-widest uppercase mt-1">Aviation Intel</div>
            </motion.div>
          )}
        </AnimatePresence>
      </Link>

      <nav className="flex-1 py-4 px-3 overflow-y-auto custom-scrollbar">
        {visibleGroups.map(group => (
          <div key={group.key} className="mb-4 last:mb-0">
            <AnimatePresence>
              {!collapsed && (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="label-kicker px-2 mb-2"
                >
                  {group.label}
                </motion.div>
              )}
            </AnimatePresence>
            <div className="space-y-1">
              {visibleItems.filter(n => n.group === group.key).map(item => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  end={item.to === '/'}
                  title={collapsed ? item.label : undefined}
                  className={({ isActive }) => `
                    flex items-center gap-3 px-3 h-10 rounded-lg transition-all duration-150 relative group
                    ${isActive
                      ? 'bg-cyan-500/10 text-cyan-50 border border-cyan-400/30'
                      : 'text-white/55 hover:bg-white/[0.04] hover:text-white border border-transparent'}
                  `}
                >
                  {({ isActive }) => (
                    <>
                      {isActive && (
                        <motion.div
                          layoutId="nav-indicator"
                          className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 bg-cyan-300 rounded-r shadow-[0_0_8px_rgba(34,211,238,0.6)]"
                          transition={{ type: 'spring', stiffness: 400, damping: 32 }}
                        />
                      )}
                      <item.icon className="w-[17px] h-[17px] flex-shrink-0" aria-hidden="true" />
                      <AnimatePresence>
                        {!collapsed && (
                          <motion.span
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            className="text-sm font-medium whitespace-nowrap"
                          >
                            {item.label}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="p-3 border-t border-white/5">
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center h-9 rounded-lg text-white/40 hover:bg-white/[0.04] hover:text-white transition-all"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </motion.aside>
  );
}

function UserMenu() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  // EditProfile: hover intent — small close delay so brief pointer gaps between
  // the trigger and the menu don't snap it shut mid-navigation.
  const closeTimer = useRef<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const clearClose = () => {
    if (closeTimer.current !== null) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleClose = () => {
    clearClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 150);
  };
  useEffect(() => () => clearClose(), []);

  const handleLogout = () => {
    clearClose();
    logout();
    navigate('/login', { replace: true });
  };
  const handleProfile = () => {
    clearClose();
    setOpen(false);
    navigate('/profile');
  };

  const initial = (user?.username || 'O').charAt(0).toUpperCase();

  return (
    <div
      ref={ref}
      className="relative"
      onMouseEnter={() => { clearClose(); setOpen(true); }}
      onMouseLeave={scheduleClose}
    >
      <button
        onClick={() => setOpen(v => !v)}
        aria-label="Open user menu"
        aria-haspopup="menu"
        aria-expanded={open}
        className="flex items-center gap-2.5 pl-1 pr-3 py-1 rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] transition-colors"
      >
        <div className="w-7 h-7 rounded-full bg-gradient-to-br from-cyan-300 to-cyan-500 text-black flex items-center justify-center text-xs font-bold">
          {initial}
        </div>
        <div className="hidden md:flex flex-col items-start leading-tight">
          <span className="text-xs font-medium text-white truncate max-w-[120px]">{user?.username || 'Operator'}</span>
          <span className="text-[9px] text-cyan-300/80 uppercase tracking-widest">{user?.role || 'user'}</span>
        </div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            role="menu"
            className="absolute right-0 mt-2 w-60 card shadow-2xl z-50 overflow-hidden"
          >
            <div className="px-4 py-3 border-b border-white/5">
              <div className="flex items-center gap-2 text-sm text-white">
                <UserIcon size={14} className="text-cyan-300" />
                <span className="truncate font-medium">{user?.username || 'Operator'}</span>
              </div>
              <div className="text-[10px] text-white/40 mt-1 uppercase tracking-widest">
                {user?.role || 'user'}
              </div>
            </div>
            <button
              role="menuitem"
              onClick={handleProfile}
              className="w-full text-left px-4 py-3 text-sm text-white/80 hover:bg-white/[0.05] transition-colors flex items-center gap-2.5 border-b border-white/5"
            >
              <UserCircle2 size={14} className="text-cyan-300" /> See full profile
            </button>
            <button
              role="menuitem"
              onClick={handleLogout}
              className="w-full text-left px-4 py-3 text-sm text-white/80 hover:bg-white/[0.05] transition-colors flex items-center gap-2.5"
            >
              <LogOut size={14} /> Sign out
            </button>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Header() {
  const location = useLocation();
  const { isRadarActive, toggleRadar } = useStore();
  const currentNav = navItems.find(n => (n.to === '/' ? location.pathname === '/' : location.pathname.startsWith(n.to)));

  return (
    <header className="h-[72px] flex items-center justify-between px-6 md:px-8 sticky top-0 z-30 border-b border-white/5 bg-[rgba(5,7,11,0.6)] backdrop-blur-lg">
      <div className="flex items-center gap-4 min-w-0">
        <h2 className="text-base md:text-lg font-semibold text-white/90 truncate">
          {currentNav ? currentNav.label : 'Avia AI'}
        </h2>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={toggleRadar}
          className="hidden md:flex items-center gap-2 h-9 px-3 rounded-full border border-white/10 bg-white/[0.03] hover:bg-white/[0.06] transition-colors"
          aria-label={`Radar ${isRadarActive ? 'active' : 'offline'}. Click to toggle.`}
          title="Toggle radar"
        >
          <span className="relative flex items-center">
            <span className={`w-1.5 h-1.5 rounded-full ${isRadarActive ? 'bg-emerald-400' : 'bg-red-400'}`} />
            {isRadarActive && (
              <span className="absolute inset-0 rounded-full bg-emerald-400/50 animate-ping" />
            )}
          </span>
          <span className="text-[11px] mono-data text-white/70 uppercase tracking-wider">
            Radar · <span className={isRadarActive ? 'text-emerald-300' : 'text-red-300'}>{isRadarActive ? 'Active' : 'Offline'}</span>
          </span>
          <Activity size={12} className={isRadarActive ? 'text-emerald-400' : 'text-red-400'} />
        </button>

        <UserMenu />
      </div>
    </header>
  );
}

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="flex min-h-screen text-white app-bg relative overflow-hidden">
      <div className="absolute inset-0 grid-overlay pointer-events-none" aria-hidden="true" />

      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />

      <motion.div
        animate={{ marginLeft: collapsed ? 72 : 232 }}
        transition={{ duration: 0.3, ease: [0.4, 0, 0.2, 1] }}
        className="flex flex-col w-full min-h-screen relative z-10"
      >
        <Header />
        <main className="flex-1 relative overflow-hidden">
          <AnimatePresence mode="wait">
            <Outlet />
          </AnimatePresence>
        </main>
      </motion.div>
    </div>
  );
}

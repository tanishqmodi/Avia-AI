import { useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  LayoutDashboard, Camera, Plane, AlertTriangle, FileText,
  Settings, Shield, ChevronLeft, ChevronRight, Activity, Upload, Zap,
} from 'lucide-react'
import clsx from 'clsx'

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/upload', icon: Upload, label: 'Upload' },
  { to: '/cameras', icon: Camera, label: 'Cameras' },
  { to: '/runway', icon: Plane, label: 'Runway' },
  { to: '/alerts', icon: AlertTriangle, label: 'Alerts' },
  { to: '/logs', icon: FileText, label: 'Logs' },
  { to: '/settings', icon: Settings, label: 'Settings' },
]

function Sidebar({ collapsed, setCollapsed }) {
  return (
    <motion.aside
      animate={{ width: collapsed ? 76 : 264 }}
      transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
      className="fixed left-0 top-0 h-screen z-40 flex flex-col"
      style={{
        background: 'linear-gradient(180deg, rgba(8,15,30,0.95) 0%, rgba(5,10,20,0.98) 100%)',
        borderRight: '1px solid rgba(56, 96, 160, 0.1)',
        backdropFilter: 'blur(40px)',
      }}
    >
      {/* Logo */}
      <div className="flex items-center gap-3 px-5 py-6">
        <div className="relative flex-shrink-0">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-600 to-cyan-500 flex items-center justify-center shadow-lg shadow-blue-500/20">
            <Shield className="w-5 h-5 text-white" />
          </div>
          <div className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-emerald-400 rounded-full animate-pulse ring-2 ring-[#050a14]" />
        </div>
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -8 }}
              transition={{ duration: 0.2 }}
              className="overflow-hidden whitespace-nowrap"
            >
              <h1 className="text-[17px] font-extrabold tracking-tight gradient-text">SkyGuard</h1>
              <p className="text-[9px] text-sky-600 tracking-[0.2em] uppercase font-medium">Avian Detection System</p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Separator */}
      <div className="mx-4 h-px bg-gradient-to-r from-transparent via-sky-800/30 to-transparent" />

      {/* Nav */}
      <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) => clsx(
              'flex items-center gap-3 px-3 py-2.5 rounded-xl transition-all duration-200 group relative',
              isActive
                ? 'bg-blue-500/10 text-blue-400'
                : 'text-sky-500 hover:bg-sky-900/40 hover:text-sky-300'
            )}
          >
            {({ isActive }) => (
              <>
                {isActive && (
                  <motion.div
                    layoutId="nav-active"
                    className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-blue-500"
                    style={{ boxShadow: '0 0 12px rgba(59,130,246,0.5)' }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                  />
                )}
                <item.icon className={clsx(
                  'w-[18px] h-[18px] flex-shrink-0 transition-all',
                  isActive && 'drop-shadow-[0_0_6px_rgba(59,130,246,0.5)]'
                )} />
                <AnimatePresence>
                  {!collapsed && (
                    <motion.span
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      className="text-[13px] font-medium whitespace-nowrap"
                    >
                      {item.label}
                    </motion.span>
                  )}
                </AnimatePresence>
              </>
            )}
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-3 pb-4 space-y-3">
        <div className="mx-1 h-px bg-gradient-to-r from-transparent via-sky-800/20 to-transparent" />
        <AnimatePresence>
          {!collapsed && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="mx-1 px-3 py-2.5 rounded-xl bg-emerald-500/5 border border-emerald-500/10"
            >
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-[10px] font-semibold text-emerald-400 uppercase tracking-wider">AI Model Active</span>
              </div>
              <p className="text-[10px] text-sky-600 mt-1 font-mono">YOLOv8 + ByteTrack</p>
            </motion.div>
          )}
        </AnimatePresence>
        <button
          onClick={() => setCollapsed(!collapsed)}
          className="w-full flex items-center justify-center p-2 rounded-xl text-sky-600 hover:bg-sky-900/30 hover:text-sky-400 transition-all"
        >
          {collapsed ? <ChevronRight className="w-4 h-4" /> : <ChevronLeft className="w-4 h-4" />}
        </button>
      </div>
    </motion.aside>
  )
}

function Header() {
  const location = useLocation()
  const pageTitles = {
    '/': 'Command Center',
    '/upload': 'Upload & Analyze',
    '/cameras': 'Camera Monitoring',
    '/runway': 'Runway Watch',
    '/alerts': 'Alert Center',
    '/logs': 'Detection Logs',
    '/settings': 'Configuration',
  }

  return (
    <header className="h-[60px] flex items-center justify-between px-6 sticky top-0 z-30"
      style={{
        background: 'rgba(5, 10, 20, 0.75)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(56, 96, 160, 0.08)',
      }}
    >
      <div className="flex items-center gap-4">
        <h2 className="text-sm font-semibold text-sky-300 tracking-wide">
          {pageTitles[location.pathname] || 'SkyGuard'}
        </h2>
      </div>

      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-sky-900/30 border border-sky-800/20">
          <Activity className="w-3 h-3 text-emerald-400" />
          <span className="text-[10px] font-medium text-emerald-400">Online</span>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/5 border border-red-500/15">
          <div className="live-dot" />
          <span className="text-[10px] font-bold text-red-400 tracking-widest uppercase">Live</span>
        </div>
        <div className="text-[10px] text-sky-700 font-mono">
          {new Date().toLocaleTimeString()}
        </div>
      </div>
    </header>
  )
}

export default function Layout() {
  const [collapsed, setCollapsed] = useState(false)

  return (
    <div className="min-h-screen mesh-bg">
      <Sidebar collapsed={collapsed} setCollapsed={setCollapsed} />
      <motion.div
        animate={{ marginLeft: collapsed ? 76 : 264 }}
        transition={{ duration: 0.35, ease: [0.4, 0, 0.2, 1] }}
        className="flex flex-col min-h-screen"
      >
        <Header />
        <main className="flex-1 p-6">
          <AnimatePresence mode="wait">
            <motion.div
              key={location?.pathname}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.25 }}
            >
              <Outlet />
            </motion.div>
          </AnimatePresence>
        </main>
      </motion.div>
    </div>
  )
}

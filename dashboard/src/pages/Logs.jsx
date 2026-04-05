import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { FileText, Download, Search, RefreshCw } from 'lucide-react'
import { api } from '../services/api'
import clsx from 'clsx'

const levelColors = {
  CRITICAL: 'text-red-400 bg-red-500/10',
  HIGH_RISK: 'text-orange-400 bg-orange-500/10',
  INTRUSION: 'text-amber-400 bg-amber-500/10',
  APPROACH: 'text-blue-400 bg-blue-500/10',
}

export default function Logs() {
  const [logs, setLogs] = useState([])
  const [search, setSearch] = useState('')
  const [loading, setLoading] = useState(false)

  const loadLogs = async () => {
    setLoading(true)
    try {
      const data = await api.getLogs(500)
      setLogs(data.reverse())
    } catch (e) { /* */ }
    setLoading(false)
  }

  useEffect(() => { loadLogs() }, [])

  const filtered = logs.filter(log => {
    if (!search) return true
    const s = search.toLowerCase()
    return (
      log.message?.toLowerCase().includes(s) ||
      log.camera_name?.toLowerCase().includes(s) ||
      log.zone?.toLowerCase().includes(s) ||
      log.event_type?.toLowerCase().includes(s) ||
      log.model_used?.toLowerCase().includes(s)
    )
  })

  const handleDownload = () => {
    window.open(api.getLogsDownloadUrl(), '_blank')
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between"
      >
        <div>
          <h2 className="text-2xl font-bold text-sky-100">Detection Logs</h2>
          <p className="text-sm text-sky-500 mt-0.5">{logs.length} entries recorded</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={loadLogs}
            className={clsx('flex items-center gap-2 px-4 py-2 rounded-lg bg-sky-900/60 border border-sky-800/30 text-sky-300 text-sm font-medium hover:bg-sky-800/60 transition-colors', loading && 'opacity-50')}>
            <RefreshCw className={clsx('w-4 h-4', loading && 'animate-spin')} />
            Refresh
          </button>
          <button onClick={handleDownload}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-accent-blue text-white text-sm font-medium hover:bg-accent-blue/90 transition-colors">
            <Download className="w-4 h-4" />
            Download CSV
          </button>
        </div>
      </motion.div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-sky-600" />
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search logs by camera, zone, event type, or message..."
          className="w-full pl-10 pr-4 py-2.5 rounded-lg bg-sky-900/40 border border-sky-800/30 text-sky-200 text-sm focus:outline-none focus:border-accent-blue/40 focus:ring-1 focus:ring-accent-blue/20 placeholder:text-sky-600"
        />
      </div>

      {/* Table */}
      <div className="glass overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-sky-800/30">
                <th className="text-left px-4 py-3 text-xs font-semibold text-sky-500 uppercase tracking-wider">Timestamp</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-sky-500 uppercase tracking-wider">Camera</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-sky-500 uppercase tracking-wider">Zone</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-sky-500 uppercase tracking-wider">Model</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-sky-500 uppercase tracking-wider">Event</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-sky-500 uppercase tracking-wider">Track ID</th>
                <th className="text-left px-4 py-3 text-xs font-semibold text-sky-500 uppercase tracking-wider">Message</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-sky-800/20">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center">
                    <FileText className="w-10 h-10 text-sky-700 mx-auto mb-3" />
                    <p className="text-sky-500">{search ? 'No matching logs' : 'No logs recorded yet'}</p>
                  </td>
                </tr>
              ) : (
                filtered.map((log, i) => (
                  <motion.tr
                    key={`${log.timestamp}-${i}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: Math.min(i * 0.02, 0.5) }}
                    className="hover:bg-sky-900/30 transition-colors"
                  >
                    <td className="px-4 py-2.5 text-xs text-sky-400 font-mono whitespace-nowrap">
                      {log.timestamp ? new Date(log.timestamp).toLocaleString() : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-sky-300 whitespace-nowrap">{log.camera_name || '—'}</td>
                    <td className="px-4 py-2.5">
                      <span className="text-xs px-2 py-0.5 rounded-full bg-sky-800/40 text-sky-400">{log.zone || '—'}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={clsx('text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider',
                        log.model_used === 'rtdetr' ? 'text-emerald-400 bg-emerald-500/10' : 'text-violet-400 bg-violet-500/10'
                      )}>{log.model_used || 'yolo'}</span>
                    </td>
                    <td className="px-4 py-2.5">
                      <span className={clsx('text-xs font-semibold px-2 py-0.5 rounded-full uppercase', levelColors[log.event_type] || 'text-sky-400 bg-sky-800/40')}>
                        {log.event_type || '—'}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-xs text-sky-400 font-mono">{log.track_id ?? '—'}</td>
                    <td className="px-4 py-2.5 text-sky-300 text-xs max-w-md truncate">{log.message}</td>
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between text-xs text-sky-600">
        <span>Showing {filtered.length} of {logs.length} entries</span>
        <span>Logs are stored in memory. Download CSV to persist.</span>
      </div>
    </div>
  )
}

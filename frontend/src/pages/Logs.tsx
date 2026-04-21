import { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { FileText, Download, Search, RefreshCw } from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { api, type LogEntry } from '../services/api';

export default function Logs() {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [zone, setZone] = useState('all');
  const [event, setEvent] = useState('all');

  const load = () => {
    setIsLoading(true);
    api
      .getLogs(500)
      .then(setLogs)
      .catch(() => setLogs([]))
      .finally(() => setIsLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const zones = useMemo(() => Array.from(new Set(logs.map(l => l.zone).filter(Boolean))), [logs]);
  const events = useMemo(() => Array.from(new Set(logs.map(l => l.event_type).filter(Boolean))), [logs]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return logs.filter(l => {
      if (zone !== 'all' && l.zone !== zone) return false;
      if (event !== 'all' && l.event_type !== event) return false;
      if (!q) return true;
      return (
        (l.camera_name || '').toLowerCase().includes(q) ||
        (l.message || '').toLowerCase().includes(q) ||
        (l.event_type || '').toLowerCase().includes(q)
      );
    });
  }, [logs, query, zone, event]);

  const inputCls =
    'h-9 bg-black/40 border border-white/10 rounded-lg px-3 text-sm text-white placeholder:text-white/30 focus:border-cyan-400/50 focus:bg-black/60 outline-none transition-colors';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 overflow-hidden flex"
    >
      <div className="w-full flex flex-col p-8 max-w-[1600px] mx-auto">
        <PageHeader
          kicker={`${filtered.length} of ${logs.length}`}
          title="Detection Logs"
          description="Historical record of every detection and alert event across the sensor grid."
          icon={<FileText size={18} />}
          actions={
            <>
              <Button
                variant="secondary"
                size="sm"
                leftIcon={<RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />}
                onClick={load}
                disabled={isLoading}
              >
                Refresh
              </Button>
              <a href="http://localhost:8000/api/logs/download">
                <Button variant="primary" size="sm" leftIcon={<Download size={14} />}>
                  Export CSV
                </Button>
              </a>
            </>
          }
        />

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search camera, event, message..."
              className={inputCls + ' pl-9 w-full'}
              aria-label="Search logs"
            />
          </div>
          <select value={zone} onChange={e => setZone(e.target.value)} aria-label="Filter by zone" className={inputCls + ' appearance-none'}>
            <option value="all">All zones</option>
            {zones.map(z => (
              <option key={z} value={z}>{z}</option>
            ))}
          </select>
          <select value={event} onChange={e => setEvent(e.target.value)} aria-label="Filter by event" className={inputCls + ' appearance-none'}>
            <option value="all">All events</option>
            {events.map(ev => (
              <option key={ev} value={ev}>{ev}</option>
            ))}
          </select>
        </div>

        <div className="card flex-1 overflow-hidden flex flex-col min-h-0">
          <div className="overflow-auto flex-1 custom-scrollbar">
            <table className="w-full text-left border-collapse text-sm whitespace-nowrap">
              <thead className="sticky top-0 z-10 bg-[rgba(10,12,16,0.95)] backdrop-blur border-b border-white/10">
                <tr>
                  {['Time', 'Event', 'Camera', 'Zone', 'Engine', 'Confidence'].map(h => (
                    <th key={h} className="px-5 py-3 label-kicker font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {isLoading && logs.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-white/40">
                      <div className="inline-flex items-center gap-3 text-sm">
                        <div className="w-4 h-4 border-2 border-cyan-400/50 border-t-transparent rounded-full animate-spin" />
                        Loading logs...
                      </div>
                    </td>
                  </tr>
                )}
                {!isLoading &&
                  filtered.map((log, i) => {
                    const isCritical = log.event_type === 'CRITICAL';
                    return (
                      <tr
                        key={i}
                        className={`border-b border-white/[0.04] hover:bg-white/[0.03] transition-colors ${i % 2 === 1 ? 'bg-white/[0.015]' : ''}`}
                      >
                        <td className="px-5 py-3 mono-data text-white/70 text-xs">
                          {new Date(log.timestamp).toLocaleString()}
                        </td>
                        <td className={`px-5 py-3 font-medium ${isCritical ? 'text-red-300' : 'text-amber-200'}`}>
                          <span className="inline-flex items-center gap-2">
                            <span className={`w-1.5 h-1.5 rounded-full ${isCritical ? 'bg-red-400' : 'bg-amber-400'}`} />
                            {log.message || log.event_type}
                          </span>
                        </td>
                        <td className="px-5 py-3 text-cyan-300">{log.camera_name}</td>
                        <td className="px-5 py-3 text-white/60">{log.zone}</td>
                        <td className="px-5 py-3 text-white/50 mono-data text-xs uppercase">{log.model_used || '—'}</td>
                        <td className="px-5 py-3 mono-data text-white/90">
                          {log.confidence ? `${(log.confidence * 100).toFixed(1)}%` : '—'}
                        </td>
                      </tr>
                    );
                  })}
                {!isLoading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-white/40 text-sm">
                      {logs.length === 0 ? 'No logs found' : 'No logs match current filters'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

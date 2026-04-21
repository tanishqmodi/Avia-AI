import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Users, UserPlus, ShieldCheck, ShieldAlert, Trash2, X,
  Mail, Lock, User as UserIcon, AlertTriangle, CheckCircle2, Plane, Search, Pencil, Save,
  Inbox, Check, XCircle, Clock, History, ChevronDown, ChevronUp,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import AirportPicker from '../components/ui/AirportPicker';
import { api, type AdminUser, type Airport, type UsernameRequest } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';

type Toast = { type: 'success' | 'error'; text: string } | null;

export default function Admin() {
  const { user: currentUser } = useAuthStore();
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'admin' | 'user'>('all');
  const [toast, setToast] = useState<Toast>(null);
  const [confirmDelete, setConfirmDelete] = useState<AdminUser | null>(null);
  // AdminEditUser: editing target (null = modal closed)
  const [editTarget, setEditTarget] = useState<AdminUser | null>(null);
  // UsernameRequest: pending rename queue + resolved history
  const [pendingRequests, setPendingRequests] = useState<UsernameRequest[]>([]);
  const [requestHistory, setRequestHistory] = useState<UsernameRequest[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [list, allRequests] = await Promise.all([
        api.listUsers(),
        api.listPendingUsernameRequests('all'),
      ]);
      setUsers(list);
      setPendingRequests(allRequests.filter(r => r.status === 'pending'));
      setRequestHistory(allRequests.filter(r => r.status !== 'pending'));
    } catch (e: any) {
      setToast({ type: 'error', text: e.message || 'Failed to load users' });
    } finally {
      setLoading(false);
    }
  };

  const handleApproveRequest = async (req: UsernameRequest) => {
    try {
      const resolved = await api.approveUsernameRequest(req.id);
      setPendingRequests(prev => prev.filter(r => r.id !== req.id));
      setRequestHistory(prev => [resolved, ...prev]);
      setUsers(prev =>
        prev.map(u => (u.id === req.user_id ? { ...u, username: req.requested_username } : u)),
      );
      setToast({ type: 'success', text: `Renamed "${req.current_username}" → "${req.requested_username}".` });
    } catch (e: any) {
      setToast({ type: 'error', text: e.message || 'Failed to approve request' });
    }
  };

  const handleRejectRequest = async (req: UsernameRequest) => {
    try {
      const resolved = await api.rejectUsernameRequest(req.id);
      setPendingRequests(prev => prev.filter(r => r.id !== req.id));
      setRequestHistory(prev => [resolved, ...prev]);
      setToast({ type: 'success', text: `Rejected rename for "${req.current_username}".` });
    } catch (e: any) {
      setToast({ type: 'error', text: e.message || 'Failed to reject request' });
    }
  };

  useEffect(() => {
    load();
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const filtered = users.filter(u => {
    if (roleFilter !== 'all' && u.role !== roleFilter) return false;
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      u.username.toLowerCase().includes(q) ||
      (u.email || '').toLowerCase().includes(q) ||
      (u.airport_iata || '').toLowerCase().includes(q) ||
      (u.airport_city || '').toLowerCase().includes(q)
    );
  });

  const adminCount = users.filter(u => u.role === 'admin').length;
  const airportCount = new Set(users.map(u => u.airport_iata).filter(Boolean)).size;

  const handleDelete = async (u: AdminUser) => {
    try {
      await api.deleteUser(u.id);
      setUsers(prev => prev.filter(x => x.id !== u.id));
      setToast({ type: 'success', text: `Deleted user "${u.username}".` });
    } catch (e: any) {
      setToast({ type: 'error', text: e.message || 'Failed to delete user' });
    } finally {
      setConfirmDelete(null);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 overflow-y-auto custom-scrollbar"
    >
      <div className="p-8 max-w-6xl mx-auto">
        <PageHeader
          kicker="Administration"
          title="User Management"
          description="Create operator accounts, assign them to airports, and control role access. Airports are sourced live from the OurAirports dataset."
          icon={<Users size={18} />}
          actions={
            <Button variant="primary" leftIcon={<UserPlus size={14} />} onClick={() => setModalOpen(true)}>
              Create user
            </Button>
          }
        />

        <AnimatePresence>
          {toast && (
            <motion.div
              initial={{ opacity: 0, y: -4, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto', marginBottom: 16 }}
              exit={{ opacity: 0, y: -4, height: 0 }}
              role={toast.type === 'error' ? 'alert' : 'status'}
              className={`text-sm p-3 flex items-center gap-2 border rounded-lg ${
                toast.type === 'error'
                  ? 'bg-red-500/10 border-red-500/20 text-red-300'
                  : 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300'
              }`}
            >
              {toast.type === 'error' ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
              {toast.text}
            </motion.div>
          )}
        </AnimatePresence>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
          <Stat icon={<Users size={14} />} label="Total operators" value={users.length} />
          <Stat icon={<ShieldCheck size={14} className="text-cyan-300" />} label="Admins" value={adminCount} accent />
          <Stat icon={<Plane size={14} className="text-cyan-300" />} label="Airports assigned" value={airportCount} />
        </div>

        {/* UsernameRequest: pending rename queue — only renders when there is work to do. */}
        {pendingRequests.length > 0 && (
          <div className="card border-amber-400/25 mb-6 overflow-hidden">
            <div className="px-5 py-3 border-b border-white/5 flex items-center gap-2 bg-amber-500/5">
              <div className="w-7 h-7 rounded-lg bg-amber-500/15 border border-amber-400/30 flex items-center justify-center text-amber-200">
                <Inbox size={13} />
              </div>
              <div className="flex-1">
                <div className="label-kicker">Review</div>
                <h3 className="text-sm font-semibold text-white leading-tight">
                  Username change requests
                  <span className="ml-2 text-[11px] font-normal px-1.5 py-0.5 rounded bg-amber-500/10 border border-amber-400/30 text-amber-200">
                    {pendingRequests.length} pending
                  </span>
                </h3>
              </div>
            </div>
            <ul className="divide-y divide-white/5">
              {pendingRequests.map(req => (
                <li key={req.id} className="px-5 py-3 flex items-center gap-3 flex-wrap">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-amber-300 to-amber-500 text-black flex items-center justify-center text-xs font-bold flex-shrink-0">
                    {req.current_username.charAt(0).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-white truncate">
                      <span className="font-medium">{req.current_username}</span>
                      <span className="text-white/40 mx-2">→</span>
                      <span className="font-medium text-cyan-200">{req.requested_username}</span>
                    </div>
                    <div className="flex items-center gap-2 text-[11px] text-white/45 mt-0.5">
                      {req.requester_email && <span className="truncate">{req.requester_email}</span>}
                      {req.requester_role && <span className="capitalize">· {req.requester_role}</span>}
                      <span className="inline-flex items-center gap-1">
                        <Clock size={10} />
                        {req.created_at ? new Date(req.created_at).toLocaleString() : ''}
                      </span>
                    </div>
                    {req.reason && (
                      <div className="text-[11px] text-white/60 mt-1 italic truncate" title={req.reason}>
                        “{req.reason}”
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <Button
                      variant="ghost"
                      onClick={() => handleRejectRequest(req)}
                      leftIcon={<XCircle size={13} />}
                    >
                      Reject
                    </Button>
                    <Button
                      variant="primary"
                      onClick={() => handleApproveRequest(req)}
                      leftIcon={<Check size={13} />}
                    >
                      Approve
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* UsernameRequest: resolved request history — collapsed by default. */}
        {requestHistory.length > 0 && (
          <div className="card mb-6 overflow-hidden">
            <button
              type="button"
              onClick={() => setHistoryOpen(v => !v)}
              className="w-full px-5 py-3 border-b border-white/5 flex items-center gap-2 text-left hover:bg-white/[0.02] transition-colors"
              aria-expanded={historyOpen}
            >
              <div className="w-7 h-7 rounded-lg bg-white/5 border border-white/10 flex items-center justify-center text-white/60">
                <History size={13} />
              </div>
              <div className="flex-1">
                <div className="label-kicker">Audit</div>
                <h3 className="text-sm font-semibold text-white leading-tight">
                  Username change history
                  <span className="ml-2 text-[11px] font-normal px-1.5 py-0.5 rounded bg-white/[0.04] border border-white/10 text-white/60">
                    {requestHistory.length}
                  </span>
                </h3>
              </div>
              {historyOpen ? <ChevronUp size={14} className="text-white/40" /> : <ChevronDown size={14} className="text-white/40" />}
            </button>
            <AnimatePresence initial={false}>
              {historyOpen && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.18 }}
                >
                  <div className="overflow-auto custom-scrollbar">
                    <table className="w-full text-left text-sm whitespace-nowrap">
                      <thead className="border-b border-white/10 bg-white/[0.02]">
                        <tr>
                          {['Status', 'Change', 'Reason', 'Reviewer', 'Note', 'Resolved'].map(h => (
                            <th key={h} className="px-5 py-2 label-kicker font-medium">{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {requestHistory.slice(0, 50).map(r => {
                          const reviewer = users.find(u => u.id === r.reviewed_by);
                          return (
                            <tr key={r.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                              <td className="px-5 py-2">
                                {r.status === 'approved' ? (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] uppercase tracking-wider bg-emerald-500/10 border border-emerald-500/20 text-emerald-300">
                                    <Check size={10} /> Approved
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] uppercase tracking-wider bg-red-500/10 border border-red-500/20 text-red-300">
                                    <XCircle size={10} /> Rejected
                                  </span>
                                )}
                              </td>
                              <td className="px-5 py-2">
                                <div className="text-sm text-white/85">
                                  <span>{r.current_username}</span>
                                  <span className="text-white/30 mx-2">→</span>
                                  <span className={r.status === 'approved' ? 'text-cyan-200' : 'text-white/50 line-through'}>
                                    {r.requested_username}
                                  </span>
                                </div>
                                {r.requester_email && (
                                  <div className="text-[11px] text-white/40 truncate max-w-[260px]">{r.requester_email}</div>
                                )}
                              </td>
                              <td className="px-5 py-2 text-xs text-white/60 max-w-[220px] truncate" title={r.reason || ''}>
                                {r.reason || <span className="text-white/25">—</span>}
                              </td>
                              <td className="px-5 py-2 text-xs text-white/70">
                                {reviewer?.username || <span className="text-white/25">—</span>}
                              </td>
                              <td className="px-5 py-2 text-xs text-white/60 max-w-[220px] truncate" title={r.admin_note || ''}>
                                {r.admin_note || <span className="text-white/25">—</span>}
                              </td>
                              <td className="px-5 py-2 mono-data text-[11px] text-white/50">
                                {r.resolved_at ? new Date(r.resolved_at).toLocaleString() : '—'}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[240px] max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Search username, email, IATA, city..."
              className="h-9 w-full bg-black/40 border border-white/10 rounded-lg pl-9 pr-3 text-sm text-white placeholder:text-white/30 focus:border-cyan-400/50 focus:bg-black/60 outline-none transition-colors"
              aria-label="Search users"
            />
          </div>
          <div className="flex items-center gap-1 bg-black/40 border border-white/10 rounded-lg p-1">
            {(['all', 'admin', 'user'] as const).map(r => (
              <button
                key={r}
                onClick={() => setRoleFilter(r)}
                className={`px-3 h-7 text-xs font-medium rounded-md transition-colors capitalize ${
                  roleFilter === r ? 'bg-white/10 text-white' : 'text-white/55 hover:text-white'
                }`}
              >
                {r}
              </button>
            ))}
          </div>
        </div>

        <div className="card overflow-hidden">
          <div className="overflow-auto custom-scrollbar">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="border-b border-white/10 bg-white/[0.02]">
                <tr>
                  {['Operator', 'Role', 'Airport', 'Provider', 'Created', ''].map(h => (
                    <th key={h} className="px-5 py-3 label-kicker font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && users.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-white/40">
                      <div className="inline-flex items-center gap-3 text-sm">
                        <div className="w-4 h-4 border-2 border-cyan-400/50 border-t-transparent rounded-full animate-spin" />
                        Loading operators...
                      </div>
                    </td>
                  </tr>
                )}
                {!loading && filtered.map(u => {
                  const isSelf = currentUser?.id === u.id;
                  return (
                    <tr key={u.id} className="border-b border-white/[0.04] hover:bg-white/[0.02] transition-colors">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-300 to-cyan-500 text-black flex items-center justify-center text-xs font-bold">
                            {u.username.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <div className="text-sm text-white font-medium flex items-center gap-2">
                              {u.username}
                              {isSelf && <span className="text-[9px] uppercase tracking-widest text-cyan-300/70">you</span>}
                            </div>
                            <div className="text-[11px] text-white/45 truncate">{u.email || '—'}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3">
                        {u.role === 'admin' ? (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] bg-cyan-500/10 border border-cyan-400/30 text-cyan-200">
                            <ShieldCheck size={11} /> Admin
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] bg-white/[0.04] border border-white/10 text-white/70">
                            <UserIcon size={11} /> User
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3">
                        {u.airport_iata ? (
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="mono-data text-xs text-cyan-300 bg-cyan-500/10 border border-cyan-400/20 rounded px-1.5 py-0.5">
                              {u.airport_iata}
                            </span>
                            <div className="min-w-0">
                              <div className="text-xs text-white/85 truncate max-w-[260px]">{u.airport_name || ''}</div>
                              <div className="text-[10px] text-white/45">{u.airport_city}{u.airport_country ? ` · ${u.airport_country}` : ''}</div>
                            </div>
                          </div>
                        ) : (
                          <span className="text-white/30 text-xs">Unassigned</span>
                        )}
                      </td>
                      <td className="px-5 py-3 text-xs text-white/50 capitalize">{u.auth_provider}</td>
                      <td className="px-5 py-3 mono-data text-[11px] text-white/50">
                        {u.created_at ? new Date(u.created_at).toLocaleDateString() : '—'}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            onClick={() => setEditTarget(u)}
                            className="text-white/40 hover:text-cyan-300 transition-colors p-1.5 rounded hover:bg-cyan-500/10"
                            aria-label={`Edit ${u.username}`}
                            title="Edit user"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            disabled={isSelf}
                            onClick={() => setConfirmDelete(u)}
                            className="text-white/40 hover:text-red-300 disabled:opacity-30 disabled:hover:text-white/40 disabled:cursor-not-allowed transition-colors p-1.5 rounded hover:bg-red-500/10"
                            aria-label={`Delete ${u.username}`}
                            title={isSelf ? 'Cannot delete yourself' : 'Delete user'}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {!loading && filtered.length === 0 && (
                  <tr>
                    <td colSpan={6} className="p-10 text-center text-white/40 text-sm">
                      {users.length === 0 ? 'No users yet' : 'No users match your filters'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {modalOpen && (
          <CreateUserModal
            onClose={() => setModalOpen(false)}
            onCreated={u => {
              setUsers(prev => [u, ...prev]);
              setToast({ type: 'success', text: `Created operator "${u.username}".` });
              setModalOpen(false);
            }}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {confirmDelete && (
          <ConfirmDialog
            user={confirmDelete}
            onCancel={() => setConfirmDelete(null)}
            onConfirm={() => handleDelete(confirmDelete)}
          />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {editTarget && (
          <EditUserModal
            user={editTarget}
            onClose={() => setEditTarget(null)}
            onSaved={u => {
              setUsers(prev => prev.map(x => (x.id === u.id ? u : x)));
              setToast({ type: 'success', text: `Updated "${u.username}".` });
              setEditTarget(null);
            }}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function Stat({ icon, label, value, accent }: { icon: React.ReactNode; label: string; value: number; accent?: boolean }) {
  return (
    <div className={`card p-4 flex items-center gap-3 ${accent ? 'border-cyan-400/20' : ''}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${accent ? 'bg-cyan-500/10 border border-cyan-400/20 text-cyan-300' : 'bg-white/5 border border-white/10 text-white/60'}`}>
        {icon}
      </div>
      <div>
        <div className="label-kicker">{label}</div>
        <div className="mono-data text-xl font-semibold text-white mt-0.5">{value}</div>
      </div>
    </div>
  );
}

function CreateUserModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (u: AdminUser) => void;
}) {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'user' | 'admin'>('user');
  const [airport, setAirport] = useState<Airport | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username || !password) {
      setErr('Username and password are required.');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const payload = {
        username: username.trim(),
        password,
        email: email.trim() || null,
        role,
        airport_iata: airport?.iata ?? null,
        airport_icao: airport?.icao ?? null,
        airport_name: airport?.name ?? null,
        airport_city: airport?.city ?? null,
        airport_country: airport?.country ?? null,
      };
      const created = await api.createUser(payload);
      onCreated(created);
    } catch (e: any) {
      setErr(e.message || 'Failed to create user');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    'w-full bg-black/40 border border-white/10 rounded-lg h-10 pl-9 pr-3 text-sm text-white placeholder:text-white/30 focus:border-cyan-400/50 focus:bg-black/60 outline-none transition-colors';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.2 }}
        className="card w-full max-w-xl overflow-hidden"
        role="dialog"
        aria-label="Create new operator"
      >
        <div className="flex items-center justify-between px-6 h-14 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-400/25 flex items-center justify-center text-cyan-300">
              <UserPlus size={14} />
            </div>
            <div>
              <div className="label-kicker">Administration</div>
              <h3 className="text-sm font-semibold text-white leading-tight">Create operator</h3>
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors p-1.5 rounded hover:bg-white/5" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 flex flex-col gap-4">
          <AnimatePresence>
            {err && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                role="alert"
                className="bg-red-500/10 border border-red-500/20 text-red-300 p-3 rounded-lg flex items-center gap-2 text-sm"
              >
                <AlertTriangle size={14} /> {err}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="f-username" className="text-xs text-white/60">Username</label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} />
                <input
                  id="f-username"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoFocus
                  autoComplete="off"
                  className={inputCls}
                  placeholder="operator_01"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="f-email" className="text-xs text-white/60">Email (optional)</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} />
                <input
                  id="f-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="off"
                  className={inputCls}
                  placeholder="operator@airfield.com"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="f-pass" className="text-xs text-white/60">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} />
                <input
                  id="f-pass"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className={inputCls}
                  placeholder="Minimum 4 characters"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="text-xs text-white/60">Role</div>
              <div className="grid grid-cols-2 bg-black/40 border border-white/10 rounded-lg p-1 gap-1 h-10">
                <button
                  type="button"
                  onClick={() => setRole('user')}
                  className={`text-xs font-medium rounded-md flex items-center justify-center gap-1.5 transition-all ${
                    role === 'user' ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white'
                  }`}
                >
                  <UserIcon size={12} /> User
                </button>
                <button
                  type="button"
                  onClick={() => setRole('admin')}
                  className={`text-xs font-medium rounded-md flex items-center justify-center gap-1.5 transition-all ${
                    role === 'admin' ? 'bg-cyan-500/20 text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,0.2)]' : 'text-white/60 hover:text-white'
                  }`}
                >
                  <ShieldCheck size={12} /> Admin
                </button>
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-white/60 flex items-center gap-1.5">
              <Plane size={12} className="text-cyan-300" /> Assigned airport
            </label>
            <AirportPicker value={airport} onChange={setAirport} disabled={submitting} />
            <p className="text-[11px] text-white/35 mt-0.5">
              Airports are pulled from the OurAirports open dataset (medium and large fields with IATA codes).
            </p>
          </div>

          <div className="flex items-center justify-end gap-2 mt-2 pt-4 border-t border-white/5">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting} leftIcon={!submitting ? <UserPlus size={14} /> : undefined}>
              {submitting ? 'Creating...' : 'Create operator'}
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

// AdminEditUser: edit modal for an existing operator.
function EditUserModal({
  user,
  onClose,
  onSaved,
}: {
  user: AdminUser;
  onClose: () => void;
  onSaved: (u: AdminUser) => void;
}) {
  const [username, setUsername] = useState(user.username);
  const [email, setEmail] = useState(user.email || '');
  const [role, setRole] = useState<'user' | 'admin'>(user.role === 'admin' ? 'admin' : 'user');
  const [password, setPassword] = useState('');
  const [airport, setAirport] = useState<Airport | null>(
    user.airport_iata
      ? {
          iata: user.airport_iata,
          icao: user.airport_icao || '',
          name: user.airport_name || '',
          city: user.airport_city || '',
          country: user.airport_country || '',
        }
      : null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const { user: currentUser } = useAuthStore();
  const isSelf = currentUser?.id === user.id;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedUsername = username.trim();
    if (!trimmedUsername) {
      setErr('Username cannot be empty.');
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const payload: Partial<import('../services/api').AdminUserPayload> = {
        email: (email.trim() || null) as string | null,
        role,
        airport_iata: airport?.iata ?? null,
        airport_icao: airport?.icao ?? null,
        airport_name: airport?.name ?? null,
        airport_city: airport?.city ?? null,
        airport_country: airport?.country ?? null,
      };
      if (trimmedUsername !== user.username) payload.username = trimmedUsername;
      if (password) payload.password = password;
      const updated = await api.updateUser(user.id, payload);
      onSaved(updated);
    } catch (e: any) {
      setErr(e.message || 'Failed to update user');
    } finally {
      setSubmitting(false);
    }
  };

  const inputCls =
    'w-full bg-black/40 border border-white/10 rounded-lg h-10 pl-9 pr-3 text-sm text-white placeholder:text-white/30 focus:border-cyan-400/50 focus:bg-black/60 outline-none transition-colors';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 12 }}
        transition={{ duration: 0.2 }}
        className="card w-full max-w-xl overflow-hidden"
        role="dialog"
        aria-label={`Edit ${user.username}`}
      >
        <div className="flex items-center justify-between px-6 h-14 border-b border-white/5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-cyan-500/10 border border-cyan-400/25 flex items-center justify-center text-cyan-300">
              <Pencil size={14} />
            </div>
            <div>
              <div className="label-kicker">Administration</div>
              <h3 className="text-sm font-semibold text-white leading-tight">Edit {user.username}</h3>
            </div>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors p-1.5 rounded hover:bg-white/5" aria-label="Close">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={submit} className="p-6 flex flex-col gap-4">
          <AnimatePresence>
            {err && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                role="alert"
                className="bg-red-500/10 border border-red-500/20 text-red-300 p-3 rounded-lg flex items-center gap-2 text-sm"
              >
                <AlertTriangle size={14} /> {err}
              </motion.div>
            )}
          </AnimatePresence>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ef-username" className="text-xs text-white/60">Username</label>
              <div className="relative">
                <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} />
                <input
                  id="ef-username"
                  type="text"
                  value={username}
                  onChange={e => setUsername(e.target.value)}
                  autoComplete="off"
                  className={inputCls}
                  placeholder="operator_01"
                />
              </div>
              <p className="text-[11px] text-white/35">Admin-only: renaming affects this operator's login.</p>
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ef-email" className="text-xs text-white/60">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} />
                <input
                  id="ef-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  autoComplete="off"
                  className={inputCls}
                  placeholder="operator@airfield.com"
                />
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="ef-pass" className="text-xs text-white/60">New password (optional)</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} />
                <input
                  id="ef-pass"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  autoComplete="new-password"
                  className={inputCls}
                  placeholder="Leave blank to keep current"
                />
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <div className="text-xs text-white/60">Role</div>
              <div className="grid grid-cols-2 bg-black/40 border border-white/10 rounded-lg p-1 gap-1 h-10">
                <button
                  type="button"
                  onClick={() => !isSelf && setRole('user')}
                  disabled={isSelf}
                  className={`text-xs font-medium rounded-md flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                    role === 'user' ? 'bg-white/10 text-white' : 'text-white/60 hover:text-white'
                  }`}
                >
                  <UserIcon size={12} /> User
                </button>
                <button
                  type="button"
                  onClick={() => !isSelf && setRole('admin')}
                  disabled={isSelf}
                  className={`text-xs font-medium rounded-md flex items-center justify-center gap-1.5 transition-all disabled:opacity-40 disabled:cursor-not-allowed ${
                    role === 'admin' ? 'bg-cyan-500/20 text-cyan-100 shadow-[0_0_12px_rgba(34,211,238,0.2)]' : 'text-white/60 hover:text-white'
                  }`}
                >
                  <ShieldCheck size={12} /> Admin
                </button>
              </div>
              {isSelf && <p className="text-[11px] text-white/35">You cannot change your own role.</p>}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-white/60 flex items-center gap-1.5">
              <Plane size={12} className="text-cyan-300" /> Assigned airport
            </label>
            <AirportPicker value={airport} onChange={setAirport} disabled={submitting} />
          </div>

          <div className="flex items-center justify-end gap-2 mt-2 pt-4 border-t border-white/5">
            <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
              Cancel
            </Button>
            <Button type="submit" variant="primary" loading={submitting} leftIcon={!submitting ? <Save size={14} /> : undefined}>
              {submitting ? 'Saving...' : 'Save changes'}
            </Button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}

function ConfirmDialog({
  user,
  onCancel,
  onConfirm,
}: {
  user: AdminUser;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm"
      onMouseDown={e => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        className="card w-full max-w-sm p-6"
        role="alertdialog"
      >
        <div className="flex items-start gap-3 mb-4">
          <div className="w-9 h-9 rounded-lg bg-red-500/10 border border-red-500/30 flex items-center justify-center text-red-300 flex-shrink-0">
            <ShieldAlert size={16} />
          </div>
          <div>
            <h4 className="text-sm font-semibold text-white">Delete operator?</h4>
            <p className="text-xs text-white/60 mt-1 leading-relaxed">
              This permanently removes <span className="text-white">{user.username}</span>. Assigned airport data will be lost.
            </p>
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" onClick={onCancel}>Cancel</Button>
          <Button variant="danger" leftIcon={<Trash2 size={13} />} onClick={onConfirm}>
            Delete
          </Button>
        </div>
      </motion.div>
    </motion.div>
  );
}

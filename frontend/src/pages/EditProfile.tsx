// EditProfile: self-service profile page. User can see all profile details
// (airport assignment, role, provider, timestamps) and edit email + password.
// Admin-only fields (role, airport) are shown read-only here.
import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  User as UserIcon, Mail, Lock, Plane, ShieldCheck, Save,
  AlertTriangle, CheckCircle2, KeyRound, Clock, IdCard, Send, X,
} from 'lucide-react';
import PageHeader from '../components/ui/PageHeader';
import { Button } from '../components/ui/Button';
import { api, type AdminUser, type UsernameRequest } from '../services/api';
import { useAuthStore } from '../store/useAuthStore';

type Toast = { type: 'success' | 'error'; text: string } | null;
type Profile = AdminUser & { updated_at?: string | null };

export default function EditProfile() {
  const { user: authUser, setAuth } = useAuthStore();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [toast, setToast] = useState<Toast>(null);

  const [email, setEmail] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // UsernameRequest: submit + review own rename requests.
  const [requests, setRequests] = useState<UsernameRequest[]>([]);
  const [requestedUsername, setRequestedUsername] = useState('');
  const [requestReason, setRequestReason] = useState('');
  const [submittingRequest, setSubmittingRequest] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const [me, myRequests] = await Promise.all([api.getMe(), api.getMyUsernameRequests()]);
      setProfile(me);
      setEmail(me.email || '');
      setRequests(myRequests);
      // If an admin approved our rename since last fetch, sync the auth store
      // so the sidebar/profile menu show the new name immediately.
      if (authUser && me.username !== authUser.username) {
        const token = useAuthStore.getState().token;
        if (token) setAuth(token, { id: authUser.id, username: me.username, role: me.role });
      }
    } catch (e: any) {
      setToast({ type: 'error', text: e.message || 'Failed to load profile' });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);
  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3500);
    return () => window.clearTimeout(t);
  }, [toast]);

  const isLocal = profile?.auth_provider === 'local';
  const wantsPasswordChange = !!newPassword || !!confirmPassword || !!currentPassword;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!profile) return;
    if (wantsPasswordChange) {
      if (!isLocal) {
        setToast({ type: 'error', text: 'Password is managed by your SSO provider.' });
        return;
      }
      if (newPassword !== confirmPassword) {
        setToast({ type: 'error', text: 'New password and confirmation do not match.' });
        return;
      }
      if (newPassword.length < 4) {
        setToast({ type: 'error', text: 'New password must be at least 4 characters.' });
        return;
      }
      if (!currentPassword) {
        setToast({ type: 'error', text: 'Enter your current password to change it.' });
        return;
      }
    }
    setSubmitting(true);
    try {
      const payload: { email?: string | null; current_password?: string; new_password?: string } = {};
      const normalizedEmail = email.trim() || null;
      if (normalizedEmail !== (profile.email || null)) payload.email = normalizedEmail;
      if (wantsPasswordChange) {
        payload.current_password = currentPassword;
        payload.new_password = newPassword;
      }
      if (Object.keys(payload).length === 0) {
        setToast({ type: 'success', text: 'No changes to save.' });
        setSubmitting(false);
        return;
      }
      const updated = await api.updateSelf(payload);
      setProfile(updated);
      setEmail(updated.email || '');
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setToast({ type: 'success', text: 'Profile updated.' });
    } catch (e: any) {
      setToast({ type: 'error', text: e.message || 'Failed to update profile' });
    } finally {
      setSubmitting(false);
    }
  };

  const pendingRequest = requests.find(r => r.status === 'pending') || null;
  const pastRequests = requests.filter(r => r.status !== 'pending');

  const submitUsernameRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    const desired = requestedUsername.trim();
    if (desired.length < 3) {
      setToast({ type: 'error', text: 'Username must be at least 3 characters.' });
      return;
    }
    if (profile && desired === profile.username) {
      setToast({ type: 'error', text: 'That is already your username.' });
      return;
    }
    setSubmittingRequest(true);
    try {
      const created = await api.submitUsernameRequest({
        requested_username: desired,
        reason: requestReason.trim() || null,
      });
      setRequests(prev => [created, ...prev]);
      setRequestedUsername('');
      setRequestReason('');
      setToast({ type: 'success', text: 'Rename request submitted for admin review.' });
    } catch (err: any) {
      setToast({ type: 'error', text: err.message || 'Failed to submit request' });
    } finally {
      setSubmittingRequest(false);
    }
  };

  const cancelUsernameRequest = async (id: string) => {
    try {
      await api.cancelUsernameRequest(id);
      setRequests(prev => prev.filter(r => r.id !== id));
      setToast({ type: 'success', text: 'Rename request cancelled.' });
    } catch (err: any) {
      setToast({ type: 'error', text: err.message || 'Failed to cancel request' });
    }
  };

  const inputCls =
    'w-full bg-black/40 border border-white/10 rounded-lg h-10 pl-9 pr-3 text-sm text-white placeholder:text-white/30 focus:border-cyan-400/50 focus:bg-black/60 outline-none transition-colors';
  const roInputCls =
    'w-full bg-black/20 border border-white/5 rounded-lg h-10 pl-9 pr-3 text-sm text-white/70 cursor-not-allowed';

  const displayName = profile?.username || authUser?.username || 'Operator';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="absolute inset-0 overflow-y-auto custom-scrollbar"
    >
      <div className="p-8 max-w-4xl mx-auto">
        <PageHeader
          kicker="Account"
          title="Edit Profile"
          description="View your full operator profile and update your contact email or password."
          icon={<UserIcon size={18} />}
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

        {loading && !profile ? (
          <div className="card p-10 text-center text-white/40">
            <div className="inline-flex items-center gap-3 text-sm">
              <div className="w-4 h-4 border-2 border-cyan-400/50 border-t-transparent rounded-full animate-spin" />
              Loading profile...
            </div>
          </div>
        ) : profile ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            <div className="card p-6 md:col-span-1">
              <div className="flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-cyan-300 to-cyan-500 text-black flex items-center justify-center text-2xl font-bold mb-3">
                  {initial}
                </div>
                <div className="text-base font-semibold text-white">{displayName}</div>
                <div className="text-xs text-white/50 mt-1">{profile.email || 'No email set'}</div>
                <div className="mt-3 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] bg-cyan-500/10 border border-cyan-400/30 text-cyan-200 capitalize">
                  <ShieldCheck size={11} /> {profile.role}
                </div>
              </div>

              <div className="mt-6 space-y-3 text-sm">
                <InfoRow icon={<IdCard size={13} />} label="Auth provider" value={profile.auth_provider} capitalize />
                <InfoRow
                  icon={<Plane size={13} />}
                  label="Airport"
                  value={
                    profile.airport_iata
                      ? `${profile.airport_iata} · ${profile.airport_name || ''}`.trim()
                      : 'Unassigned'
                  }
                />
                {profile.airport_city && (
                  <InfoRow
                    icon={<Plane size={13} />}
                    label="Location"
                    value={`${profile.airport_city}${profile.airport_country ? ` · ${profile.airport_country}` : ''}`}
                  />
                )}
                <InfoRow
                  icon={<Clock size={13} />}
                  label="Member since"
                  value={profile.created_at ? new Date(profile.created_at).toLocaleDateString() : '—'}
                />
                {profile.updated_at && (
                  <InfoRow
                    icon={<Clock size={13} />}
                    label="Last updated"
                    value={new Date(profile.updated_at).toLocaleString()}
                  />
                )}
              </div>
            </div>

            <form onSubmit={submit} className="card p-6 md:col-span-2 flex flex-col gap-5">
              <div>
                <h3 className="text-sm font-semibold text-white">Contact</h3>
                <p className="text-xs text-white/45 mt-0.5">Update the email associated with this account.</p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-1.5">
                  <label className="text-xs text-white/60">Username</label>
                  <div className="relative">
                    <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} />
                    <input type="text" value={profile.username} disabled className={roInputCls} />
                  </div>
                  <p className="text-[11px] text-white/35">Use the rename request below — admins review changes.</p>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="p-email" className="text-xs text-white/60">Email</label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} />
                    <input
                      id="p-email"
                      type="email"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      autoComplete="email"
                      className={inputCls}
                      placeholder="operator@airfield.com"
                    />
                  </div>
                </div>
              </div>

              <div className="h-px bg-white/5 my-2" />

              {/* UsernameRequest: user-initiated rename workflow. */}
              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <Send size={14} className="text-cyan-300" /> Username change
                </h3>
                <p className="text-xs text-white/45 mt-0.5">
                  Submit a new username. An admin must approve the change before it takes effect.
                </p>
              </div>

              {pendingRequest ? (
                <div className="rounded-lg border border-amber-400/25 bg-amber-500/10 p-3 flex items-start gap-3">
                  <Clock size={14} className="text-amber-300 mt-0.5 flex-shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-amber-100">
                      Awaiting admin review:{' '}
                      <span className="text-white font-medium">{pendingRequest.current_username}</span>{' '}
                      →{' '}
                      <span className="text-white font-medium">{pendingRequest.requested_username}</span>
                    </div>
                    {pendingRequest.reason && (
                      <div className="text-[11px] text-amber-100/70 mt-0.5 truncate">Reason: {pendingRequest.reason}</div>
                    )}
                    <div className="text-[11px] text-amber-100/50 mt-0.5">
                      Submitted {pendingRequest.created_at ? new Date(pendingRequest.created_at).toLocaleString() : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => cancelUsernameRequest(pendingRequest.id)}
                    className="text-amber-200/70 hover:text-white p-1 rounded hover:bg-white/5 transition-colors"
                    title="Cancel request"
                    aria-label="Cancel request"
                  >
                    <X size={14} />
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="p-newname" className="text-xs text-white/60">Requested username</label>
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} />
                      <input
                        id="p-newname"
                        type="text"
                        value={requestedUsername}
                        onChange={e => setRequestedUsername(e.target.value)}
                        autoComplete="off"
                        className={inputCls}
                        placeholder="new_operator_id"
                      />
                    </div>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <label htmlFor="p-reason" className="text-xs text-white/60">Reason (optional)</label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} />
                      <input
                        id="p-reason"
                        type="text"
                        value={requestReason}
                        onChange={e => setRequestReason(e.target.value)}
                        autoComplete="off"
                        className={inputCls}
                        placeholder="Why you want this change"
                      />
                    </div>
                  </div>
                  <div className="sm:col-span-2 flex items-center justify-end">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={submitUsernameRequest}
                      loading={submittingRequest}
                      leftIcon={!submittingRequest ? <Send size={14} /> : undefined}
                    >
                      {submittingRequest ? 'Submitting...' : 'Submit request'}
                    </Button>
                  </div>
                </div>
              )}

              {pastRequests.length > 0 && (
                <div className="flex flex-col gap-1.5">
                  <div className="label-kicker">Past requests</div>
                  <ul className="flex flex-col divide-y divide-white/5 border border-white/5 rounded-lg overflow-hidden">
                    {pastRequests.slice(0, 5).map(r => (
                      <li key={r.id} className="px-3 py-2 flex items-center gap-3 text-xs">
                        <span
                          className={`px-1.5 py-0.5 rounded-md text-[10px] uppercase tracking-wider ${
                            r.status === 'approved'
                              ? 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-300'
                              : 'bg-red-500/10 border border-red-500/20 text-red-300'
                          }`}
                        >
                          {r.status}
                        </span>
                        <span className="text-white/70 truncate flex-1">
                          {r.current_username} → {r.requested_username}
                        </span>
                        {r.admin_note && (
                          <span className="text-white/40 truncate max-w-[200px]" title={r.admin_note}>
                            “{r.admin_note}”
                          </span>
                        )}
                        <span className="text-white/30 mono-data text-[10px]">
                          {r.resolved_at ? new Date(r.resolved_at).toLocaleDateString() : ''}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="h-px bg-white/5 my-2" />

              <div>
                <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                  <KeyRound size={14} className="text-cyan-300" /> Password
                </h3>
                <p className="text-xs text-white/45 mt-0.5">
                  {isLocal
                    ? 'Leave blank to keep your current password.'
                    : 'Your password is managed by your SSO provider and cannot be changed here.'}
                </p>
              </div>

              <fieldset disabled={!isLocal} className="grid grid-cols-1 sm:grid-cols-2 gap-4 disabled:opacity-50">
                <div className="flex flex-col gap-1.5 sm:col-span-2">
                  <label htmlFor="p-cpw" className="text-xs text-white/60">Current password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} />
                    <input
                      id="p-cpw"
                      type="password"
                      value={currentPassword}
                      onChange={e => setCurrentPassword(e.target.value)}
                      autoComplete="current-password"
                      className={inputCls}
                      placeholder="Enter current password"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="p-npw" className="text-xs text-white/60">New password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} />
                    <input
                      id="p-npw"
                      type="password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      autoComplete="new-password"
                      className={inputCls}
                      placeholder="At least 4 characters"
                    />
                  </div>
                </div>
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="p-cnpw" className="text-xs text-white/60">Confirm new password</label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" size={14} />
                    <input
                      id="p-cnpw"
                      type="password"
                      value={confirmPassword}
                      onChange={e => setConfirmPassword(e.target.value)}
                      autoComplete="new-password"
                      className={inputCls}
                      placeholder="Repeat new password"
                    />
                  </div>
                </div>
              </fieldset>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/5 mt-2">
                <Button type="submit" variant="primary" loading={submitting} leftIcon={!submitting ? <Save size={14} /> : undefined}>
                  {submitting ? 'Saving...' : 'Save changes'}
                </Button>
              </div>
            </form>
          </div>
        ) : null}
      </div>
    </motion.div>
  );
}

function InfoRow({
  icon, label, value, capitalize,
}: { icon: React.ReactNode; label: string; value: string; capitalize?: boolean }) {
  return (
    <div className="flex items-start gap-2">
      <span className="w-5 h-5 flex items-center justify-center text-white/40 flex-shrink-0 mt-0.5">{icon}</span>
      <div className="min-w-0">
        <div className="label-kicker">{label}</div>
        <div className={`text-xs text-white/80 truncate ${capitalize ? 'capitalize' : ''}`}>{value}</div>
      </div>
    </div>
  );
}

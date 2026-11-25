import {
  Bell,
  Calendar,
  Check,
  Clock,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileText,
  Lock,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sliders,
  Stethoscope,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import { formatTime12h } from '../constants.ts';
import type {
  AdminStats,
  Appointment,
  AppointmentStatus,
  BlockedSlot,
  ClinicContent,
  NotificationRecord,
  OperatingHour,
  Treatment,
} from '../types.ts';

interface AdminDashboardProps {
  onBackToSite: () => void;
  onContentUpdated: () => void;
}

type AdminTab = 'overview' | 'appointments' | 'schedule' | 'treatments' | 'content' | 'notifications';

interface ContactMessageRow {
  id: number;
  name: string;
  mobile: string;
  email: string;
  subject: string;
  message: string;
  created_at: string;
}

export function AdminDashboard({ onBackToSite, onContentUpdated }: AdminDashboardProps) {
  // Auth state held strictly in JS memory
  const [token, setToken] = useState<string | null>(null);
  const [adminUser, setAdminUser] = useState<{ email: string; name: string; role: string } | null>(null);
  const [authStatus, setAuthStatus] = useState<{ needsBootstrap: boolean; envPasscodeActive: boolean } | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState('');

  // Login / bootstrap fields
  const [setupName, setSetupName] = useState('Clinic Administrator');
  const [emailInput, setEmailInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');

  // Dashboard data
  const [activeTab, setActiveTab] = useState<AdminTab>('appointments');
  const [loadingData, setLoadingData] = useState(false);
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [operatingHours, setOperatingHours] = useState<OperatingHour[]>([]);
  const [blockedSlots, setBlockedSlots] = useState<BlockedSlot[]>([]);
  const [content, setContent] = useState<ClinicContent | null>(null);
  const [notifications, setNotifications] = useState<NotificationRecord[]>([]);
  const [contactMessages, setContactMessages] = useState<ContactMessageRow[]>([]);
  const [integrations, setIntegrations] = useState<{
    emailConfigured: boolean;
    adminEmailConfigured: boolean;
    whatsappConfigured: boolean;
  } | null>(null);
  const [supabaseStatus, setSupabaseStatus] = useState<{
    projectId: string;
    region: string;
    url: string;
    keyConfigured: boolean;
    mode?: 'service_role' | 'publishable';
  } | null>(null);
  const [supabaseSyncNote, setSupabaseSyncNote] = useState('');
  const [supabaseCheckResult, setSupabaseCheckResult] = useState<{
    connected: boolean;
    tablesReady: boolean;
    message: string;
  } | null>(null);
  const [supabaseBusy, setSupabaseBusy] = useState(false);
  const [schemaCopied, setSchemaCopied] = useState(false);
  const [todayStr, setTodayStr] = useState('');
  const [bannerMsg, setBannerMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // Appointment filters, full edit modal, and inline cancel/delete confirmation
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'UPCOMING' | AppointmentStatus>('ALL');
  const [dateFilter, setDateFilter] = useState('');
  const [treatmentFilter, setTreatmentFilter] = useState('');
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null);
  const [editPatientName, setEditPatientName] = useState('');
  const [editMobile, setEditMobile] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editTreatmentId, setEditTreatmentId] = useState<number | ''>('');
  const [editDentist, setEditDentist] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editTime, setEditTime] = useState('');
  const [editStatus, setEditStatus] = useState<AppointmentStatus>('Pending');
  const [editNotes, setEditNotes] = useState('');
  const [savingAppt, setSavingAppt] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    type: 'cancel' | 'delete';
    appointment: Appointment;
  } | null>(null);

  // Blocked slot form
  const [blockDate, setBlockDate] = useState('');
  const [blockAllDay, setBlockAllDay] = useState(true);
  const [blockStart, setBlockStart] = useState('14:00');
  const [blockEnd, setBlockEnd] = useState('16:00');
  const [blockReason, setBlockReason] = useState('');

  // Add treatment form
  const [newTreatmentName, setNewTreatmentName] = useState('');
  const [newTreatmentCategory, setNewTreatmentCategory] = useState<Treatment['category']>('General Dentistry');
  const [newTreatmentDuration, setNewTreatmentDuration] = useState(30);
  const [newTreatmentShort, setNewTreatmentShort] = useState('');

  // Review editor
  const [newReviewAuthor, setNewReviewAuthor] = useState('');
  const [newReviewDate, setNewReviewDate] = useState('');
  const [newReviewText, setNewReviewText] = useState('');

  useEffect(() => {
    fetch('/api/admin/auth-status')
      .then((r) => r.json())
      .then((data) => setAuthStatus(data))
      .catch(() => setAuthError('Unable to reach server authentication status.'))
      .finally(() => setAuthLoading(false));
  }, []);

  async function loadDashboard(authToken: string) {
    setLoadingData(true);
    try {
      const res = await fetch('/api/admin/dashboard', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (res.status === 401) {
        setToken(null);
        setAdminUser(null);
        return;
      }
      const data = await res.json();
      setStats(data.stats);
      setAppointments(data.appointments || []);
      setTreatments(data.treatments || []);
      setOperatingHours(data.operatingHours || []);
      setBlockedSlots(data.blockedSlots || []);
      setContent(data.content || null);
      setNotifications(data.notifications || []);
      setContactMessages(data.contactMessages || []);
      setIntegrations(data.integrations || null);
      setSupabaseStatus(data.supabaseStatus || null);
      setSupabaseSyncNote(data.supabaseSyncNote || '');
      setTodayStr(data.todayStr || '');
    } catch {
      setBannerMsg({ ok: false, text: 'Unable to load dashboard records.' });
    } finally {
      setLoadingData(false);
    }
  }

  async function handleBootstrap(e: FormEvent) {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch('/api/admin/bootstrap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: setupName, email: emailInput, password: passwordInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Setup failed.');
        return;
      }
      setToken(data.token);
      setAdminUser(data.user);
      setAuthStatus({ needsBootstrap: false, envPasscodeActive: false });
      await loadDashboard(data.token);
    } catch {
      setAuthError('Network error during administrator setup.');
    }
  }

  async function handleLogin(e: FormEvent) {
    e.preventDefault();
    setAuthError('');
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: emailInput, password: passwordInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Invalid credentials.');
        return;
      }
      setToken(data.token);
      setAdminUser(data.user);
      await loadDashboard(data.token);
    } catch {
      setAuthError('Network error while signing in.');
    }
  }

  const filteredAppointments = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return appointments.filter((a) => {
      if (q && !a.patientName.toLowerCase().includes(q) && !a.mobile.toLowerCase().includes(q) && !a.referenceCode.toLowerCase().includes(q)) {
        return false;
      }
      if (statusFilter === 'UPCOMING') {
        if (a.appointmentDate < todayStr || (a.status !== 'Pending' && a.status !== 'Confirmed')) return false;
      } else if (statusFilter !== 'ALL' && a.status !== statusFilter) {
        return false;
      }
      if (dateFilter && a.appointmentDate !== dateFilter) return false;
      if (treatmentFilter && a.treatmentName !== treatmentFilter) return false;
      return true;
    });
  }, [appointments, searchQuery, statusFilter, dateFilter, treatmentFilter, todayStr]);

  function openEditModal(a: Appointment) {
    setEditingAppt(a);
    setEditPatientName(a.patientName);
    setEditMobile(a.mobile);
    setEditEmail(a.email || '');
    setEditTreatmentId(a.treatmentId ?? '');
    setEditDentist(a.preferredDentist);
    setEditDate(a.appointmentDate);
    setEditTime(a.timeSlot);
    setEditStatus(a.status);
    setEditNotes(a.notes || '');
  }

  async function updateAppointment(
    id: number,
    payload: {
      patientName?: string;
      mobile?: string;
      email?: string;
      treatmentId?: number | null;
      preferredDentist?: string;
      status?: AppointmentStatus;
      appointmentDate?: string;
      timeSlot?: string;
      notes?: string;
    }
  ) {
    if (!token) return;
    setBannerMsg(null);
    setSavingAppt(true);
    try {
      const res = await fetch(`/api/admin/appointments/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        setBannerMsg({ ok: false, text: data.error || 'Could not update appointment.' });
        return;
      }
      const syncSuffix = data.supabaseSynced
        ? ' Synced to Supabase.'
        : data.supabaseError
          ? ` (${data.supabaseError})`
          : '';
      setBannerMsg({
        ok: true,
        text: `Updated ${data.appointment.referenceCode} (${data.appointment.status}).${syncSuffix}`,
      });
      setEditingAppt(null);
      setConfirmAction(null);
      await loadDashboard(token);
    } finally {
      setSavingAppt(false);
    }
  }

  async function deleteAppointment(a: Appointment) {
    if (!token) return;
    setBannerMsg(null);
    setSavingAppt(true);
    try {
      const res = await fetch(`/api/admin/appointments/${a.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setBannerMsg({ ok: false, text: data.error || 'Could not delete appointment.' });
        return;
      }
      const syncSuffix = data.supabaseDeleted
        ? ' Removed from Supabase.'
        : data.supabaseError
          ? ` (${data.supabaseError})`
          : '';
      setBannerMsg({
        ok: true,
        text: `Deleted booking ${a.referenceCode} (${a.patientName}).${syncSuffix}`,
      });
      setConfirmAction(null);
      await loadDashboard(token);
    } finally {
      setSavingAppt(false);
    }
  }

  function exportAppointmentsCsv() {
    const headers = ['Reference', 'Patient Name', 'Mobile', 'Email', 'Treatment', 'Date', 'Time', 'Status', 'Notes'];
    const rows = filteredAppointments.map((a) => [
      a.referenceCode,
      a.patientName,
      a.mobile,
      a.email,
      a.treatmentName,
      a.appointmentDate,
      a.timeSlot,
      a.status,
      a.notes.replace(/\r?\n/g, ' '),
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `medrx-appointments-${todayStr || 'export'}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  async function saveHours() {
    if (!token || !content) return;
    setBannerMsg(null);
    const res = await fetch('/api/admin/operating-hours', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        hours: operatingHours,
        defaultDurationMinutes: content.defaultDurationMinutes,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setBannerMsg({ ok: false, text: data.error || 'Unable to save operating hours.' });
      return;
    }
    setOperatingHours(data.operatingHours);
    setContent(data.content);
    onContentUpdated();
    setBannerMsg({ ok: true, text: 'Operating hours and slot duration saved.' });
  }

  async function handleAddBlockedSlot(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    const res = await fetch('/api/admin/blocked-slots', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        blockDate,
        allDay: blockAllDay,
        startTime: blockStart,
        endTime: blockEnd,
        reason: blockReason,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setBannerMsg({ ok: false, text: data.error || 'Could not block slot.' });
      return;
    }
    setBlockedSlots(data.blockedSlots);
    setBlockReason('');
    onContentUpdated();
    setBannerMsg({ ok: true, text: 'Blocked date/slot added.' });
  }

  async function handleDeleteBlockedSlot(id: number) {
    if (!token) return;
    const res = await fetch(`/api/admin/blocked-slots/${id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (res.ok) {
      setBlockedSlots(data.blockedSlots);
      onContentUpdated();
    }
  }

  async function handleToggleTreatment(t: Treatment) {
    if (!token) return;
    const res = await fetch(`/api/admin/treatments/${t.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ isActive: !t.isActive }),
    });
    const data = await res.json();
    if (res.ok) {
      setTreatments(data.treatments);
      onContentUpdated();
    }
  }

  async function handleUpdateTreatmentDuration(t: Treatment, nextDuration: number) {
    if (!token) return;
    const res = await fetch(`/api/admin/treatments/${t.id}`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ durationMinutes: nextDuration }),
    });
    const data = await res.json();
    if (res.ok) {
      setTreatments(data.treatments);
      onContentUpdated();
      setBannerMsg({ ok: true, text: `Updated ${t.name} duration to ${nextDuration} min.` });
    }
  }

  async function handleAddTreatment(e: FormEvent) {
    e.preventDefault();
    if (!token) return;
    const res = await fetch('/api/admin/treatments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        name: newTreatmentName,
        category: newTreatmentCategory,
        durationMinutes: newTreatmentDuration,
        shortDescription: newTreatmentShort,
      }),
    });
    const data = await res.json();
    if (!res.ok) {
      setBannerMsg({ ok: false, text: data.error || 'Could not add treatment.' });
      return;
    }
    setTreatments(data.treatments);
    setNewTreatmentName('');
    setNewTreatmentShort('');
    onContentUpdated();
    setBannerMsg({ ok: true, text: 'New dental treatment added.' });
  }

  async function handleSaveContent(e: FormEvent) {
    e.preventDefault();
    if (!token || !content) return;
    const res = await fetch('/api/admin/content', {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(content),
    });
    const data = await res.json();
    if (!res.ok) {
      setBannerMsg({ ok: false, text: data.error || 'Unable to save website content.' });
      return;
    }
    setContent(data.content);
    onContentUpdated();
    setBannerMsg({ ok: true, text: 'Website content and dentist verification details updated.' });
  }

  if (authLoading) {
    return (
      <div className="min-h-[70vh] flex items-center justify-center p-6">
        <p className="text-sm text-[#142B45]/70">Checking administrator portal...</p>
      </div>
    );
  }

  // Unauthenticated Login or First-Run Claim Screen
  if (!token) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center p-4 sm:p-6 bg-[#FAF9F6]">
        <div className="w-full max-w-md bg-white rounded-2xl border border-[#142B45]/10 p-6 sm:p-8 space-y-6 shadow-sm">
          <div className="space-y-1.5">
            <div className="w-10 h-10 rounded-xl bg-[#142B45] text-white flex items-center justify-center mb-3">
              <Lock className="w-5 h-5 text-[#C6A879]" />
            </div>
            <h1 className="font-display text-2xl font-bold text-[#142B45]">
              {authStatus?.needsBootstrap ? 'Claim Clinic Admin Portal' : 'Clinic Administrator Sign In'}
            </h1>
            <p className="text-sm text-[#142B45]/70">
              {authStatus?.needsBootstrap
                ? 'First-time setup: create the clinic owner password to lock and manage MED Rx Dental Centre.'
                : authStatus?.envPasscodeActive
                  ? 'Enter your configured administrator passcode to access patient bookings and clinic settings.'
                  : 'Sign in with your clinic administrator credentials.'}
            </p>
          </div>

          {authStatus?.needsBootstrap ? (
            <form onSubmit={handleBootstrap} className="space-y-4">
              <div>
                <label htmlFor="setup-name" className="block text-xs font-semibold text-[#142B45] mb-1">
                  Administrator Name
                </label>
                <input
                  id="setup-name"
                  type="text"
                  required
                  value={setupName}
                  onChange={(e) => setSetupName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#142B45]/20 bg-[#FAF9F6] text-sm"
                />
              </div>
              <div>
                <label htmlFor="setup-email" className="block text-xs font-semibold text-[#142B45] mb-1">
                  Administrator Email
                </label>
                <input
                  id="setup-email"
                  type="email"
                  required
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  placeholder="owner@medrxdental.in"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#142B45]/20 bg-[#FAF9F6] text-sm"
                />
              </div>
              <div>
                <label htmlFor="setup-pass" className="block text-xs font-semibold text-[#142B45] mb-1">
                  Set Password (minimum 8 characters)
                </label>
                <input
                  id="setup-pass"
                  type="password"
                  required
                  minLength={8}
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  placeholder="Choose a strong password"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#142B45]/20 bg-[#FAF9F6] text-sm"
                />
              </div>
              {authError && <p className="text-xs text-red-700 font-medium">{authError}</p>}
              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-lg bg-[#142B45] text-white text-sm font-semibold hover:bg-[#159C98] transition-colors"
              >
                Create Admin Account & Enter
              </button>
            </form>
          ) : (
            <form onSubmit={handleLogin} className="space-y-4">
              {!authStatus?.envPasscodeActive && (
                <div>
                  <label htmlFor="login-email" className="block text-xs font-semibold text-[#142B45] mb-1">
                    Administrator Email
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    required
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    placeholder="owner@medrxdental.in"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#142B45]/20 bg-[#FAF9F6] text-sm"
                  />
                </div>
              )}
              <div>
                <label htmlFor="login-pass" className="block text-xs font-semibold text-[#142B45] mb-1">
                  {authStatus?.envPasscodeActive ? 'Administrator Passcode' : 'Password'}
                </label>
                <input
                  id="login-pass"
                  type="password"
                  required
                  value={passwordInput}
                  onChange={(e) => setPasswordInput(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#142B45]/20 bg-[#FAF9F6] text-sm"
                />
              </div>
              {authError && <p className="text-xs text-red-700 font-medium">{authError}</p>}
              <button
                type="submit"
                className="w-full py-2.5 px-4 rounded-lg bg-[#142B45] text-white text-sm font-semibold hover:bg-[#159C98] transition-colors"
              >
                Sign In to Dashboard
              </button>
            </form>
          )}

          <div className="pt-3 border-t border-[#142B45]/10 flex justify-between items-center text-xs">
            <button type="button" onClick={onBackToSite} className="text-[#159C98] font-medium hover:underline">
              Return to Clinic Website
            </button>
            <span className="text-[#142B45]/50">Role-protected</span>
          </div>
        </div>
      </div>
    );
  }

  const sidebarNav: Array<{ id: AdminTab; label: string; icon: typeof Calendar }> = [
    { id: 'overview', label: 'Overview', icon: ShieldCheck },
    { id: 'appointments', label: 'Appointments', icon: Calendar },
    { id: 'schedule', label: 'Hours & Blocks', icon: Clock },
    { id: 'treatments', label: 'Treatments', icon: Stethoscope },
    { id: 'content', label: 'Website Content', icon: FileText },
    { id: 'notifications', label: 'Alerts & Integrations', icon: Bell },
  ];

  const statusTone = (status: AppointmentStatus) => {
    switch (status) {
      case 'Confirmed':
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
      case 'Pending':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'Completed':
        return 'bg-slate-100 text-slate-800 border-slate-200';
      case 'Cancelled':
        return 'bg-red-50 text-red-800 border-red-200';
      case 'No-show':
        return 'bg-rose-50 text-rose-800 border-rose-200';
    }
  };

  return (
    <div className="min-h-screen bg-[#EEF1F4]/60 flex flex-col lg:flex-row">
      {/* Sidebar */}
      <aside className="lg:w-64 shrink-0 bg-[#142B45] text-white flex flex-col justify-between p-5">
        <div className="space-y-6">
          <div className="pb-4 border-b border-white/10">
            <p className="text-xs text-[#C6A879] font-medium">Clinic Administration</p>
            <p className="font-display font-bold text-base mt-0.5">MED Rx Dental Centre</p>
          </div>

          <nav className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-1 gap-1.5" aria-label="Admin sections">
            {sidebarNav.map((item) => {
              const Icon = item.icon;
              const active = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg text-xs font-medium text-left transition-colors ${
                    active ? 'bg-[#159C98] text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4 shrink-0" />
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="pt-6 mt-6 border-t border-white/10 space-y-2 text-xs">
          <p className="text-white/70 truncate">{adminUser?.name}</p>
          <div className="flex items-center justify-between gap-2">
            <button type="button" onClick={onBackToSite} className="text-[#C6A879] hover:underline">
              Public Site
            </button>
            <button
              type="button"
              onClick={() => {
                setToken(null);
                setAdminUser(null);
              }}
              className="inline-flex items-center gap-1 text-white/75 hover:text-white"
            >
              <LogOut className="w-3.5 h-3.5" />
              Sign Out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#142B45]/10 pb-4">
          <div>
            <p className="text-xs text-[#142B45]/60">
              Admin Console / {sidebarNav.find((n) => n.id === activeTab)?.label}
            </p>
            <h1 className="font-display text-2xl font-bold text-[#142B45] mt-0.5">
              {sidebarNav.find((n) => n.id === activeTab)?.label}
            </h1>
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={() => token && loadDashboard(token)}
              className="px-3.5 py-2 rounded-lg border border-[#142B45]/15 bg-white text-xs font-medium text-[#142B45] hover:bg-[#FAF9F6]"
            >
              {loadingData ? 'Refreshing...' : 'Refresh Data'}
            </button>
            <button
              type="button"
              onClick={exportAppointmentsCsv}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#142B45] text-white text-xs font-semibold hover:bg-[#159C98]"
            >
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </button>
          </div>
        </div>

        {bannerMsg && (
          <div
            role="status"
            className={`p-3.5 rounded-lg border text-xs font-medium flex items-center justify-between ${
              bannerMsg.ok
                ? 'bg-[#159C98]/10 border-[#159C98]/25 text-[#142B45]'
                : 'bg-red-50 border-red-200 text-red-800'
            }`}
          >
            <span>{bannerMsg.text}</span>
            <button type="button" onClick={() => setBannerMsg(null)} aria-label="Dismiss notification">
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* OVERVIEW TAB */}
        {activeTab === 'overview' && stats && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Pending Requests', value: stats.pending, note: 'Awaiting clinic confirmation' },
                { label: 'Upcoming Active', value: stats.upcomingCount, note: 'Pending + Confirmed' },
                { label: 'Today (IST)', value: stats.todayCount, note: todayStr },
                { label: 'Total Records', value: stats.total, note: `${stats.completed} completed` },
              ].map((kpi) => (
                <div key={kpi.label} className="bg-white rounded-xl border border-[#142B45]/10 p-5">
                  <p className="text-xs text-[#142B45]/60">{kpi.label}</p>
                  <p className="font-display text-3xl font-bold text-[#142B45] tabular-nums mt-1">{kpi.value}</p>
                  <p className="text-xs text-[#142B45]/55 mt-1">{kpi.note}</p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl border border-[#142B45]/10 overflow-hidden">
              <div className="px-5 py-4 border-b border-[#142B45]/10 flex items-center justify-between">
                <h2 className="font-display font-semibold text-[#142B45] text-base">
                  Pending Appointment Requests
                </h2>
                <button
                  type="button"
                  onClick={() => {
                    setStatusFilter('Pending');
                    setActiveTab('appointments');
                  }}
                  className="text-xs font-medium text-[#159C98] hover:underline"
                >
                  View All Appointments
                </button>
              </div>
              {appointments.filter((a) => a.status === 'Pending').length === 0 ? (
                <div className="p-8 text-center text-sm text-[#142B45]/65">
                  No pending appointment requests right now.
                </div>
              ) : (
                <div className="divide-y divide-[#142B45]/10">
                  {appointments
                    .filter((a) => a.status === 'Pending')
                    .slice(0, 8)
                    .map((a) => (
                      <div key={a.id} className="p-4 sm:px-5 flex flex-wrap items-center justify-between gap-4">
                        <div className="space-y-0.5">
                          <p className="font-semibold text-sm text-[#142B45]">
                            {a.patientName}{' '}
                            <span className="font-normal text-xs text-[#142B45]/60 tabular-nums">
                              · {a.mobile} · {a.referenceCode}
                            </span>
                          </p>
                          <p className="text-xs text-[#142B45]/75 tabular-nums">
                            {a.treatmentName} · {a.appointmentDate} at {formatTime12h(a.timeSlot)} IST
                          </p>
                          {a.rescheduleRequest && (
                            <p className="text-xs text-amber-700 font-medium">{a.rescheduleRequest}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => updateAppointment(a.id, { status: 'Confirmed' })}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-[#159C98] text-white text-xs font-semibold hover:bg-[#142B45]"
                          >
                            <Check className="w-3.5 h-3.5" />
                            Approve & Confirm
                          </button>
                          <button
                            type="button"
                            onClick={() => updateAppointment(a.id, { status: 'Cancelled' })}
                            className="px-3 py-1.5 rounded-lg border border-red-200 text-red-700 text-xs font-medium hover:bg-red-50"
                          >
                            Reject
                          </button>
                        </div>
                      </div>
                    ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* APPOINTMENTS TAB */}
        {activeTab === 'appointments' && (
          <div className="space-y-5">
            {stats && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {[
                  { label: 'Total Bookings', value: stats.total, note: `${stats.completed} completed` },
                  { label: 'Pending Review', value: stats.pending, note: 'Awaiting confirmation' },
                  { label: 'Confirmed', value: stats.confirmed, note: `${stats.upcomingCount} upcoming active` },
                  { label: 'Cancelled / No-show', value: stats.cancelled + stats.noShow, note: `Today (IST): ${stats.todayCount}` },
                ].map((kpi) => (
                  <div key={kpi.label} className="bg-white rounded-xl border border-[#142B45]/10 p-4">
                    <p className="text-xs text-[#142B45]/60">{kpi.label}</p>
                    <p className="font-display text-2xl font-bold text-[#142B45] tabular-nums mt-1">{kpi.value}</p>
                    <p className="text-[11px] text-[#142B45]/55 mt-1 tabular-nums">{kpi.note}</p>
                  </div>
                ))}
              </div>
            )}

            <div className="bg-white rounded-xl border border-[#142B45]/10 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2.5 text-[#142B45]/80">
                <Database className="w-4 h-4 text-[#159C98] shrink-0" />
                <span>
                  <strong className="text-[#142B45]">
                    {supabaseStatus?.mode === 'service_role'
                      ? 'Live Supabase + Clinic Database Sync Active'
                      : 'Clinic Database Active · Supabase Intake Connected'}
                  </strong>
                  {supabaseSyncNote ? ` — ${supabaseSyncNote}` : ''}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('notifications')}
                className="text-[#159C98] font-semibold hover:underline shrink-0"
              >
                Supabase Settings
              </button>
            </div>

            <div className="bg-white rounded-xl border border-[#142B45]/10 p-4 grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <div className="relative">
                <Search className="w-4 h-4 text-[#142B45]/45 absolute left-3 top-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search name, mobile, or ref..."
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-[#142B45]/15 bg-[#FAF9F6] text-xs text-[#142B45]"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                className="px-3 py-2 rounded-lg border border-[#142B45]/15 bg-[#FAF9F6] text-xs text-[#142B45]"
              >
                <option value="ALL">All Statuses</option>
                <option value="UPCOMING">Upcoming Active</option>
                <option value="Pending">Pending</option>
                <option value="Confirmed">Confirmed</option>
                <option value="Completed">Completed</option>
                <option value="Cancelled">Cancelled</option>
                <option value="No-show">No-show</option>
              </select>
              <input
                type="date"
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value)}
                className="px-3 py-2 rounded-lg border border-[#142B45]/15 bg-[#FAF9F6] text-xs text-[#142B45] tabular-nums"
              />
              <div className="flex items-center gap-2">
                <select
                  value={treatmentFilter}
                  onChange={(e) => setTreatmentFilter(e.target.value)}
                  className="flex-1 px-3 py-2 rounded-lg border border-[#142B45]/15 bg-[#FAF9F6] text-xs text-[#142B45]"
                >
                  <option value="">All Treatments</option>
                  {treatments.map((t) => (
                    <option key={t.id} value={t.name}>
                      {t.name}
                    </option>
                  ))}
                </select>
                {(searchQuery || statusFilter !== 'ALL' || dateFilter || treatmentFilter) && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setStatusFilter('ALL');
                      setDateFilter('');
                      setTreatmentFilter('');
                    }}
                    className="px-2.5 py-2 rounded-lg border border-[#142B45]/15 text-xs text-[#142B45]/75 hover:bg-[#FAF9F6]"
                  >
                    Clear
                  </button>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl border border-[#142B45]/10 overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-[#142B45]/10 bg-[#FAF9F6] text-[#142B45]/70">
                    <th className="py-3 px-4 font-semibold">Ref</th>
                    <th className="py-3 px-4 font-semibold">Patient & Contact</th>
                    <th className="py-3 px-4 font-semibold">Treatment & Dentist</th>
                    <th className="py-3 px-4 font-semibold">Date & Time (IST)</th>
                    <th className="py-3 px-4 font-semibold">Status</th>
                    <th className="py-3 px-4 font-semibold text-right">Manage</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#142B45]/10">
                  {filteredAppointments.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="py-12 text-center text-[#142B45]/60">
                        {appointments.length === 0
                          ? 'No appointments in the database yet. Bookings submitted from the clinic booking form will appear here.'
                          : 'No appointments match your current search or filters.'}
                      </td>
                    </tr>
                  ) : (
                    filteredAppointments.map((a) => (
                      <tr key={a.id} className="hover:bg-[#FAF9F6]/70">
                        <td className="py-3 px-4 font-semibold tabular-nums text-[#142B45] whitespace-nowrap align-top">
                          {a.referenceCode}
                        </td>
                        <td className="py-3 px-4 align-top">
                          <p className="font-semibold text-[#142B45]">{a.patientName}</p>
                          <p className="text-[#142B45]/70 tabular-nums">
                            {a.mobile}
                            {a.email ? ` · ${a.email}` : ''}
                          </p>
                          {a.notes && <p className="text-[#142B45]/60 italic mt-0.5 max-w-xs truncate">{a.notes}</p>}
                          {a.rescheduleRequest && (
                            <p className="text-amber-700 font-medium mt-0.5">{a.rescheduleRequest}</p>
                          )}
                        </td>
                        <td className="py-3 px-4 text-[#142B45] align-top">
                          <p className="font-medium">{a.treatmentName}</p>
                          <p className="text-[11px] text-[#142B45]/60 tabular-nums">
                            {a.preferredDentist} · {a.durationMinutes} min
                          </p>
                        </td>
                        <td className="py-3 px-4 tabular-nums whitespace-nowrap text-[#142B45] align-top">
                          <p className="font-medium">{a.appointmentDate}</p>
                          <p className="text-[11px] text-[#142B45]/70">{formatTime12h(a.timeSlot)} IST</p>
                        </td>
                        <td className="py-3 px-4 align-top">
                          <select
                            aria-label={`Change status for ${a.patientName}`}
                            value={a.status}
                            disabled={savingAppt}
                            onChange={(e) => updateAppointment(a.id, { status: e.target.value as AppointmentStatus })}
                            className={`px-2 py-1 rounded border text-[11px] font-semibold ${statusTone(a.status)}`}
                          >
                            <option value="Pending">Pending</option>
                            <option value="Confirmed">Confirmed</option>
                            <option value="Completed">Completed</option>
                            <option value="Cancelled">Cancelled</option>
                            <option value="No-show">No-show</option>
                          </select>
                        </td>
                        <td className="py-3 px-4 text-right whitespace-nowrap align-top">
                          <div className="inline-flex items-center gap-1.5">
                            {a.status === 'Pending' && (
                              <button
                                type="button"
                                disabled={savingAppt}
                                onClick={() => updateAppointment(a.id, { status: 'Confirmed' })}
                                className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#159C98] text-white font-semibold hover:bg-[#142B45] transition-colors"
                              >
                                <Check className="w-3.5 h-3.5" />
                                Confirm
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={savingAppt}
                              onClick={() => openEditModal(a)}
                              className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-[#142B45]/20 text-[#142B45] font-medium hover:bg-[#EEF1F4]"
                            >
                              <Pencil className="w-3 h-3" />
                              Edit
                            </button>
                            {a.status !== 'Cancelled' && a.status !== 'Completed' && (
                              <button
                                type="button"
                                disabled={savingAppt}
                                onClick={() => setConfirmAction({ type: 'cancel', appointment: a })}
                                className="px-2.5 py-1 rounded border border-red-200 text-red-700 font-medium hover:bg-red-50"
                              >
                                Cancel
                              </button>
                            )}
                            <button
                              type="button"
                              disabled={savingAppt}
                              onClick={() => setConfirmAction({ type: 'delete', appointment: a })}
                              aria-label={`Delete appointment ${a.referenceCode}`}
                              title="Delete booking record"
                              className="p-1.5 rounded border border-transparent text-[#142B45]/55 hover:text-red-700 hover:bg-red-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {editingAppt && (
              <div className="fixed inset-0 z-50 bg-[#142B45]/55 flex items-center justify-center p-4 overflow-y-auto">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    updateAppointment(editingAppt.id, {
                      patientName: editPatientName,
                      mobile: editMobile,
                      email: editEmail,
                      treatmentId: editTreatmentId === '' ? null : Number(editTreatmentId),
                      preferredDentist: editDentist,
                      appointmentDate: editDate,
                      timeSlot: editTime,
                      status: editStatus,
                      notes: editNotes,
                    });
                  }}
                  className="bg-white rounded-2xl border border-[#142B45]/10 max-w-lg w-full p-6 space-y-4 my-auto"
                >
                  <div className="flex items-center justify-between border-b border-[#142B45]/10 pb-3">
                    <div>
                      <p className="text-[11px] font-semibold text-[#159C98] tabular-nums">{editingAppt.referenceCode}</p>
                      <h3 className="font-display font-bold text-base text-[#142B45]">
                        Edit Appointment Details
                      </h3>
                    </div>
                    <button
                      type="button"
                      onClick={() => setEditingAppt(null)}
                      aria-label="Close edit dialog"
                      className="p-1 rounded-lg hover:bg-[#EEF1F4]"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3 text-xs">
                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-[#142B45] mb-1">Patient Full Name *</label>
                      <input
                        type="text"
                        required
                        value={editPatientName}
                        onChange={(e) => setEditPatientName(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-[#142B45]/20 bg-[#FAF9F6]"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#142B45] mb-1">Mobile Number *</label>
                      <input
                        type="tel"
                        required
                        value={editMobile}
                        onChange={(e) => setEditMobile(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-[#142B45]/20 bg-[#FAF9F6] tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#142B45] mb-1">Email Address</label>
                      <input
                        type="email"
                        value={editEmail}
                        onChange={(e) => setEditEmail(e.target.value)}
                        placeholder="Optional"
                        className="w-full px-3 py-2 rounded-lg border border-[#142B45]/20 bg-[#FAF9F6]"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#142B45] mb-1">Dental Treatment</label>
                      <select
                        value={editTreatmentId}
                        onChange={(e) => setEditTreatmentId(e.target.value ? Number(e.target.value) : '')}
                        className="w-full px-3 py-2 rounded-lg border border-[#142B45]/20 bg-[#FAF9F6]"
                      >
                        {treatments.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.durationMinutes} min)
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="block font-semibold text-[#142B45] mb-1">Preferred Dentist</label>
                      <input
                        type="text"
                        value={editDentist}
                        onChange={(e) => setEditDentist(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-[#142B45]/20 bg-[#FAF9F6]"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#142B45] mb-1">Date *</label>
                      <input
                        type="date"
                        required
                        value={editDate}
                        onChange={(e) => setEditDate(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-[#142B45]/20 bg-[#FAF9F6] tabular-nums"
                      />
                    </div>
                    <div>
                      <label className="block font-semibold text-[#142B45] mb-1">Time (HH:mm IST) *</label>
                      <input
                        type="time"
                        required
                        value={editTime}
                        onChange={(e) => setEditTime(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-[#142B45]/20 bg-[#FAF9F6] tabular-nums"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-[#142B45] mb-1">Appointment Status</label>
                      <select
                        value={editStatus}
                        onChange={(e) => setEditStatus(e.target.value as AppointmentStatus)}
                        className="w-full px-3 py-2 rounded-lg border border-[#142B45]/20 bg-[#FAF9F6]"
                      >
                        <option value="Pending">Pending</option>
                        <option value="Confirmed">Confirmed</option>
                        <option value="Completed">Completed</option>
                        <option value="Cancelled">Cancelled</option>
                        <option value="No-show">No-show</option>
                      </select>
                    </div>
                    <div className="sm:col-span-2">
                      <label className="block font-semibold text-[#142B45] mb-1">Patient / Clinic Notes</label>
                      <textarea
                        rows={3}
                        value={editNotes}
                        onChange={(e) => setEditNotes(e.target.value)}
                        className="w-full px-3 py-2 rounded-lg border border-[#142B45]/20 bg-[#FAF9F6]"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-2 border-t border-[#142B45]/10">
                    <button
                      type="button"
                      onClick={() => setEditingAppt(null)}
                      className="px-4 py-2 rounded-lg border border-[#142B45]/15 text-xs font-medium text-[#142B45]"
                    >
                      Close
                    </button>
                    <button
                      type="submit"
                      disabled={savingAppt}
                      className="px-4 py-2 rounded-lg bg-[#142B45] text-white text-xs font-semibold hover:bg-[#159C98] disabled:opacity-60"
                    >
                      {savingAppt ? 'Saving...' : 'Save Changes'}
                    </button>
                  </div>
                </form>
              </div>
            )}

            {confirmAction && (
              <div className="fixed inset-0 z-50 bg-[#142B45]/55 flex items-center justify-center p-4">
                <div className="bg-white rounded-2xl border border-[#142B45]/10 max-w-md w-full p-6 space-y-4">
                  <div className="space-y-1.5">
                    <h3 className="font-display font-bold text-base text-[#142B45]">
                      {confirmAction.type === 'cancel' ? 'Cancel Appointment?' : 'Delete Booking Record?'}
                    </h3>
                    <p className="text-xs text-[#142B45]/75 leading-relaxed">
                      {confirmAction.type === 'cancel'
                        ? `Mark booking ${confirmAction.appointment.referenceCode} for ${confirmAction.appointment.patientName} (${confirmAction.appointment.appointmentDate} at ${formatTime12h(confirmAction.appointment.timeSlot)} IST) as Cancelled?`
                        : `Permanently delete booking ${confirmAction.appointment.referenceCode} for ${confirmAction.appointment.patientName}? This removes the record from the clinic database.`}
                    </p>
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      disabled={savingAppt}
                      onClick={() => setConfirmAction(null)}
                      className="px-4 py-2 rounded-lg border border-[#142B45]/15 text-xs font-medium text-[#142B45]"
                    >
                      Keep Record
                    </button>
                    <button
                      type="button"
                      disabled={savingAppt}
                      onClick={() => {
                        if (confirmAction.type === 'cancel') {
                          updateAppointment(confirmAction.appointment.id, { status: 'Cancelled' });
                        } else {
                          deleteAppointment(confirmAction.appointment);
                        }
                      }}
                      className="px-4 py-2 rounded-lg bg-red-700 text-white text-xs font-semibold hover:bg-red-800 disabled:opacity-60"
                    >
                      {savingAppt
                        ? 'Updating...'
                        : confirmAction.type === 'cancel'
                          ? 'Confirm Cancellation'
                          : 'Delete Permanently'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* SCHEDULE & BLOCKS TAB */}
        {activeTab === 'schedule' && content && (
          <div className="grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-7 bg-white rounded-xl border border-[#142B45]/10 p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-semibold text-base text-[#142B45] flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-[#159C98]" />
                  Clinic Operating Hours & Slot Configuration
                </h2>
                <button
                  type="button"
                  onClick={saveHours}
                  className="px-4 py-2 rounded-lg bg-[#142B45] text-white text-xs font-semibold hover:bg-[#159C98]"
                >
                  Save Schedule
                </button>
              </div>

              <div className="flex items-center gap-3 text-xs bg-[#FAF9F6] p-3 rounded-lg border border-[#142B45]/10">
                <label htmlFor="default-duration" className="font-semibold text-[#142B45]">
                  Default Appointment Duration (minutes):
                </label>
                <input
                  id="default-duration"
                  type="number"
                  min={15}
                  max={120}
                  step={15}
                  value={content.defaultDurationMinutes}
                  onChange={(e) => setContent({ ...content, defaultDurationMinutes: Number(e.target.value) })}
                  className="w-20 px-2.5 py-1 rounded border border-[#142B45]/20 bg-white tabular-nums"
                />
              </div>

              <div className="divide-y divide-[#142B45]/10 text-xs">
                {operatingHours.map((h, idx) => (
                  <div key={h.dayOfWeek} className="py-3 flex flex-wrap items-center justify-between gap-3">
                    <label className="flex items-center gap-2 w-28 font-semibold text-[#142B45]">
                      <input
                        type="checkbox"
                        checked={h.isOpen}
                        onChange={(e) => {
                          const next = [...operatingHours];
                          next[idx] = { ...h, isOpen: e.target.checked };
                          setOperatingHours(next);
                        }}
                      />
                      {h.dayName}
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="time"
                        disabled={!h.isOpen}
                        value={h.openTime}
                        onChange={(e) => {
                          const next = [...operatingHours];
                          next[idx] = { ...h, openTime: e.target.value };
                          setOperatingHours(next);
                        }}
                        className="px-2 py-1 rounded border border-[#142B45]/20 tabular-nums"
                      />
                      <span>to</span>
                      <input
                        type="time"
                        disabled={!h.isOpen}
                        value={h.closeTime}
                        onChange={(e) => {
                          const next = [...operatingHours];
                          next[idx] = { ...h, closeTime: e.target.value };
                          setOperatingHours(next);
                        }}
                        className="px-2 py-1 rounded border border-[#142B45]/20 tabular-nums"
                      />
                    </div>
                    <div className="flex items-center gap-1.5">
                      <span className="text-[#142B45]/60">Interval:</span>
                      <select
                        value={h.slotIntervalMinutes}
                        onChange={(e) => {
                          const next = [...operatingHours];
                          next[idx] = { ...h, slotIntervalMinutes: Number(e.target.value) };
                          setOperatingHours(next);
                        }}
                        className="px-2 py-1 rounded border border-[#142B45]/20 tabular-nums"
                      >
                        <option value={15}>15 min</option>
                        <option value={30}>30 min</option>
                        <option value={45}>45 min</option>
                        <option value={60}>60 min</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="lg:col-span-5 bg-white rounded-xl border border-[#142B45]/10 p-6 space-y-5 self-start">
              <h2 className="font-display font-semibold text-base text-[#142B45]">Block Unavailable Dates / Slots</h2>
              <form onSubmit={handleAddBlockedSlot} className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold mb-1">Date to Block</label>
                  <input
                    type="date"
                    required
                    value={blockDate}
                    onChange={(e) => setBlockDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-lg border border-[#142B45]/20 tabular-nums"
                  />
                </div>
                <label className="flex items-center gap-2 font-medium">
                  <input
                    type="checkbox"
                    checked={blockAllDay}
                    onChange={(e) => setBlockAllDay(e.target.checked)}
                  />
                  Block entire day (Public Holiday / Clinic Leave)
                </label>
                {!blockAllDay && (
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="time"
                      value={blockStart}
                      onChange={(e) => setBlockStart(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-[#142B45]/20 tabular-nums"
                    />
                    <input
                      type="time"
                      value={blockEnd}
                      onChange={(e) => setBlockEnd(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-[#142B45]/20 tabular-nums"
                    />
                  </div>
                )}
                <input
                  type="text"
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  placeholder="Reason (e.g. Festival Holiday, Maintenance)"
                  className="w-full px-3 py-2 rounded-lg border border-[#142B45]/20"
                />
                <button
                  type="submit"
                  className="w-full py-2 rounded-lg bg-[#142B45] text-white font-semibold hover:bg-[#159C98]"
                >
                  Block Date / Time
                </button>
              </form>

              <div className="pt-4 border-t border-[#142B45]/10 space-y-2 text-xs">
                <p className="font-semibold text-[#142B45]">Active Blocks ({blockedSlots.length})</p>
                {blockedSlots.length === 0 ? (
                  <p className="text-[#142B45]/60">No blocked dates or time ranges configured.</p>
                ) : (
                  blockedSlots.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-lg bg-[#FAF9F6] border border-[#142B45]/10"
                    >
                      <div>
                        <p className="font-semibold tabular-nums text-[#142B45]">
                          {b.blockDate} · {b.allDay ? 'All Day' : `${b.startTime} – ${b.endTime}`}
                        </p>
                        <p className="text-[#142B45]/65">{b.reason || 'Unavailable'}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleDeleteBlockedSlot(b.id)}
                        className="p-1.5 text-red-700 hover:bg-red-50 rounded"
                        aria-label="Remove block"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        )}

        {/* TREATMENTS TAB */}
        {activeTab === 'treatments' && (
          <div className="grid lg:grid-cols-12 gap-6">
            <div className="lg:col-span-8 bg-white rounded-xl border border-[#142B45]/10 overflow-hidden">
              <div className="px-5 py-4 border-b border-[#142B45]/10">
                <h2 className="font-display font-semibold text-base text-[#142B45]">
                  Dental Services Catalog ({treatments.length})
                </h2>
              </div>
              <div className="divide-y divide-[#142B45]/10 text-xs">
                {treatments.map((t) => (
                  <div key={t.id} className="p-4 flex flex-wrap items-center justify-between gap-4">
                    <div className="max-w-md space-y-0.5">
                      <p className="font-semibold text-sm text-[#142B45]">{t.name}</p>
                      <p className="text-[#142B45]/60">{t.category}</p>
                      <p className="text-[#142B45]/75">{t.shortDescription}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <select
                        value={t.durationMinutes}
                        onChange={(e) => handleUpdateTreatmentDuration(t, Number(e.target.value))}
                        className="px-2 py-1.5 rounded border border-[#142B45]/20 tabular-nums"
                      >
                        <option value={15}>15 min</option>
                        <option value={30}>30 min</option>
                        <option value={45}>45 min</option>
                        <option value={60}>60 min</option>
                        <option value={90}>90 min</option>
                      </select>
                      <button
                        type="button"
                        onClick={() => handleToggleTreatment(t)}
                        className={`px-3 py-1.5 rounded-lg font-semibold ${
                          t.isActive
                            ? 'bg-[#159C98]/15 text-[#142B45]'
                            : 'bg-[#EEF1F4] text-[#142B45]/55'
                        }`}
                      >
                        {t.isActive ? 'Active' : 'Hidden'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <form
              onSubmit={handleAddTreatment}
              className="lg:col-span-4 bg-white rounded-xl border border-[#142B45]/10 p-6 space-y-4 self-start text-xs"
            >
              <h3 className="font-display font-semibold text-base text-[#142B45] flex items-center gap-2">
                <Plus className="w-4 h-4 text-[#159C98]" />
                Add Dental Treatment
              </h3>
              <div>
                <label className="block font-semibold mb-1">Treatment Name *</label>
                <input
                  type="text"
                  required
                  value={newTreatmentName}
                  onChange={(e) => setNewTreatmentName(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#142B45]/20"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Category</label>
                <select
                  value={newTreatmentCategory}
                  onChange={(e) => setNewTreatmentCategory(e.target.value as Treatment['category'])}
                  className="w-full px-3 py-2 rounded-lg border border-[#142B45]/20"
                >
                  <option value="General Dentistry">General Dentistry</option>
                  <option value="Restorative Care">Restorative Care</option>
                  <option value="Cosmetic & Orthodontics">Cosmetic & Orthodontics</option>
                  <option value="Pediatric & Surgical">Pediatric & Surgical</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Slot Duration (minutes)</label>
                <input
                  type="number"
                  min={15}
                  max={180}
                  step={15}
                  value={newTreatmentDuration}
                  onChange={(e) => setNewTreatmentDuration(Number(e.target.value))}
                  className="w-full px-3 py-2 rounded-lg border border-[#142B45]/20 tabular-nums"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Patient-Friendly Summary *</label>
                <textarea
                  rows={3}
                  required
                  value={newTreatmentShort}
                  onChange={(e) => setNewTreatmentShort(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-[#142B45]/20"
                />
              </div>
              <button
                type="submit"
                className="w-full py-2.5 rounded-lg bg-[#142B45] text-white font-semibold hover:bg-[#159C98]"
              >
                Add Treatment
              </button>
            </form>
          </div>
        )}

        {/* WEBSITE CONTENT & VERIFICATION TAB */}
        {activeTab === 'content' && content && (
          <form onSubmit={handleSaveContent} className="space-y-6">
            <div className="bg-white rounded-xl border border-[#142B45]/10 p-6 space-y-4 text-xs">
              <div className="flex items-center justify-between">
                <h2 className="font-display font-semibold text-base text-[#142B45]">
                  Homepage Copy & Messaging
                </h2>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-[#142B45] text-white font-semibold hover:bg-[#159C98]"
                >
                  Save All Content
                </button>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold mb-1">Hero Headline</label>
                  <input
                    type="text"
                    value={content.heroHeadline}
                    onChange={(e) => setContent({ ...content, heroHeadline: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-[#142B45]/20"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">About Section Headline</label>
                  <input
                    type="text"
                    value={content.aboutHeadline}
                    onChange={(e) => setContent({ ...content, aboutHeadline: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-[#142B45]/20"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold mb-1">Hero Subheading</label>
                <textarea
                  rows={2}
                  value={content.heroSubheading}
                  onChange={(e) => setContent({ ...content, heroSubheading: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[#142B45]/20"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Clinic Story</label>
                <textarea
                  rows={3}
                  value={content.aboutStory}
                  onChange={(e) => setContent({ ...content, aboutStory: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-[#142B45]/20"
                />
              </div>
            </div>

            {/* Dentist Profile Verification Editor */}
            <div className="bg-white rounded-xl border border-[#142B45]/10 p-6 space-y-4 text-xs">
              <h2 className="font-display font-semibold text-base text-[#142B45]">
                Dentist Profile Verification (Dr. Abdul Khadir)
              </h2>
              <div className="grid md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold mb-1">Dentist Name (Verify Spelling)</label>
                  <input
                    type="text"
                    value={content.dentist.name}
                    onChange={(e) =>
                      setContent({ ...content, dentist: { ...content.dentist, name: e.target.value } })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[#142B45]/20"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Professional Designation</label>
                  <input
                    type="text"
                    value={content.dentist.designation}
                    onChange={(e) =>
                      setContent({
                        ...content,
                        dentist: { ...content.dentist, designation: e.target.value, designationVerified: true },
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[#142B45]/20"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Verified Qualifications (e.g., BDS, MDS)</label>
                  <input
                    type="text"
                    value={content.dentist.qualifications}
                    onChange={(e) =>
                      setContent({
                        ...content,
                        dentist: { ...content.dentist, qualifications: e.target.value, qualificationsVerified: true },
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[#142B45]/20"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Verified Years of Experience</label>
                  <input
                    type="text"
                    value={content.dentist.experience}
                    onChange={(e) =>
                      setContent({
                        ...content,
                        dentist: { ...content.dentist, experience: e.target.value, experienceVerified: true },
                      })
                    }
                    className="w-full px-3 py-2 rounded-lg border border-[#142B45]/20"
                  />
                </div>
              </div>
              <div>
                <label className="block font-semibold mb-1">Professional Introduction</label>
                <textarea
                  rows={3}
                  value={content.dentist.bio}
                  onChange={(e) =>
                    setContent({ ...content, dentist: { ...content.dentist, bio: e.target.value } })
                  }
                  className="w-full px-3 py-2 rounded-lg border border-[#142B45]/20"
                />
              </div>
            </div>

            {/* Google Rating & Verified Reviews */}
            <div className="bg-white rounded-xl border border-[#142B45]/10 p-6 space-y-4 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="font-display font-semibold text-base text-[#142B45]">
                    Google Rating & Verified Patient Reviews
                  </h2>
                  <p className="text-[#142B45]/65 mt-0.5">
                    Only publish the 5.0/5 (143 reviews) rating and patient quotes after confirming Google Business
                    Profile accuracy and reviewer permission.
                  </p>
                </div>
                <label className="inline-flex items-center gap-2 font-semibold text-[#142B45] bg-[#FAF9F6] px-3 py-2 rounded-lg border border-[#142B45]/15">
                  <input
                    type="checkbox"
                    checked={content.googleReviewsVerified}
                    onChange={(e) => setContent({ ...content, googleReviewsVerified: e.target.checked })}
                  />
                  Mark Rating & Reviews Verified for Public Display
                </label>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold mb-1">Verified Rating</label>
                  <input
                    type="text"
                    value={content.googleRatingValue}
                    onChange={(e) => setContent({ ...content, googleRatingValue: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-[#142B45]/20 tabular-nums"
                  />
                </div>
                <div>
                  <label className="block font-semibold mb-1">Verified Review Count</label>
                  <input
                    type="number"
                    value={content.googleReviewCount}
                    onChange={(e) => setContent({ ...content, googleReviewCount: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-[#142B45]/20 tabular-nums"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-[#142B45]/10 space-y-3">
                <p className="font-semibold text-[#142B45]">Add Verified Google Review</p>
                <div className="grid sm:grid-cols-3 gap-2">
                  <input
                    type="text"
                    value={newReviewAuthor}
                    onChange={(e) => setNewReviewAuthor(e.target.value)}
                    placeholder="Reviewer Name"
                    className="px-3 py-2 rounded-lg border border-[#142B45]/20"
                  />
                  <input
                    type="text"
                    value={newReviewDate}
                    onChange={(e) => setNewReviewDate(e.target.value)}
                    placeholder="Review Date (e.g. Oct 2026)"
                    className="px-3 py-2 rounded-lg border border-[#142B45]/20"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!newReviewAuthor.trim() || !newReviewText.trim()) return;
                      const next = [
                        ...content.verifiedReviews,
                        {
                          id: String(Date.now()),
                          authorName: newReviewAuthor.trim(),
                          rating: 5,
                          text: newReviewText.trim(),
                          reviewDate: newReviewDate.trim() || 'Verified Google Review',
                        },
                      ];
                      setContent({ ...content, verifiedReviews: next });
                      setNewReviewAuthor('');
                      setNewReviewDate('');
                      setNewReviewText('');
                    }}
                    className="px-3 py-2 rounded-lg bg-[#159C98] text-white font-semibold"
                  >
                    Add Verified Review
                  </button>
                </div>
                <textarea
                  rows={2}
                  value={newReviewText}
                  onChange={(e) => setNewReviewText(e.target.value)}
                  placeholder="Exact verified review text..."
                  className="w-full px-3 py-2 rounded-lg border border-[#142B45]/20"
                />
                {content.verifiedReviews.length > 0 && (
                  <div className="space-y-2">
                    {content.verifiedReviews.map((r) => (
                      <div key={r.id} className="p-3 rounded-lg bg-[#FAF9F6] border border-[#142B45]/10 flex justify-between gap-3">
                        <div>
                          <p className="font-semibold">
                            {r.authorName} · {r.rating}/5 · {r.reviewDate}
                          </p>
                          <p className="text-[#142B45]/75 mt-0.5">{r.text}</p>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            setContent({
                              ...content,
                              verifiedReviews: content.verifiedReviews.filter((x) => x.id !== r.id),
                            })
                          }
                          className="text-red-700"
                        >
                          Remove
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </form>
        )}

        {/* NOTIFICATIONS & INTEGRATIONS TAB */}
        {activeTab === 'notifications' && (
          <div className="space-y-6 text-xs">
            {/* Supabase Database Integration Panel */}
            <div className="bg-white rounded-xl border border-[#142B45]/10 p-6 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h2 className="font-display font-semibold text-base text-[#142B45] flex items-center gap-2">
                    <Database className="w-4 h-4 text-[#159C98]" />
                    Supabase Database Integration
                  </h2>
                  <p className="text-[#142B45]/70 mt-1">
                    Project ID: <strong className="text-[#142B45] font-mono">{supabaseStatus?.projectId || 'jeyrykacwcahfpelifcp'}</strong> · Region:{' '}
                    <strong className="text-[#142B45]">{supabaseStatus?.region || 'ap-south-1'}</strong> · Endpoint:{' '}
                    <span className="font-mono">{supabaseStatus?.url || 'https://jeyrykacwcahfpelifcp.supabase.co'}</span>
                  </p>
                </div>
                <span className="px-2.5 py-1 rounded-md border text-[11px] font-semibold bg-emerald-50 text-emerald-800 border-emerald-200">
                  {supabaseStatus?.mode === 'service_role'
                    ? 'Service Role Key Active'
                    : 'Publishable Key Connected'}
                </span>
              </div>

              {supabaseStatus?.mode !== 'service_role' && (
                <div className="p-4 rounded-xl bg-[#FAF9F6] border border-[#142B45]/10 space-y-1.5 text-[#142B45]/80">
                  <p className="font-semibold text-[#142B45]">Publishable Key Connected — One-Time Table Setup:</p>
                  <p>
                    New appointment bookings and contact enquiries automatically save to your Supabase project once you
                    run the SQL schema below in your Supabase SQL Editor. (Optional: add <code>SUPABASE_SERVICE_ROLE_KEY</code>{' '}
                    in AI Studio Secrets if you also want admin status updates synced back to Supabase.)
                  </p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2.5">
                <button
                  type="button"
                  disabled={supabaseBusy}
                  onClick={async () => {
                    if (!token) return;
                    setSupabaseBusy(true);
                    try {
                      const res = await fetch('/api/admin/supabase-test', {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}` },
                      });
                      const data = await res.json();
                      setSupabaseCheckResult(data);
                    } finally {
                      setSupabaseBusy(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#142B45] text-white font-semibold hover:bg-[#159C98] disabled:opacity-60"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Test Supabase Connection
                </button>

                <button
                  type="button"
                  disabled={supabaseBusy || !supabaseStatus?.keyConfigured}
                  onClick={async () => {
                    if (!token) return;
                    setSupabaseBusy(true);
                    try {
                      const res = await fetch('/api/admin/supabase-sync', {
                        method: 'POST',
                        headers: { Authorization: `Bearer ${token}` },
                      });
                      const data = await res.json();
                      setBannerMsg({
                        ok: Boolean(data.ok),
                        text: data.ok
                          ? `Synced ${data.count} appointment(s) and clinic catalog to Supabase.`
                          : data.error || 'Supabase sync failed.',
                      });
                    } finally {
                      setSupabaseBusy(false);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#142B45]/20 text-[#142B45] font-semibold hover:bg-[#FAF9F6] disabled:opacity-50"
                >
                  Sync Existing Records to Supabase
                </button>

                <button
                  type="button"
                  onClick={async () => {
                    if (!token) return;
                    const res = await fetch('/api/admin/supabase-schema', {
                      headers: { Authorization: `Bearer ${token}` },
                    });
                    const data = await res.json();
                    if (data.sql) {
                      await navigator.clipboard.writeText(data.sql);
                      setSchemaCopied(true);
                      setTimeout(() => setSchemaCopied(false), 2500);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#142B45]/20 text-[#142B45] font-semibold hover:bg-[#FAF9F6]"
                >
                  {schemaCopied ? <Check className="w-3.5 h-3.5 text-[#159C98]" /> : <Copy className="w-3.5 h-3.5" />}
                  {schemaCopied ? 'SQL Schema Copied' : 'Copy Supabase SQL Schema'}
                </button>

                <a
                  href={`https://supabase.com/dashboard/project/${supabaseStatus?.projectId || 'jeyrykacwcahfpelifcp'}/sql/new`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-[#159C98] font-semibold hover:underline"
                >
                  Open Supabase SQL Editor
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {supabaseCheckResult && (
                <div
                  className={`p-3 rounded-lg border font-medium ${
                    supabaseCheckResult.tablesReady
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  {supabaseCheckResult.message}
                </div>
              )}
            </div>

            <div className="bg-white rounded-xl border border-[#142B45]/10 p-6 space-y-4">
              <h2 className="font-display font-semibold text-base text-[#142B45]">
                Messaging Integration Readiness
              </h2>
              <div className="grid md:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-[#FAF9F6] border border-[#142B45]/10 space-y-1">
                  <p className="font-semibold text-[#142B45]">Patient & Admin Email (Resend)</p>
                  <p className={integrations?.emailConfigured ? 'text-emerald-700 font-semibold' : 'text-amber-700'}>
                    {integrations?.emailConfigured ? 'Configured & Active' : 'Pending RESEND_API_KEY in Secrets'}
                  </p>
                  <p className="text-[#142B45]/65">
                    Set <code>RESEND_API_KEY</code>, <code>EMAIL_FROM</code>, and <code>CLINIC_ADMIN_EMAIL</code>.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-[#FAF9F6] border border-[#142B45]/10 space-y-1">
                  <p className="font-semibold text-[#142B45]">WhatsApp Business Cloud API</p>
                  <p className={integrations?.whatsappConfigured ? 'text-emerald-700 font-semibold' : 'text-amber-700'}>
                    {integrations?.whatsappConfigured
                      ? 'Configured & Active'
                      : 'Pending Meta Cloud API Credentials'}
                  </p>
                  <p className="text-[#142B45]/65">
                    Set <code>WHATSAPP_ACCESS_TOKEN</code> and <code>WHATSAPP_PHONE_NUMBER_ID</code>. Patient click-to-chat
                    via +91 99720 25712 is always active.
                  </p>
                </div>
                <div className="p-4 rounded-xl bg-[#FAF9F6] border border-[#142B45]/10 space-y-1">
                  <p className="font-semibold text-[#142B45]">Website Enquiries Received</p>
                  <p className="font-display text-xl font-bold text-[#142B45] tabular-nums">{contactMessages.length}</p>
                  <p className="text-[#142B45]/65">Messages submitted through the Contact section.</p>
                </div>
              </div>
            </div>

            {contactMessages.length > 0 && (
              <div className="bg-white rounded-xl border border-[#142B45]/10 overflow-hidden">
                <div className="px-5 py-4 border-b border-[#142B45]/10 font-display font-semibold text-sm text-[#142B45]">
                  Recent Contact Enquiries
                </div>
                <div className="divide-y divide-[#142B45]/10">
                  {contactMessages.map((m) => (
                    <div key={m.id} className="p-4 flex flex-wrap justify-between gap-3">
                      <div>
                        <p className="font-semibold text-[#142B45]">
                          {m.name} · <span className="tabular-nums">{m.mobile}</span>
                        </p>
                        <p className="text-[#142B45]/75 mt-1">{m.message}</p>
                      </div>
                      <span className="text-[#142B45]/55 tabular-nums">{m.created_at}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl border border-[#142B45]/10 overflow-x-auto">
              <div className="px-5 py-4 border-b border-[#142B45]/10 font-display font-semibold text-sm text-[#142B45]">
                Notification Audit Log
              </div>
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-[#FAF9F6] border-b border-[#142B45]/10 text-[#142B45]/70">
                    <th className="py-2.5 px-4">Channel</th>
                    <th className="py-2.5 px-4">Recipient</th>
                    <th className="py-2.5 px-4">Status</th>
                    <th className="py-2.5 px-4">Detail</th>
                    <th className="py-2.5 px-4">Timestamp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#142B45]/10">
                  {notifications.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-[#142B45]/60">
                        Notification records appear automatically when bookings are submitted or updated.
                      </td>
                    </tr>
                  ) : (
                    notifications.map((n) => (
                      <tr key={n.id}>
                        <td className="py-2.5 px-4 font-semibold uppercase">{n.channel}</td>
                        <td className="py-2.5 px-4 tabular-nums">{n.recipient}</td>
                        <td className="py-2.5 px-4">{n.status}</td>
                        <td className="py-2.5 px-4 max-w-md truncate text-[#142B45]/70">{n.providerResponse}</td>
                        <td className="py-2.5 px-4 tabular-nums whitespace-nowrap text-[#142B45]/60">{n.createdAt}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

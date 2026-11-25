import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import dotenv from 'dotenv';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import {
  createSessionToken,
  getAdminAuthStatus,
  hasClaimedAdminUser,
  hashPassword,
  isEnvPasscodeConfigured,
  requireAdminAuth,
  verifyPassword,
} from './server/auth.ts';
import type { AuthenticatedRequest } from './server/auth.ts';
import {
  db,
  getClinicContent,
  initDatabase,
  listBlockedSlots,
  listNotifications,
  listOperatingHours,
  listTreatments,
  logError,
  mapAppointmentRow,
  saveClinicContent,
} from './server/db.ts';
import {
  dispatchBookingNotifications,
  dispatchStatusUpdateNotification,
  getIntegrationStatus,
} from './server/notifications.ts';
import {
  getAvailableSlotsForDate,
  getKolkataTodayAndMinutes,
  isValidDateString,
  normalizeIndianMobile,
} from './server/slots.ts';
import {
  deleteAppointmentFromSupabase,
  getSupabaseConfigStatus,
  pullAppointmentsFromSupabase,
  syncAllLocalAppointmentsToSupabase,
  syncAppointmentToSupabase,
  syncContactMessageToSupabase,
  syncReferenceDataToSupabase,
  testSupabaseConnection,
} from './server/supabase.ts';
import type { AdminStats, AppointmentStatus, ClinicContent, Treatment } from './src/types.ts';

dotenv.config();
initDatabase();

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));

// Simple sliding-window rate limiter per IP + route bucket
const rateBuckets = new Map<string, number[]>();
function rateLimit(bucket: string, maxRequests: number, windowMs: number) {
  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
    const key = `${bucket}:${ip}`;
    const now = Date.now();
    const entries = (rateBuckets.get(key) || []).filter((ts) => now - ts < windowMs);
    if (entries.length >= maxRequests) {
      res.status(429).json({
        error: 'Too many requests. Please wait a moment before trying again.',
      });
      return;
    }
    entries.push(now);
    rateBuckets.set(key, entries);
    next();
  };
}

function generateReferenceCode(): string {
  const randomPart = crypto.randomBytes(3).toString('hex').toUpperCase();
  const { todayStr } = getKolkataTodayAndMinutes();
  const compactDate = todayStr.replace(/-/g, '').slice(2);
  return `MRX-${compactDate}-${randomPart}`;
}

// ============================================================================
// SEO: Dynamic sitemap.xml & robots.txt
// ============================================================================
app.get('/robots.txt', (_req, res) => {
  const baseUrl = process.env.APP_URL?.replace(/\/$/, '') || '';
  res.type('text/plain').send(
    `User-agent: *\nAllow: /\nDisallow: /api/admin/\n${baseUrl ? `Sitemap: ${baseUrl}/sitemap.xml\n` : ''}`
  );
});

app.get('/sitemap.xml', (req, res) => {
  const host = `${req.protocol}://${req.get('host')}`;
  const baseUrl = (process.env.APP_URL || host).replace(/\/$/, '');
  const treatments = listTreatments(false);
  const urls = [
    `${baseUrl}/`,
    `${baseUrl}/#about`,
    `${baseUrl}/#treatments`,
    `${baseUrl}/#dentist`,
    `${baseUrl}/#reviews`,
    `${baseUrl}/#contact`,
    ...treatments.map((t) => `${baseUrl}/#treatment-${t.slug}`),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
    .map((u) => `  <url><loc>${u}</loc><changefreq>weekly</changefreq></url>`)
    .join('\n')}\n</urlset>`;
  res.type('application/xml').send(xml);
});

// ============================================================================
// PUBLIC API ROUTES
// ============================================================================
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timezone: 'Asia/Kolkata' });
});

app.get('/api/clinic-data', (_req, res) => {
  try {
    const treatments = listTreatments(false);
    const operatingHours = listOperatingHours();
    const content = getClinicContent();
    const { todayStr } = getKolkataTodayAndMinutes();
    const upcomingBlocked = listBlockedSlots(todayStr);

    res.json({
      treatments,
      operatingHours,
      content,
      blockedDates: upcomingBlocked.filter((b) => b.allDay).map((b) => ({
        date: b.blockDate,
        reason: b.reason,
      })),
      timezone: 'Asia/Kolkata',
    });
  } catch (err) {
    logError('/api/clinic-data', err);
    res.status(500).json({ error: 'Unable to load clinic data' });
  }
});

app.get('/api/slots', (req, res) => {
  try {
    const dateStr = String(req.query.date || '');
    const treatmentId = req.query.treatmentId ? Number(req.query.treatmentId) : null;
    let duration: number | undefined;
    if (treatmentId) {
      const t = db
        .prepare('SELECT duration_minutes FROM treatments WHERE id = ? AND is_active = 1')
        .get(treatmentId) as { duration_minutes: number } | undefined;
      if (t) duration = Number(t.duration_minutes);
    }
    const result = getAvailableSlotsForDate(dateStr, duration);
    res.json(result);
  } catch (err) {
    logError('/api/slots', err);
    res.status(500).json({ error: 'Unable to check slot availability' });
  }
});

app.post('/api/appointments', rateLimit('book', 8, 10 * 60 * 1000), async (req, res) => {
  try {
    const {
      patientName,
      mobile,
      email,
      treatmentId,
      preferredDentist,
      appointmentDate,
      timeSlot,
      notes,
      consentAccepted,
      website, // honeypot
    } = req.body as Record<string, unknown>;

    if (website && String(website).trim().length > 0) {
      res.status(400).json({ error: 'Invalid submission.' });
      return;
    }

    const cleanName = String(patientName || '').trim();
    if (cleanName.length < 2 || cleanName.length > 120) {
      res.status(400).json({ error: 'Please enter the patient full name (2–120 characters).' });
      return;
    }

    const normalizedMobile = normalizeIndianMobile(String(mobile || ''));
    if (!normalizedMobile) {
      res.status(400).json({
        error: 'Please enter a valid 10-digit Indian mobile number (starting with 6–9).',
      });
      return;
    }

    const cleanEmail = String(email || '').trim();
    if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ error: 'Please enter a valid email address or leave it blank.' });
      return;
    }

    if (!consentAccepted) {
      res.status(400).json({ error: 'Please accept the privacy policy to submit your appointment request.' });
      return;
    }

    const cleanDate = String(appointmentDate || '').trim();
    const cleanTime = String(timeSlot || '').trim();
    if (!isValidDateString(cleanDate) || !/^\d{2}:\d{2}$/.test(cleanTime)) {
      res.status(400).json({ error: 'Please select a valid appointment date and time slot.' });
      return;
    }

    const treatmentRow = treatmentId
      ? (db
          .prepare('SELECT id, name, duration_minutes FROM treatments WHERE id = ? AND is_active = 1')
          .get(Number(treatmentId)) as { id: number; name: string; duration_minutes: number } | undefined)
      : undefined;

    if (!treatmentRow) {
      res.status(400).json({ error: 'Please select a valid dental treatment.' });
      return;
    }

    const availability = getAvailableSlotsForDate(cleanDate, treatmentRow.duration_minutes);
    if (!availability.isOpen) {
      res.status(400).json({ error: availability.closedReason || 'Clinic is unavailable on the selected date.' });
      return;
    }

    const slotMatch = availability.slots.find((s) => s.time === cleanTime);
    if (!slotMatch || !slotMatch.available) {
      res.status(409).json({
        error: slotMatch?.reason
          ? `The selected slot (${cleanTime}) is unavailable: ${slotMatch.reason}.`
          : 'The selected time slot is outside operating hours or unavailable.',
      });
      return;
    }

    // Duplicate submission check for same mobile + date + slot while Pending or Confirmed
    const existingDuplicate = db
      .prepare(
        "SELECT id, reference_code FROM appointments WHERE mobile = ? AND appointment_date = ? AND time_slot = ? AND status IN ('Pending', 'Confirmed')"
      )
      .get(normalizedMobile, cleanDate, cleanTime) as { id: number; reference_code: string } | undefined;

    if (existingDuplicate) {
      res.status(409).json({
        error: `An appointment request (${existingDuplicate.reference_code}) for this mobile number and time slot already exists.`,
      });
      return;
    }

    // Upsert patient record
    const existingPatient = db
      .prepare('SELECT id FROM patients WHERE mobile = ?')
      .get(normalizedMobile) as { id: number } | undefined;

    let patientId: number;
    if (existingPatient) {
      patientId = Number(existingPatient.id);
      db.prepare(
        "UPDATE patients SET full_name = ?, email = CASE WHEN ? != '' THEN ? ELSE email END, updated_at = datetime('now') WHERE id = ?"
      ).run(cleanName, cleanEmail, cleanEmail, patientId);
    } else {
      const insertPat = db
        .prepare('INSERT INTO patients (full_name, mobile, email) VALUES (?, ?, ?)')
        .run(cleanName, normalizedMobile, cleanEmail);
      patientId = Number(insertPat.lastInsertRowid);
    }

    const referenceCode = generateReferenceCode();
    const dentist = String(preferredDentist || 'Dr. Abdul Khadir').trim().slice(0, 120);
    const cleanNotes = String(notes || '').trim().slice(0, 1000);

    const insertAppt = db
      .prepare(`
        INSERT INTO appointments (
          reference_code, patient_id, patient_name, mobile, email,
          treatment_id, treatment_name, preferred_dentist,
          appointment_date, time_slot, duration_minutes, notes,
          consent_accepted, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'Pending')
      `)
      .run(
        referenceCode,
        patientId,
        cleanName,
        normalizedMobile,
        cleanEmail,
        treatmentRow.id,
        treatmentRow.name,
        dentist,
        cleanDate,
        cleanTime,
        treatmentRow.duration_minutes,
        cleanNotes
      );

    const createdRow = db
      .prepare('SELECT * FROM appointments WHERE id = ?')
      .get(Number(insertAppt.lastInsertRowid)) as Record<string, unknown>;
    const appointment = mapAppointmentRow(createdRow);

    await dispatchBookingNotifications(appointment);
    const sbSync = await syncAppointmentToSupabase(appointment);

    res.status(201).json({
      appointment,
      supabaseSynced: sbSync.synced,
      message:
        'Thank you for choosing MED Rx Dental Centre! Your appointment request has been received. Our team will contact you to confirm your appointment.',
    });
  } catch (err) {
    logError('/api/appointments POST', err);
    res.status(500).json({ error: 'Unable to submit appointment request. Please call +91 99720 25712.' });
  }
});

// Patient booking lookup & reschedule/cancellation request
app.post('/api/appointments/lookup', rateLimit('lookup', 12, 10 * 60 * 1000), (req, res) => {
  try {
    const { referenceCode, mobile } = req.body as { referenceCode?: string; mobile?: string };
    const cleanRef = String(referenceCode || '').trim().toUpperCase();
    const normalizedMobile = normalizeIndianMobile(String(mobile || ''));

    if (!cleanRef || !normalizedMobile) {
      res.status(400).json({ error: 'Please enter both your booking reference number and registered Indian mobile number.' });
      return;
    }

    const row = db
      .prepare('SELECT * FROM appointments WHERE reference_code = ? AND mobile = ?')
      .get(cleanRef, normalizedMobile) as Record<string, unknown> | undefined;

    if (!row) {
      res.status(404).json({ error: 'No matching appointment found for that reference code and mobile number.' });
      return;
    }

    res.json({ appointment: mapAppointmentRow(row) });
  } catch (err) {
    logError('/api/appointments/lookup', err);
    res.status(500).json({ error: 'Unable to look up appointment.' });
  }
});

app.post('/api/appointments/patient-action', rateLimit('patient-action', 10, 10 * 60 * 1000), async (req, res) => {
  try {
    const { referenceCode, mobile, action, requestedDate, requestedTime, reason } = req.body as {
      referenceCode?: string;
      mobile?: string;
      action?: 'cancel' | 'reschedule';
      requestedDate?: string;
      requestedTime?: string;
      reason?: string;
    };

    const cleanRef = String(referenceCode || '').trim().toUpperCase();
    const normalizedMobile = normalizeIndianMobile(String(mobile || ''));
    if (!cleanRef || !normalizedMobile) {
      res.status(400).json({ error: 'Reference code and mobile number are required.' });
      return;
    }

    const row = db
      .prepare('SELECT * FROM appointments WHERE reference_code = ? AND mobile = ?')
      .get(cleanRef, normalizedMobile) as Record<string, unknown> | undefined;

    if (!row) {
      res.status(404).json({ error: 'Appointment not found.' });
      return;
    }

    const current = mapAppointmentRow(row);
    if (current.status === 'Completed' || current.status === 'Cancelled') {
      res.status(400).json({ error: `Cannot modify an appointment that is already ${current.status}.` });
      return;
    }

    if (action === 'cancel') {
      const cancelNote = String(reason || 'Cancelled by patient').trim().slice(0, 300);
      db.prepare(
        "UPDATE appointments SET status = 'Cancelled', reschedule_request = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(`Patient cancellation: ${cancelNote}`, current.id);

      const updated = mapAppointmentRow(
        db.prepare('SELECT * FROM appointments WHERE id = ?').get(current.id) as Record<string, unknown>
      );
      await dispatchStatusUpdateNotification(updated, cancelNote);
      await syncAppointmentToSupabase(updated);
      res.json({ appointment: updated, message: 'Your appointment has been cancelled.' });
      return;
    }

    if (action === 'reschedule') {
      const reqDate = String(requestedDate || '').trim();
      const reqTime = String(requestedTime || '').trim();
      if (!isValidDateString(reqDate) || !/^\d{2}:\d{2}$/.test(reqTime)) {
        res.status(400).json({ error: 'Please select a valid requested date and time.' });
        return;
      }
      const avail = getAvailableSlotsForDate(reqDate, current.durationMinutes);
      const slotOk = avail.isOpen && avail.slots.some((s) => s.time === reqTime && s.available);
      if (!slotOk) {
        res.status(409).json({ error: 'That requested date/time is unavailable. Please choose another open slot.' });
        return;
      }
      const reqSummary = `Reschedule requested to ${reqDate} at ${reqTime} IST${reason ? ` (${String(reason).trim().slice(0, 200)})` : ''}`;
      db.prepare(
        "UPDATE appointments SET status = 'Pending', reschedule_request = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(reqSummary, current.id);

      const updated = mapAppointmentRow(
        db.prepare('SELECT * FROM appointments WHERE id = ?').get(current.id) as Record<string, unknown>
      );
      await syncAppointmentToSupabase(updated);
      res.json({
        appointment: updated,
        message: 'Your reschedule request has been recorded. Our clinic team will contact you to confirm the new slot.',
      });
      return;
    }

    res.status(400).json({ error: 'Unsupported action.' });
  } catch (err) {
    logError('/api/appointments/patient-action', err);
    res.status(500).json({ error: 'Unable to update appointment.' });
  }
});

app.post('/api/contact', rateLimit('contact', 6, 10 * 60 * 1000), async (req, res) => {
  try {
    const { name, mobile, email, subject, message, website } = req.body as Record<string, unknown>;
    if (website && String(website).trim().length > 0) {
      res.status(400).json({ error: 'Invalid submission.' });
      return;
    }
    const cleanName = String(name || '').trim();
    const normalizedMobile = normalizeIndianMobile(String(mobile || ''));
    const cleanEmail = String(email || '').trim();
    const cleanSubject = String(subject || 'General Enquiry').trim().slice(0, 150);
    const cleanMessage = String(message || '').trim().slice(0, 2000);

    if (cleanName.length < 2) {
      res.status(400).json({ error: 'Please enter your name.' });
      return;
    }
    if (!normalizedMobile) {
      res.status(400).json({ error: 'Please enter a valid 10-digit Indian mobile number.' });
      return;
    }
    if (cleanMessage.length < 5) {
      res.status(400).json({ error: 'Please enter your enquiry message.' });
      return;
    }

    db.prepare(
      'INSERT INTO contact_messages (name, mobile, email, subject, message) VALUES (?, ?, ?, ?, ?)'
    ).run(cleanName, normalizedMobile, cleanEmail, cleanSubject, cleanMessage);

    await syncContactMessageToSupabase({
      name: cleanName,
      mobile: normalizedMobile,
      email: cleanEmail,
      subject: cleanSubject,
      message: cleanMessage,
    });

    res.status(201).json({
      message: 'Thank you for contacting MED Rx Dental Centre. Our reception team will reach out shortly.',
    });
  } catch (err) {
    logError('/api/contact', err);
    res.status(500).json({ error: 'Unable to send message right now. Please call +91 99720 25712.' });
  }
});

// ============================================================================
// ADMIN AUTHENTICATION ROUTES
// ============================================================================
app.get('/api/admin/auth-status', (_req, res) => {
  res.json(getAdminAuthStatus());
});

app.post('/api/admin/bootstrap', rateLimit('admin-auth', 10, 15 * 60 * 1000), (req, res) => {
  try {
    if (isEnvPasscodeConfigured()) {
      res.status(403).json({ error: 'Administrator passcode is already configured via environment settings.' });
      return;
    }
    if (hasClaimedAdminUser()) {
      res.status(403).json({ error: 'Administrator account has already been claimed.' });
      return;
    }
    const { name, email, password } = req.body as { name?: string; email?: string; password?: string };
    const cleanName = String(name || 'Clinic Administrator').trim().slice(0, 80);
    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanPass = String(password || '');

    if (!cleanEmail || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      res.status(400).json({ error: 'Please provide a valid administrator email address.' });
      return;
    }
    if (cleanPass.length < 8) {
      res.status(400).json({ error: 'Please choose a password of at least 8 characters.' });
      return;
    }

    const passwordHash = hashPassword(cleanPass);
    db.prepare('INSERT INTO admin_users (email, name, role, password_hash) VALUES (?, ?, ?, ?)').run(
      cleanEmail,
      cleanName,
      'owner',
      passwordHash
    );

    const token = createSessionToken({ sub: cleanEmail, name: cleanName, role: 'owner' });
    res.status(201).json({
      token,
      user: { email: cleanEmail, name: cleanName, role: 'owner' },
    });
  } catch (err) {
    logError('/api/admin/bootstrap', err);
    res.status(500).json({ error: 'Unable to initialize administrator account.' });
  }
});

app.post('/api/admin/login', rateLimit('admin-auth', 12, 15 * 60 * 1000), (req, res) => {
  try {
    const { email, password } = req.body as { email?: string; password?: string };
    const cleanPass = String(password || '');
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (isEnvPasscodeConfigured()) {
      const envPass = process.env.ADMIN_PASSCODE!.trim();
      const passBuf = Buffer.from(cleanPass);
      const envBuf = Buffer.from(envPass);
      if (passBuf.length === envBuf.length && crypto.timingSafeEqual(passBuf, envBuf)) {
        const displayEmail = cleanEmail || 'admin@medrxdental.in';
        const token = createSessionToken({ sub: displayEmail, name: 'Clinic Owner', role: 'owner' });
        res.json({ token, user: { email: displayEmail, name: 'Clinic Owner', role: 'owner' } });
        return;
      }
      res.status(401).json({ error: 'Invalid administrator passcode.' });
      return;
    }

    if (!hasClaimedAdminUser()) {
      res.status(400).json({ error: 'No administrator account exists yet. Complete first-run setup.' });
      return;
    }

    const userRow = (
      cleanEmail
        ? db.prepare('SELECT * FROM admin_users WHERE email = ?').get(cleanEmail)
        : db.prepare('SELECT * FROM admin_users ORDER BY id ASC LIMIT 1').get()
    ) as { email: string; name: string; role: string; password_hash: string } | undefined;

    if (!userRow || !verifyPassword(cleanPass, userRow.password_hash)) {
      res.status(401).json({ error: 'Invalid email or password.' });
      return;
    }

    const token = createSessionToken({
      sub: userRow.email,
      name: userRow.name,
      role: userRow.role,
    });
    res.json({ token, user: { email: userRow.email, name: userRow.name, role: userRow.role } });
  } catch (err) {
    logError('/api/admin/login', err);
    res.status(500).json({ error: 'Login failed.' });
  }
});

// ============================================================================
// PROTECTED ADMIN API ROUTES
// ============================================================================
app.get('/api/admin/dashboard', requireAdminAuth, async (req: AuthenticatedRequest, res) => {
  try {
    let supabaseSyncNote = '';
    try {
      const pullRes = await pullAppointmentsFromSupabase();
      if (pullRes.note) {
        supabaseSyncNote = pullRes.note;
      }
    } catch {
      // Non-fatal: continue serving local database records
    }

    const { todayStr } = getKolkataTodayAndMinutes();
    const allApptRows = db
      .prepare('SELECT * FROM appointments ORDER BY appointment_date DESC, time_slot ASC, id DESC')
      .all() as Array<Record<string, unknown>>;
    const appointments = allApptRows.map(mapAppointmentRow);

    const stats: AdminStats = {
      total: appointments.length,
      pending: appointments.filter((a) => a.status === 'Pending').length,
      confirmed: appointments.filter((a) => a.status === 'Confirmed').length,
      completed: appointments.filter((a) => a.status === 'Completed').length,
      cancelled: appointments.filter((a) => a.status === 'Cancelled').length,
      noShow: appointments.filter((a) => a.status === 'No-show').length,
      todayCount: appointments.filter((a) => a.appointmentDate === todayStr && a.status !== 'Cancelled').length,
      upcomingCount: appointments.filter(
        (a) => a.appointmentDate >= todayStr && (a.status === 'Pending' || a.status === 'Confirmed')
      ).length,
    };

    const contactMessages = db
      .prepare('SELECT * FROM contact_messages ORDER BY id DESC LIMIT 50')
      .all();

    res.json({
      user: req.adminUser,
      stats,
      appointments,
      treatments: listTreatments(true),
      operatingHours: listOperatingHours(),
      blockedSlots: listBlockedSlots(),
      content: getClinicContent(),
      notifications: listNotifications(60),
      contactMessages,
      integrations: getIntegrationStatus(),
      supabaseStatus: getSupabaseConfigStatus(),
      supabaseSyncNote,
      todayStr,
    });
  } catch (err) {
    logError('/api/admin/dashboard', err);
    res.status(500).json({ error: 'Unable to load admin dashboard.' });
  }
});

app.patch('/api/admin/appointments/:id', requireAdminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid appointment ID.' });
      return;
    }

    const existingRow = db
      .prepare('SELECT * FROM appointments WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;

    if (!existingRow) {
      res.status(404).json({ error: 'Appointment not found.' });
      return;
    }
    const existing = mapAppointmentRow(existingRow);

    const {
      patientName,
      mobile,
      email,
      treatmentId,
      preferredDentist,
      status,
      appointmentDate,
      timeSlot,
      notes,
    } = req.body as {
      patientName?: string;
      mobile?: string;
      email?: string;
      treatmentId?: number | null;
      preferredDentist?: string;
      status?: AppointmentStatus;
      appointmentDate?: string;
      timeSlot?: string;
      notes?: string;
    };

    let nextPatientName = existing.patientName;
    if (patientName !== undefined) {
      const cleanName = String(patientName).trim();
      if (cleanName.length < 2 || cleanName.length > 120) {
        res.status(400).json({ error: 'Patient name must be between 2 and 120 characters.' });
        return;
      }
      nextPatientName = cleanName;
    }

    let nextMobile = existing.mobile;
    if (mobile !== undefined) {
      const normalized = normalizeIndianMobile(String(mobile));
      if (!normalized) {
        res.status(400).json({ error: 'Please enter a valid 10-digit Indian mobile number.' });
        return;
      }
      nextMobile = normalized;
    }

    let nextEmail = existing.email;
    if (email !== undefined) {
      const cleanEmail = String(email).trim();
      if (cleanEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
        res.status(400).json({ error: 'Please enter a valid email address or leave it blank.' });
        return;
      }
      nextEmail = cleanEmail;
    }

    let nextTreatmentId = existing.treatmentId;
    let nextTreatmentName = existing.treatmentName;
    let nextDurationMinutes = existing.durationMinutes;
    if (treatmentId !== undefined && treatmentId !== null && Number(treatmentId) !== existing.treatmentId) {
      const tRow = db
        .prepare('SELECT id, name, duration_minutes FROM treatments WHERE id = ?')
        .get(Number(treatmentId)) as { id: number; name: string; duration_minutes: number } | undefined;
      if (!tRow) {
        res.status(400).json({ error: 'Selected dental treatment was not found.' });
        return;
      }
      nextTreatmentId = Number(tRow.id);
      nextTreatmentName = tRow.name;
      nextDurationMinutes = Number(tRow.duration_minutes);
    }

    const nextDentist =
      preferredDentist !== undefined
        ? String(preferredDentist).trim().slice(0, 120) || existing.preferredDentist
        : existing.preferredDentist;

    const allowedStatuses: AppointmentStatus[] = ['Pending', 'Confirmed', 'Completed', 'Cancelled', 'No-show'];
    const nextStatus = status && allowedStatuses.includes(status) ? status : existing.status;

    let nextDate = existing.appointmentDate;
    if (appointmentDate !== undefined) {
      if (!isValidDateString(appointmentDate)) {
        res.status(400).json({ error: 'Invalid appointment date format.' });
        return;
      }
      nextDate = appointmentDate;
    }

    let nextTime = existing.timeSlot;
    if (timeSlot !== undefined) {
      if (!/^\d{2}:\d{2}$/.test(timeSlot)) {
        res.status(400).json({ error: 'Invalid time slot format (HH:mm).' });
        return;
      }
      nextTime = timeSlot;
    }

    const nextNotes = notes !== undefined ? String(notes).slice(0, 1000) : existing.notes;

    // If confirming or rescheduling to Confirmed, verify no overlap with another Confirmed appointment
    if (nextStatus === 'Confirmed') {
      const avail = getAvailableSlotsForDate(nextDate, nextDurationMinutes);
      if (!avail.isOpen) {
        res.status(400).json({ error: avail.closedReason || 'Selected date is closed.' });
        return;
      }
      const otherConfirmed = db
        .prepare(
          "SELECT id, time_slot, duration_minutes FROM appointments WHERE appointment_date = ? AND status = 'Confirmed' AND id != ?"
        )
        .all(nextDate, id) as Array<{ id: number; time_slot: string; duration_minutes: number }>;

      const [nh, nm] = nextTime.split(':').map(Number);
      const ns = nh * 60 + nm;
      const ne = ns + nextDurationMinutes;

      const conflict = otherConfirmed.some((o) => {
        const [oh, om] = o.time_slot.split(':').map(Number);
        const os = oh * 60 + om;
        const oe = os + Number(o.duration_minutes || 30);
        return ns < oe && os < ne;
      });

      if (conflict) {
        res.status(409).json({
          error: `Another confirmed appointment overlaps ${nextTime} on ${nextDate}. Please reschedule first.`,
        });
        return;
      }
    }

    // Keep linked patient record consistent when mobile/name/email changes
    let targetPatientId = existing.patientId;
    if (nextMobile !== existing.mobile) {
      const existingOwner = db
        .prepare('SELECT id FROM patients WHERE mobile = ?')
        .get(nextMobile) as { id: number } | undefined;
      if (existingOwner) {
        targetPatientId = Number(existingOwner.id);
        db.prepare(
          "UPDATE patients SET full_name = ?, email = CASE WHEN ? != '' THEN ? ELSE email END, updated_at = datetime('now') WHERE id = ?"
        ).run(nextPatientName, nextEmail, nextEmail, targetPatientId);
      } else {
        const insPat = db
          .prepare('INSERT INTO patients (full_name, mobile, email) VALUES (?, ?, ?)')
          .run(nextPatientName, nextMobile, nextEmail);
        targetPatientId = Number(insPat.lastInsertRowid);
      }
    } else if (nextPatientName !== existing.patientName || nextEmail !== existing.email) {
      db.prepare(
        "UPDATE patients SET full_name = ?, email = ?, updated_at = datetime('now') WHERE id = ?"
      ).run(nextPatientName, nextEmail, targetPatientId);
    }

    db.prepare(`
      UPDATE appointments
      SET patient_id = ?, patient_name = ?, mobile = ?, email = ?,
          treatment_id = ?, treatment_name = ?, preferred_dentist = ?,
          duration_minutes = ?, status = ?, appointment_date = ?, time_slot = ?, notes = ?,
          reschedule_request = CASE WHEN ? != appointment_date OR ? != time_slot THEN NULL ELSE reschedule_request END,
          updated_at = datetime('now')
      WHERE id = ?
    `).run(
      targetPatientId,
      nextPatientName,
      nextMobile,
      nextEmail,
      nextTreatmentId,
      nextTreatmentName,
      nextDentist,
      nextDurationMinutes,
      nextStatus,
      nextDate,
      nextTime,
      nextNotes,
      nextDate,
      nextTime,
      id
    );

    const updated = mapAppointmentRow(
      db.prepare('SELECT * FROM appointments WHERE id = ?').get(id) as Record<string, unknown>
    );

    if (nextStatus !== existing.status || nextDate !== existing.appointmentDate || nextTime !== existing.timeSlot) {
      await dispatchStatusUpdateNotification(updated);
    }
    const sbRes = await syncAppointmentToSupabase(updated);

    res.json({
      appointment: updated,
      supabaseSynced: sbRes.synced,
      supabaseError: sbRes.synced ? undefined : sbRes.error,
    });
  } catch (err) {
    logError('/api/admin/appointments PATCH', err);
    res.status(500).json({ error: 'Unable to update appointment.' });
  }
});

app.delete('/api/admin/appointments/:id', requireAdminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id) || id <= 0) {
      res.status(400).json({ error: 'Invalid appointment ID.' });
      return;
    }

    const existingRow = db
      .prepare('SELECT * FROM appointments WHERE id = ?')
      .get(id) as Record<string, unknown> | undefined;

    if (!existingRow) {
      res.status(404).json({ error: 'Appointment not found.' });
      return;
    }

    const existing = mapAppointmentRow(existingRow);
    db.prepare('DELETE FROM notifications WHERE appointment_id = ?').run(id);
    db.prepare('DELETE FROM appointments WHERE id = ?').run(id);

    const sbDelete = await deleteAppointmentFromSupabase(existing.referenceCode);

    res.json({
      deleted: true,
      referenceCode: existing.referenceCode,
      supabaseDeleted: sbDelete.deleted,
      supabaseError: sbDelete.deleted ? undefined : sbDelete.error,
    });
  } catch (err) {
    logError('/api/admin/appointments DELETE', err);
    res.status(500).json({ error: 'Unable to delete appointment.' });
  }
});

app.put('/api/admin/operating-hours', requireAdminAuth, async (req, res) => {
  try {
    const { hours, defaultDurationMinutes } = req.body as {
      hours?: Array<{
        dayOfWeek: number;
        isOpen: boolean;
        openTime: string;
        closeTime: string;
        slotIntervalMinutes: number;
      }>;
      defaultDurationMinutes?: number;
    };

    if (Array.isArray(hours)) {
      const stmt = db.prepare(`
        UPDATE operating_hours
        SET is_open = ?, open_time = ?, close_time = ?, slot_interval_minutes = ?
        WHERE day_of_week = ?
      `);
      for (const h of hours) {
        if (!/^\d{2}:\d{2}$/.test(h.openTime) || !/^\d{2}:\d{2}$/.test(h.closeTime)) {
          res.status(400).json({ error: 'Invalid time format in operating hours.' });
          return;
        }
        stmt.run(
          h.isOpen ? 1 : 0,
          h.openTime,
          h.closeTime,
          Math.max(15, Math.min(60, Number(h.slotIntervalMinutes) || 30)),
          Number(h.dayOfWeek)
        );
      }
    }

    if (defaultDurationMinutes) {
      const content = getClinicContent();
      content.defaultDurationMinutes = Math.max(15, Math.min(120, Number(defaultDurationMinutes)));
      saveClinicContent(content);
    }

    await syncReferenceDataToSupabase();
    res.json({ operatingHours: listOperatingHours(), content: getClinicContent() });
  } catch (err) {
    logError('/api/admin/operating-hours', err);
    res.status(500).json({ error: 'Unable to update operating hours.' });
  }
});

app.post('/api/admin/blocked-slots', requireAdminAuth, (req, res) => {
  try {
    const { blockDate, startTime, endTime, allDay, reason } = req.body as {
      blockDate?: string;
      startTime?: string;
      endTime?: string;
      allDay?: boolean;
      reason?: string;
    };

    if (!blockDate || !isValidDateString(blockDate)) {
      res.status(400).json({ error: 'Please select a valid date to block.' });
      return;
    }

    if (!allDay && (!startTime || !endTime || !/^\d{2}:\d{2}$/.test(startTime) || !/^\d{2}:\d{2}$/.test(endTime))) {
      res.status(400).json({ error: 'Please provide valid start and end times for partial slot blocks.' });
      return;
    }

    db.prepare(
      'INSERT INTO blocked_slots (block_date, start_time, end_time, all_day, reason) VALUES (?, ?, ?, ?, ?)'
    ).run(
      blockDate,
      allDay ? null : startTime!,
      allDay ? null : endTime!,
      allDay ? 1 : 0,
      String(reason || 'Unavailable').trim().slice(0, 200)
    );

    res.status(201).json({ blockedSlots: listBlockedSlots() });
  } catch (err) {
    logError('/api/admin/blocked-slots POST', err);
    res.status(500).json({ error: 'Unable to create blocked slot.' });
  }
});

app.delete('/api/admin/blocked-slots/:id', requireAdminAuth, (req, res) => {
  try {
    const id = Number(req.params.id);
    db.prepare('DELETE FROM blocked_slots WHERE id = ?').run(id);
    res.json({ blockedSlots: listBlockedSlots() });
  } catch (err) {
    logError('/api/admin/blocked-slots DELETE', err);
    res.status(500).json({ error: 'Unable to delete blocked slot.' });
  }
});

app.post('/api/admin/treatments', requireAdminAuth, async (req, res) => {
  try {
    const t = req.body as Partial<Treatment>;
    const name = String(t.name || '').trim();
    if (name.length < 2) {
      res.status(400).json({ error: 'Treatment name is required.' });
      return;
    }
    const slug =
      String(t.slug || name)
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') +
      '-' +
      crypto.randomBytes(2).toString('hex');

    db.prepare(`
      INSERT INTO treatments (
        slug, name, category, short_description, detailed_description,
        what_to_expect, duration_minutes, image_url, is_active, sort_order
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      slug,
      name,
      t.category || 'General Dentistry',
      String(t.shortDescription || '').trim() || 'Comprehensive dental consultation and care.',
      String(t.detailedDescription || t.shortDescription || '').trim() || 'Personalized treatment planning.',
      JSON.stringify(Array.isArray(t.whatToExpect) ? t.whatToExpect : ['Initial examination', 'Clear care options']),
      Math.max(15, Math.min(180, Number(t.durationMinutes) || 30)),
      String(t.imageUrl || '/src/assets/images/care_consultation_1795623224295.jpg'),
      t.isActive === false ? 0 : 1,
      Number(t.sortOrder) || 99
    );

    await syncReferenceDataToSupabase();
    res.status(201).json({ treatments: listTreatments(true) });
  } catch (err) {
    logError('/api/admin/treatments POST', err);
    res.status(500).json({ error: 'Unable to add treatment.' });
  }
});

app.patch('/api/admin/treatments/:id', requireAdminAuth, async (req, res) => {
  try {
    const id = Number(req.params.id);
    const body = req.body as Partial<Treatment>;
    const existing = db.prepare('SELECT * FROM treatments WHERE id = ?').get(id) as Record<string, unknown> | undefined;
    if (!existing) {
      res.status(404).json({ error: 'Treatment not found.' });
      return;
    }

    db.prepare(`
      UPDATE treatments
      SET name = ?, category = ?, short_description = ?, detailed_description = ?,
          duration_minutes = ?, is_active = ?
      WHERE id = ?
    `).run(
      body.name !== undefined ? String(body.name).trim() : String(existing.name),
      body.category !== undefined ? String(body.category) : String(existing.category),
      body.shortDescription !== undefined ? String(body.shortDescription).trim() : String(existing.short_description),
      body.detailedDescription !== undefined
        ? String(body.detailedDescription).trim()
        : String(existing.detailed_description),
      body.durationMinutes !== undefined
        ? Math.max(15, Math.min(180, Number(body.durationMinutes)))
        : Number(existing.duration_minutes),
      body.isActive !== undefined ? (body.isActive ? 1 : 0) : Number(existing.is_active),
      id
    );

    await syncReferenceDataToSupabase();
    res.json({ treatments: listTreatments(true) });
  } catch (err) {
    logError('/api/admin/treatments PATCH', err);
    res.status(500).json({ error: 'Unable to update treatment.' });
  }
});

app.put('/api/admin/content', requireAdminAuth, async (req, res) => {
  try {
    const nextContent = req.body as ClinicContent;
    if (!nextContent || !nextContent.heroHeadline || !nextContent.dentist?.name) {
      res.status(400).json({ error: 'Invalid clinic content payload.' });
      return;
    }
    saveClinicContent(nextContent);
    await syncReferenceDataToSupabase();
    res.json({ content: getClinicContent() });
  } catch (err) {
    logError('/api/admin/content PUT', err);
    res.status(500).json({ error: 'Unable to update clinic content.' });
  }
});

app.get('/api/admin/supabase-schema', requireAdminAuth, (_req, res) => {
  try {
    const schemaPath = path.resolve(process.cwd(), 'supabase/schema.sql');
    const sql = fs.existsSync(schemaPath) ? fs.readFileSync(schemaPath, 'utf8') : '';
    res.json({ sql });
  } catch (err) {
    logError('/api/admin/supabase-schema', err);
    res.status(500).json({ error: 'Unable to read Supabase schema file.' });
  }
});

app.post('/api/admin/supabase-test', requireAdminAuth, async (_req, res) => {
  try {
    const result = await testSupabaseConnection();
    res.json(result);
  } catch (err) {
    logError('/api/admin/supabase-test', err);
    res.status(500).json({ connected: false, tablesReady: false, message: 'Connection test failed.' });
  }
});

app.post('/api/admin/supabase-sync', requireAdminAuth, async (_req, res) => {
  try {
    const result = await syncAllLocalAppointmentsToSupabase();
    res.status(result.ok ? 200 : 400).json(result);
  } catch (err) {
    logError('/api/admin/supabase-sync', err);
    res.status(500).json({ ok: false, count: 0, error: 'Failed to sync records to Supabase.' });
  }
});

// ============================================================================
// SERVER STARTUP (VITE DEV MIDDLEWARE OR PRODUCTION STATIC)
// ============================================================================
async function startServer(): Promise<void> {
  const distDir = path.resolve(process.cwd(), 'dist');
  const isProd = process.env.NODE_ENV === 'production' && fs.existsSync(distDir);

  if (isProd) {
    app.use(express.static(distDir));
    app.get('*', (req, res, next) => {
      if (req.path.startsWith('/api/')) {
        next();
        return;
      }
      res.sendFile(path.join(distDir, 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  syncReferenceDataToSupabase().catch(() => {});

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`MED Rx Dental Centre server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});

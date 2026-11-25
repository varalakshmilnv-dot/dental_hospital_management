import { createClient } from '@supabase/supabase-js';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  db,
  getClinicContent,
  listOperatingHours,
  listTreatments,
  logError,
  mapAppointmentRow,
} from './db.ts';
import type { Appointment, NotificationRecord } from '../src/types.ts';

export const SUPABASE_PROJECT_ID = process.env.SUPABASE_PROJECT_ID?.trim() || 'jeyrykacwcahfpelifcp';
export const SUPABASE_REGION = process.env.SUPABASE_REGION?.trim() || 'ap-south-1';
export const SUPABASE_URL =
  process.env.SUPABASE_URL?.trim() || `https://${SUPABASE_PROJECT_ID}.supabase.co`;

// Public publishable (anon) key provided for project jeyrykacwcahfpelifcp
const DEFAULT_PUBLISHABLE_KEY = 'sb_publishable_UyYAWSFcq8aJbluz2XtOtw_IW6eU0Bg';

function getServiceRoleKey(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    ''
  );
}

function getPublishableKey(): string {
  return (
    process.env.SUPABASE_PUBLISHABLE_KEY?.trim() ||
    process.env.SUPABASE_ANON_KEY?.trim() ||
    process.env.SUPABASE_KEY?.trim() ||
    DEFAULT_PUBLISHABLE_KEY
  );
}

function getActiveKey(): { key: string; mode: 'service_role' | 'publishable' } {
  const serviceKey = getServiceRoleKey();
  if (serviceKey) return { key: serviceKey, mode: 'service_role' };
  return { key: getPublishableKey(), mode: 'publishable' };
}

let cachedClient: SupabaseClient | null = null;
let cachedKey = '';

export function getSupabaseClient(): SupabaseClient | null {
  const { key } = getActiveKey();
  if (!key) return null;
  if (!cachedClient || cachedKey !== key) {
    cachedClient = createClient(SUPABASE_URL, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    cachedKey = key;
  }
  return cachedClient;
}

export function getSupabaseConfigStatus(): {
  projectId: string;
  region: string;
  url: string;
  keyConfigured: boolean;
  mode: 'service_role' | 'publishable';
} {
  const { mode } = getActiveKey();
  return {
    projectId: SUPABASE_PROJECT_ID,
    region: SUPABASE_REGION,
    url: SUPABASE_URL,
    keyConfigured: true,
    mode,
  };
}

export async function testSupabaseConnection(): Promise<{
  connected: boolean;
  tablesReady: boolean;
  message: string;
}> {
  const client = getSupabaseClient();
  const { mode } = getActiveKey();
  if (!client) {
    return {
      connected: false,
      tablesReady: false,
      message: 'Supabase key is not configured.',
    };
  }

  try {
    if (mode === 'service_role') {
      const { error } = await client.from('appointments').select('id').limit(1);
      if (error) {
        const missingTable =
          error.code === '42P01' ||
          error.code === 'PGRST205' ||
          error.message.includes('Could not find the table') ||
          error.message.includes('does not exist');
        return {
          connected: missingTable,
          tablesReady: false,
          message: missingTable
            ? 'Connected to Supabase project jeyrykacwcahfpelifcp, but tables are not created yet. Run the SQL query from "Copy Supabase SQL Schema" in your Supabase SQL Editor.'
            : `Supabase check failed: ${error.message}`,
        };
      }
      return {
        connected: true,
        tablesReady: true,
        message: `Connected to Supabase (${SUPABASE_PROJECT_ID} · ${SUPABASE_REGION}) with full Service Role sync.`,
      };
    }

    const { error: hoursErr } = await client.from('operating_hours').select('day_of_week').limit(1);
    if (hoursErr) {
      return {
        connected: hoursErr.code === '42501',
        tablesReady: false,
        message:
          hoursErr.code === '42501'
            ? 'Supabase tables exist, but public booking permissions/RPC are not applied yet. Copy and run the updated SQL schema in your Supabase SQL Editor.'
            : `Supabase check failed: ${hoursErr.message}`,
      };
    }

    return {
      connected: true,
      tablesReady: true,
      message: `Connected to Supabase (${SUPABASE_PROJECT_ID} · ${SUPABASE_REGION}) via Publishable Key. New bookings and enquiries save automatically to your Supabase database.`,
    };
  } catch (err) {
    return {
      connected: false,
      tablesReady: false,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function syncAppointmentToSupabase(
  appointment: Appointment
): Promise<{ synced: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { synced: false, error: 'Supabase client unavailable' };
  }

  const { mode } = getActiveKey();

  try {
    if (mode === 'service_role') {
      const { data: patientRow, error: patErr } = await client
        .from('patients')
        .upsert(
          {
            full_name: appointment.patientName,
            mobile: appointment.mobile,
            email: appointment.email || '',
            updated_at: new Date().toISOString(),
          },
          { onConflict: 'mobile' }
        )
        .select('id')
        .single();

      if (patErr) {
        logError('supabase:upsert_patient', patErr.message);
        return { synced: false, error: patErr.message };
      }

      const { error: apptErr } = await client.from('appointments').upsert(
        {
          reference_code: appointment.referenceCode,
          patient_id: patientRow?.id ?? null,
          patient_name: appointment.patientName,
          mobile: appointment.mobile,
          email: appointment.email || '',
          treatment_id: appointment.treatmentId,
          treatment_name: appointment.treatmentName,
          preferred_dentist: appointment.preferredDentist,
          appointment_date: appointment.appointmentDate,
          time_slot: appointment.timeSlot,
          duration_minutes: appointment.durationMinutes,
          notes: appointment.notes || '',
          consent_accepted: appointment.consentAccepted,
          status: appointment.status,
          reschedule_request: appointment.rescheduleRequest,
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'reference_code' }
      );

      if (apptErr) {
        logError('supabase:upsert_appointment', apptErr.message);
        return { synced: false, error: apptErr.message };
      }
      return { synced: true };
    }

    // Publishable key path: use atomic SECURITY DEFINER RPC first (writes patients + appointments securely)
    if (appointment.status === 'Pending' && !appointment.rescheduleRequest) {
      const { error: rpcErr } = await client.rpc('submit_clinic_booking', {
        p_reference_code: appointment.referenceCode,
        p_patient_name: appointment.patientName,
        p_mobile: appointment.mobile,
        p_email: appointment.email || '',
        p_treatment_id: appointment.treatmentId,
        p_treatment_name: appointment.treatmentName,
        p_preferred_dentist: appointment.preferredDentist,
        p_appointment_date: appointment.appointmentDate,
        p_time_slot: appointment.timeSlot,
        p_duration_minutes: appointment.durationMinutes,
        p_notes: appointment.notes || '',
        p_consent_accepted: appointment.consentAccepted,
      });

      if (!rpcErr) {
        return { synced: true };
      }

      // Fallback to direct INSERT if user created tables without RPC
      const { error: insertErr } = await client.from('appointments').insert({
        reference_code: appointment.referenceCode,
        patient_name: appointment.patientName,
        mobile: appointment.mobile,
        email: appointment.email || '',
        treatment_id: appointment.treatmentId,
        treatment_name: appointment.treatmentName,
        preferred_dentist: appointment.preferredDentist,
        appointment_date: appointment.appointmentDate,
        time_slot: appointment.timeSlot,
        duration_minutes: appointment.durationMinutes,
        notes: appointment.notes || '',
        consent_accepted: appointment.consentAccepted,
        status: 'Pending',
      });

      if (insertErr) {
        logError('supabase:insert_appointment', insertErr.message);
        return { synced: false, error: insertErr.message };
      }
      return { synced: true };
    }

    return {
      synced: false,
      error: 'Status updates to existing Supabase rows require SUPABASE_SERVICE_ROLE_KEY in Secrets.',
    };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError('supabase:sync_appointment', msg);
    return { synced: false, error: msg };
  }
}

export async function syncContactMessageToSupabase(params: {
  name: string;
  mobile: string;
  email: string;
  subject: string;
  message: string;
}): Promise<void> {
  const client = getSupabaseClient();
  if (!client) return;
  try {
    if (getActiveKey().mode === 'publishable') {
      const { error: rpcErr } = await client.rpc('submit_contact_message', {
        p_name: params.name,
        p_mobile: params.mobile,
        p_email: params.email,
        p_subject: params.subject,
        p_message: params.message,
      });
      if (!rpcErr) return;
    }

    const { error } = await client.from('contact_messages').insert({
      name: params.name,
      mobile: params.mobile,
      email: params.email,
      subject: params.subject,
      message: params.message,
    });
    if (error) logError('supabase:insert_contact', error.message);
  } catch (err) {
    logError('supabase:insert_contact', err);
  }
}

export async function syncNotificationToSupabase(
  n: Omit<NotificationRecord, 'id' | 'createdAt'> & { referenceCode?: string }
): Promise<void> {
  const client = getSupabaseClient();
  if (!client || getActiveKey().mode !== 'service_role') return;
  try {
    let sbAppointmentId: number | null = null;
    if (n.referenceCode) {
      const { data } = await client
        .from('appointments')
        .select('id')
        .eq('reference_code', n.referenceCode)
        .maybeSingle();
      sbAppointmentId = data?.id ?? null;
    }
    const { error } = await client.from('notifications').insert({
      appointment_id: sbAppointmentId,
      channel: n.channel,
      recipient: n.recipient,
      subject: n.subject,
      message: n.message,
      status: n.status,
      provider_response: n.providerResponse,
    });
    if (error) logError('supabase:insert_notification', error.message);
  } catch (err) {
    logError('supabase:insert_notification', err);
  }
}

export async function syncReferenceDataToSupabase(): Promise<{ ok: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client || getActiveKey().mode !== 'service_role') {
    return { ok: false, error: 'Reference table sync requires SUPABASE_SERVICE_ROLE_KEY.' };
  }

  try {
    const treatments = listTreatments(true);
    if (treatments.length > 0) {
      const { error: tErr } = await client.from('treatments').upsert(
        treatments.map((t) => ({
          id: t.id,
          slug: t.slug,
          name: t.name,
          category: t.category,
          short_description: t.shortDescription,
          detailed_description: t.detailedDescription,
          what_to_expect: t.whatToExpect,
          duration_minutes: t.durationMinutes,
          image_url: t.imageUrl,
          is_active: t.isActive,
          sort_order: t.sortOrder,
        })),
        { onConflict: 'id' }
      );
      if (tErr) return { ok: false, error: tErr.message };
    }

    const hours = listOperatingHours();
    if (hours.length > 0) {
      const { error: hErr } = await client.from('operating_hours').upsert(
        hours.map((h) => ({
          day_of_week: h.dayOfWeek,
          day_name: h.dayName,
          is_open: h.isOpen,
          open_time: h.openTime,
          close_time: h.closeTime,
          slot_interval_minutes: h.slotIntervalMinutes,
        })),
        { onConflict: 'day_of_week' }
      );
      if (hErr) return { ok: false, error: hErr.message };
    }

    const content = getClinicContent();
    const { error: cErr } = await client.from('site_content').upsert(
      {
        key: 'clinic_content',
        value: content,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'key' }
    );
    if (cErr) return { ok: false, error: cErr.message };

    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function syncAllLocalAppointmentsToSupabase(): Promise<{
  ok: boolean;
  count: number;
  error?: string;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return { ok: false, count: 0, error: 'Supabase client unavailable' };
  }

  if (getActiveKey().mode === 'service_role') {
    const refSync = await syncReferenceDataToSupabase();
    if (!refSync.ok) {
      return { ok: false, count: 0, error: refSync.error };
    }
  }

  const rows = db.prepare('SELECT * FROM appointments ORDER BY id ASC').all() as Array<
    Record<string, unknown>
  >;
  let count = 0;
  for (const r of rows) {
    const appt = mapAppointmentRow(r);
    const res = await syncAppointmentToSupabase(appt);
    if (res.synced) {
      count++;
    } else if (getActiveKey().mode === 'service_role') {
      return { ok: false, count, error: res.error };
    }
  }
  return { ok: true, count };
}

export async function pullAppointmentsFromSupabase(): Promise<{
  pulled: number;
  note?: string;
}> {
  const client = getSupabaseClient();
  if (!client) {
    return { pulled: 0 };
  }

  const { mode } = getActiveKey();
  if (mode !== 'service_role') {
    return {
      pulled: 0,
      note: 'Showing clinic database bookings (new website bookings save to Supabase automatically). Add SUPABASE_SERVICE_ROLE_KEY in Secrets to also pull external Supabase edits.',
    };
  }

  try {
    const { data, error } = await client
      .from('appointments')
      .select('*')
      .order('id', { ascending: false })
      .limit(500);

    if (error) {
      logError('supabase:pull_appointments', error.message);
      return { pulled: 0, note: `Supabase pull notice: ${error.message}` };
    }

    if (!Array.isArray(data) || data.length === 0) {
      return { pulled: 0 };
    }

    let pulled = 0;
    for (const row of data) {
      const refCode = String(row.reference_code || '').trim();
      const patientName = String(row.patient_name || '').trim();
      const mobile = String(row.mobile || '').trim();
      const email = String(row.email || '').trim();
      const appointmentDate = String(row.appointment_date || '').trim();
      const timeSlot = String(row.time_slot || '').trim();
      if (!refCode || !patientName || !mobile || !appointmentDate || !timeSlot) continue;

      const existingAppt = db
        .prepare('SELECT id, updated_at FROM appointments WHERE reference_code = ?')
        .get(refCode) as { id: number; updated_at: string } | undefined;

      const sbUpdatedMs = row.updated_at ? Date.parse(String(row.updated_at)) : 0;
      const localUpdatedMs = existingAppt?.updated_at
        ? Date.parse(existingAppt.updated_at.replace(' ', 'T') + (existingAppt.updated_at.endsWith('Z') ? '' : 'Z'))
        : 0;

      if (!existingAppt) {
        let patientRow = db
          .prepare('SELECT id FROM patients WHERE mobile = ?')
          .get(mobile) as { id: number } | undefined;

        if (!patientRow) {
          const insPat = db
            .prepare('INSERT INTO patients (full_name, mobile, email) VALUES (?, ?, ?)')
            .run(patientName, mobile, email);
          patientRow = { id: Number(insPat.lastInsertRowid) };
        }

        const treatmentId =
          row.treatment_id != null
            ? ((db.prepare('SELECT id FROM treatments WHERE id = ?').get(Number(row.treatment_id)) as { id: number } | undefined)?.id ?? null)
            : null;

        db.prepare(`
          INSERT INTO appointments (
            reference_code, patient_id, patient_name, mobile, email,
            treatment_id, treatment_name, preferred_dentist,
            appointment_date, time_slot, duration_minutes, notes,
            consent_accepted, status, reschedule_request, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          refCode,
          patientRow.id,
          patientName,
          mobile,
          email,
          treatmentId,
          String(row.treatment_name || 'Dental Consultation'),
          String(row.preferred_dentist || 'Dr. Abdul Khadir'),
          appointmentDate,
          timeSlot,
          Number(row.duration_minutes || 30),
          String(row.notes || ''),
          row.consent_accepted === false ? 0 : 1,
          String(row.status || 'Pending'),
          row.reschedule_request ? String(row.reschedule_request) : null,
          row.created_at ? String(row.created_at) : new Date().toISOString(),
          row.updated_at ? String(row.updated_at) : new Date().toISOString()
        );
        pulled++;
      } else if (sbUpdatedMs > localUpdatedMs + 2000) {
        db.prepare(`
          UPDATE appointments
          SET patient_name = ?, mobile = ?, email = ?,
              treatment_name = ?, preferred_dentist = ?,
              appointment_date = ?, time_slot = ?, duration_minutes = ?,
              notes = ?, status = ?, reschedule_request = ?, updated_at = ?
          WHERE id = ?
        `).run(
          patientName,
          mobile,
          email,
          String(row.treatment_name || 'Dental Consultation'),
          String(row.preferred_dentist || 'Dr. Abdul Khadir'),
          appointmentDate,
          timeSlot,
          Number(row.duration_minutes || 30),
          String(row.notes || ''),
          String(row.status || 'Pending'),
          row.reschedule_request ? String(row.reschedule_request) : null,
          String(row.updated_at),
          existingAppt.id
        );
        pulled++;
      }
    }

    return { pulled };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError('supabase:pull_appointments', msg);
    return { pulled: 0, note: `Supabase pull failed: ${msg}` };
  }
}

export async function deleteAppointmentFromSupabase(
  referenceCode: string
): Promise<{ deleted: boolean; error?: string }> {
  const client = getSupabaseClient();
  if (!client) {
    return { deleted: false, error: 'Supabase client unavailable' };
  }
  if (getActiveKey().mode !== 'service_role') {
    return {
      deleted: false,
      error: 'Deleting rows directly in Supabase requires SUPABASE_SERVICE_ROLE_KEY in Secrets.',
    };
  }
  try {
    const { error } = await client
      .from('appointments')
      .delete()
      .eq('reference_code', referenceCode);
    if (error) {
      logError('supabase:delete_appointment', error.message);
      return { deleted: false, error: error.message };
    }
    return { deleted: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logError('supabase:delete_appointment', msg);
    return { deleted: false, error: msg };
  }
}

import { db } from './db.ts';
import type { Appointment } from '../src/types.ts';

function recordNotification(params: {
  appointmentId: number | null;
  channel: 'email' | 'whatsapp' | 'admin_alert';
  recipient: string;
  subject: string;
  message: string;
  status: 'queued' | 'sent' | 'skipped_unconfigured' | 'failed';
  providerResponse: string;
}): void {
  db.prepare(`
    INSERT INTO notifications (appointment_id, channel, recipient, subject, message, status, provider_response)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    params.appointmentId,
    params.channel,
    params.recipient,
    params.subject,
    params.message,
    params.status,
    params.providerResponse.slice(0, 1000)
  );
}

async function sendResendEmail(to: string, subject: string, textBody: string): Promise<{ ok: boolean; status: 'sent' | 'skipped_unconfigured' | 'failed'; detail: string }> {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim() || 'MED Rx Dental Centre <appointments@medrxdental.in>';
  if (!apiKey) {
    return {
      ok: false,
      status: 'skipped_unconfigured',
      detail: 'RESEND_API_KEY not configured; logged for manual follow-up.',
    };
  }
  try {
    const resp = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from,
        to: [to],
        subject,
        text: textBody,
      }),
    });
    const bodyText = await resp.text();
    if (!resp.ok) {
      return { ok: false, status: 'failed', detail: `HTTP ${resp.status}: ${bodyText}` };
    }
    return { ok: true, status: 'sent', detail: bodyText };
  } catch (err) {
    return {
      ok: false,
      status: 'failed',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

async function sendWhatsAppTemplateOrText(toE164Digits: string, bodyText: string): Promise<{ ok: boolean; status: 'sent' | 'skipped_unconfigured' | 'failed'; detail: string }> {
  const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
  if (!token || !phoneNumberId) {
    return {
      ok: false,
      status: 'skipped_unconfigured',
      detail: 'WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID not configured. Official Meta WhatsApp Business Platform API ready when configured.',
    };
  }
  try {
    const resp = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(phoneNumberId)}/messages`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: toE164Digits,
        type: 'text',
        text: { body: bodyText },
      }),
    });
    const respText = await resp.text();
    if (!resp.ok) {
      return { ok: false, status: 'failed', detail: `HTTP ${resp.status}: ${respText}` };
    }
    return { ok: true, status: 'sent', detail: respText };
  } catch (err) {
    return {
      ok: false,
      status: 'failed',
      detail: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function dispatchBookingNotifications(appointment: Appointment): Promise<void> {
  const patientAckMessage =
    `Thank you for choosing MED Rx Dental Centre! Your appointment request (${appointment.referenceCode}) for ${appointment.treatmentName} on ${appointment.appointmentDate} at ${appointment.timeSlot} IST has been received. Our team will contact you to confirm your appointment. Clinic Phone: +91 99720 25712.`;

  // 1. Patient acknowledgement email (if email provided)
  if (appointment.email) {
    const emailRes = await sendResendEmail(
      appointment.email,
      `Appointment Request Received — ${appointment.referenceCode} | MED Rx Dental Centre`,
      patientAckMessage
    );
    recordNotification({
      appointmentId: appointment.id,
      channel: 'email',
      recipient: appointment.email,
      subject: `Appointment Request Received — ${appointment.referenceCode}`,
      message: patientAckMessage,
      status: emailRes.status,
      providerResponse: emailRes.detail,
    });
  }

  // 2. Clinic Administrator notification
  const adminEmail = process.env.CLINIC_ADMIN_EMAIL?.trim() || 'clinic-admin@medrxdental.local';
  const adminSubject = `New Appointment Request: ${appointment.patientName} (${appointment.referenceCode})`;
  const adminBody = `New booking request at MED Rx Dental Centre:\nReference: ${appointment.referenceCode}\nPatient: ${appointment.patientName}\nMobile: ${appointment.mobile}\nTreatment: ${appointment.treatmentName}\nRequested Slot: ${appointment.appointmentDate} at ${appointment.timeSlot} IST\nNotes: ${appointment.notes || 'None'}`;

  if (process.env.CLINIC_ADMIN_EMAIL?.trim()) {
    const adminRes = await sendResendEmail(adminEmail, adminSubject, adminBody);
    recordNotification({
      appointmentId: appointment.id,
      channel: 'admin_alert',
      recipient: adminEmail,
      subject: adminSubject,
      message: adminBody,
      status: adminRes.status,
      providerResponse: adminRes.detail,
    });
  } else {
    recordNotification({
      appointmentId: appointment.id,
      channel: 'admin_alert',
      recipient: 'Admin Dashboard Queue',
      subject: adminSubject,
      message: adminBody,
      status: 'queued',
      providerResponse: 'Recorded in clinic admin dashboard; configure CLINIC_ADMIN_EMAIL & RESEND_API_KEY for email forwarding.',
    });
  }

  // 3. Official WhatsApp Business Platform hook (only sends if credentials exist)
  const digits = appointment.mobile.replace(/\D/g, '');
  const waRes = await sendWhatsAppTemplateOrText(digits, patientAckMessage);
  recordNotification({
    appointmentId: appointment.id,
    channel: 'whatsapp',
    recipient: appointment.mobile,
    subject: `WhatsApp Acknowledgement (${appointment.referenceCode})`,
    message: patientAckMessage,
    status: waRes.status,
    providerResponse: waRes.detail,
  });
}

export async function dispatchStatusUpdateNotification(appointment: Appointment, note?: string): Promise<void> {
  const message =
    appointment.status === 'Confirmed'
      ? `Your appointment at MED Rx Dental Centre (${appointment.referenceCode}) for ${appointment.treatmentName} on ${appointment.appointmentDate} at ${appointment.timeSlot} IST is now CONFIRMED. Address: 50, 1st Main, 4th Cross Rd, Annapoorneshwari Nagar, Nagarbhavi, Bengaluru.`
      : `Update on your MED Rx Dental Centre appointment (${appointment.referenceCode}): Status is now ${appointment.status}${note ? ` (${note})` : ''}. Call +91 99720 25712 for assistance.`;

  if (appointment.email) {
    const emailRes = await sendResendEmail(
      appointment.email,
      `Appointment ${appointment.status} — ${appointment.referenceCode} | MED Rx Dental Centre`,
      message
    );
    recordNotification({
      appointmentId: appointment.id,
      channel: 'email',
      recipient: appointment.email,
      subject: `Appointment ${appointment.status} — ${appointment.referenceCode}`,
      message,
      status: emailRes.status,
      providerResponse: emailRes.detail,
    });
  }

  const digits = appointment.mobile.replace(/\D/g, '');
  const waRes = await sendWhatsAppTemplateOrText(digits, message);
  recordNotification({
    appointmentId: appointment.id,
    channel: 'whatsapp',
    recipient: appointment.mobile,
    subject: `WhatsApp Status Update (${appointment.referenceCode})`,
    message,
    status: waRes.status,
    providerResponse: waRes.detail,
  });
}

export function getIntegrationStatus(): {
  emailConfigured: boolean;
  adminEmailConfigured: boolean;
  whatsappConfigured: boolean;
} {
  return {
    emailConfigured: Boolean(process.env.RESEND_API_KEY?.trim()),
    adminEmailConfigured: Boolean(process.env.CLINIC_ADMIN_EMAIL?.trim()),
    whatsappConfigured: Boolean(
      process.env.WHATSAPP_ACCESS_TOKEN?.trim() && process.env.WHATSAPP_PHONE_NUMBER_ID?.trim()
    ),
  };
}

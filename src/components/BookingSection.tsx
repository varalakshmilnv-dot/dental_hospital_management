import { CalendarCheck2, CheckCircle2, Clock, MessageCircle, Phone, Search, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { CLINIC_INFO, formatTime12h, getKolkataTodayString } from '../constants.ts';
import type { Appointment, OperatingHour, TimeSlotAvailability, Treatment } from '../types.ts';

interface BookingSectionProps {
  treatments: Treatment[];
  operatingHours: OperatingHour[];
  dentistName: string;
  initialTreatmentId?: number | null;
  isModal?: boolean;
  onClose?: () => void;
  onOpenPrivacy: () => void;
}

export function BookingSection({
  treatments,
  operatingHours,
  dentistName,
  initialTreatmentId,
  isModal = false,
  onClose,
  onOpenPrivacy,
}: BookingSectionProps) {
  const [activeTab, setActiveTab] = useState<'book' | 'manage'>('book');

  // Booking form state
  const [patientName, setPatientName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [treatmentId, setTreatmentId] = useState<number>(
    initialTreatmentId || treatments[0]?.id || 1
  );
  const [preferredDentist, setPreferredDentist] = useState(dentistName || 'Dr. Abdul Khadir');
  const [appointmentDate, setAppointmentDate] = useState<string>(getKolkataTodayString());
  const [timeSlot, setTimeSlot] = useState<string>('');
  const [notes, setNotes] = useState('');
  const [consentAccepted, setConsentAccepted] = useState(false);
  const [honeypot, setHoneypot] = useState('');

  // Slot loading state
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [slotInfo, setSlotInfo] = useState<{
    isOpen: boolean;
    dayName: string;
    openTime: string;
    closeTime: string;
    slots: TimeSlotAvailability[];
    closedReason?: string;
  } | null>(null);

  // Submission state
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [confirmedResult, setConfirmedResult] = useState<{
    appointment: Appointment;
    message: string;
  } | null>(null);

  // Manage / Reschedule lookup state
  const [lookupRef, setLookupRef] = useState('');
  const [lookupMobile, setLookupMobile] = useState('');
  const [lookupLoading, setLookupLoading] = useState(false);
  const [lookupError, setLookupError] = useState('');
  const [foundAppointment, setFoundAppointment] = useState<Appointment | null>(null);
  const [rescheduleDate, setRescheduleDate] = useState(getKolkataTodayString());
  const [rescheduleSlots, setRescheduleSlots] = useState<TimeSlotAvailability[]>([]);
  const [rescheduleTime, setRescheduleTime] = useState('');
  const [actionReason, setActionReason] = useState('');
  const [actionFeedback, setActionFeedback] = useState('');

  useEffect(() => {
    if (initialTreatmentId) {
      setTreatmentId(initialTreatmentId);
    }
  }, [initialTreatmentId]);

  useEffect(() => {
    let ignore = false;
    async function loadSlots() {
      if (!appointmentDate) return;
      setSlotsLoading(true);
      setTimeSlot('');
      try {
        const res = await fetch(
          `/api/slots?date=${encodeURIComponent(appointmentDate)}&treatmentId=${encodeURIComponent(String(treatmentId))}`
        );
        const data = await res.json();
        if (!ignore) {
          setSlotInfo(data);
        }
      } catch {
        if (!ignore) {
          setSlotInfo(null);
        }
      } finally {
        if (!ignore) setSlotsLoading(false);
      }
    }
    loadSlots();
    return () => {
      ignore = true;
    };
  }, [appointmentDate, treatmentId]);

  useEffect(() => {
    let ignore = false;
    async function loadRescheduleSlots() {
      if (!foundAppointment || !rescheduleDate) return;
      try {
        const res = await fetch(
          `/api/slots?date=${encodeURIComponent(rescheduleDate)}&treatmentId=${encodeURIComponent(
            String(foundAppointment.treatmentId || '')
          )}`
        );
        const data = await res.json();
        if (!ignore) {
          setRescheduleSlots(data.slots || []);
          setRescheduleTime('');
        }
      } catch {
        if (!ignore) setRescheduleSlots([]);
      }
    }
    loadRescheduleSlots();
    return () => {
      ignore = true;
    };
  }, [foundAppointment, rescheduleDate]);

  async function handleSubmitBooking(e: FormEvent) {
    e.preventDefault();
    setSubmitError('');

    if (!patientName.trim()) {
      setSubmitError('Please enter the patient full name.');
      return;
    }
    const cleanedMobile = mobile.replace(/[\s\-()]/g, '');
    if (!/^(?:\+91|91|0)?[6-9]\d{9}$/.test(cleanedMobile)) {
      setSubmitError('Please enter a valid 10-digit Indian mobile number (starting with 6–9).');
      return;
    }
    if (!timeSlot) {
      setSubmitError('Please select an available time slot.');
      return;
    }
    if (!consentAccepted) {
      setSubmitError('Please accept the Privacy Policy before submitting.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch('/api/appointments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          patientName,
          mobile,
          email,
          treatmentId,
          preferredDentist,
          appointmentDate,
          timeSlot,
          notes,
          consentAccepted,
          website: honeypot,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSubmitError(data.error || 'Could not submit appointment request.');
      } else {
        setConfirmedResult(data);
        setLookupRef(data.appointment.referenceCode);
        setLookupMobile(data.appointment.mobile);
      }
    } catch {
      setSubmitError('Network error while submitting. Please call +91 99720 25712.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLookup(e: FormEvent) {
    e.preventDefault();
    setLookupError('');
    setActionFeedback('');
    setLookupLoading(true);
    try {
      const res = await fetch('/api/appointments/lookup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ referenceCode: lookupRef, mobile: lookupMobile }),
      });
      const data = await res.json();
      if (!res.ok) {
        setFoundAppointment(null);
        setLookupError(data.error || 'Appointment not found.');
      } else {
        setFoundAppointment(data.appointment);
        setRescheduleDate(data.appointment.appointmentDate);
      }
    } catch {
      setLookupError('Unable to check appointment right now.');
    } finally {
      setLookupLoading(false);
    }
  }

  async function handlePatientAction(action: 'cancel' | 'reschedule') {
    if (!foundAppointment) return;
    setActionFeedback('');
    setLookupError('');
    try {
      const res = await fetch('/api/appointments/patient-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceCode: foundAppointment.referenceCode,
          mobile: foundAppointment.mobile,
          action,
          requestedDate: rescheduleDate,
          requestedTime: rescheduleTime,
          reason: actionReason,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLookupError(data.error || 'Unable to process request.');
      } else {
        setFoundAppointment(data.appointment);
        setActionFeedback(data.message);
      }
    } catch {
      setLookupError('Network error while updating appointment.');
    }
  }

  const todayMin = getKolkataTodayString();

  const innerContent = (
    <div className="bg-white rounded-2xl border border-[#142B45]/10 overflow-hidden shadow-sm">
      {/* Header strip */}
      <div className="px-6 py-5 bg-[#142B45] text-white flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs text-[#C6A879] font-medium">Asia/Kolkata (IST) · Appointments by Confirmation</p>
          <h2 className="font-display text-xl sm:text-2xl font-bold mt-0.5">
            {confirmedResult ? 'Appointment Request Received' : 'Schedule Your Dental Visit'}
          </h2>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center p-1 bg-white/10 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setActiveTab('book');
              }}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'book' ? 'bg-white text-[#142B45]' : 'text-white/80 hover:text-white'
              }`}
            >
              Book Slot
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('manage')}
              className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'manage' ? 'bg-white text-[#142B45]' : 'text-white/80 hover:text-white'
              }`}
            >
              Manage Booking
            </button>
          </div>
          {isModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="w-9 h-9 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
              aria-label="Close booking modal"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {activeTab === 'book' ? (
        confirmedResult ? (
          /* Confirmation Screen */
          <div className="p-6 sm:p-8 space-y-6">
            <div className="p-5 rounded-xl bg-[#159C98]/10 border border-[#159C98]/25 flex items-start gap-4">
              <CheckCircle2 className="w-6 h-6 text-[#159C98] shrink-0 mt-0.5" />
              <div className="space-y-1.5">
                <p className="font-display font-semibold text-[#142B45] text-base">
                  {confirmedResult.message}
                </p>
                <p className="text-xs text-[#142B45]/75">
                  Status: <strong className="text-[#142B45]">Pending Clinic Confirmation</strong> — Your slot is held
                  as a request until our clinic desk calls or messages you to confirm.
                </p>
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 p-5 rounded-xl bg-[#FAF9F6] border border-[#142B45]/10 text-sm">
              <div>
                <p className="text-xs text-[#142B45]/60">Reference Number</p>
                <p className="font-display font-bold text-[#142B45] text-lg tabular-nums mt-0.5">
                  {confirmedResult.appointment.referenceCode}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#142B45]/60">Patient & Mobile</p>
                <p className="font-semibold text-[#142B45] mt-0.5">
                  {confirmedResult.appointment.patientName} · {confirmedResult.appointment.mobile}
                </p>
              </div>
              <div>
                <p className="text-xs text-[#142B45]/60">Requested Treatment</p>
                <p className="font-semibold text-[#142B45] mt-0.5">{confirmedResult.appointment.treatmentName}</p>
              </div>
              <div>
                <p className="text-xs text-[#142B45]/60">Requested Date & Time (IST)</p>
                <p className="font-semibold text-[#142B45] tabular-nums mt-0.5">
                  {confirmedResult.appointment.appointmentDate} · {formatTime12h(confirmedResult.appointment.timeSlot)}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex flex-wrap items-center gap-3">
                <a
                  href={`https://wa.me/919972025712?text=${encodeURIComponent(
                    `Hello MED Rx Dental Centre, I just submitted an appointment request (${confirmedResult.appointment.referenceCode}) for ${confirmedResult.appointment.treatmentName} on ${confirmedResult.appointment.appointmentDate} at ${formatTime12h(confirmedResult.appointment.timeSlot)}.`
                  )}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#159C98] text-white text-sm font-semibold hover:bg-[#142B45] transition-colors"
                >
                  <MessageCircle className="w-4 h-4" />
                  Follow Up on WhatsApp
                </a>
                <a
                  href={CLINIC_INFO.phoneHref}
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[#142B45]/20 text-[#142B45] text-sm font-medium hover:bg-[#EEF1F4] transition-colors"
                >
                  <Phone className="w-4 h-4" />
                  Call {CLINIC_INFO.phoneDisplay}
                </a>
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('manage');
                    setFoundAppointment(confirmedResult.appointment);
                    setRescheduleDate(confirmedResult.appointment.appointmentDate);
                  }}
                  className="text-sm font-medium text-[#159C98] hover:underline"
                >
                  Reschedule / Cancel
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setConfirmedResult(null);
                    setTimeSlot('');
                    setNotes('');
                  }}
                  className="px-4 py-2 rounded-lg bg-[#142B45] text-white text-sm font-medium hover:bg-[#159C98] transition-colors"
                >
                  Book Another
                </button>
              </div>
            </div>
          </div>
        ) : (
          /* Booking Form */
          <form onSubmit={handleSubmitBooking} className="p-6 sm:p-8 grid lg:grid-cols-12 gap-8">
            {/* Honeypot hidden field */}
            <input
              type="text"
              name="website"
              value={honeypot}
              onChange={(e) => setHoneypot(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              className="hidden"
              aria-hidden="true"
            />

            <div className="lg:col-span-7 space-y-5">
              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="booking-name" className="block text-xs font-semibold text-[#142B45] mb-1.5">
                    Patient Full Name *
                  </label>
                  <input
                    id="booking-name"
                    type="text"
                    required
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                    placeholder="e.g. Aarav Sharma"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#142B45]/20 bg-[#FAF9F6] text-sm text-[#142B45] focus:outline-none focus:border-[#159C98]"
                  />
                </div>
                <div>
                  <label htmlFor="booking-mobile" className="block text-xs font-semibold text-[#142B45] mb-1.5">
                    Indian Mobile Number *
                  </label>
                  <input
                    id="booking-mobile"
                    type="tel"
                    required
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#142B45]/20 bg-[#FAF9F6] text-sm text-[#142B45] tabular-nums focus:outline-none focus:border-[#159C98]"
                  />
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="booking-email" className="block text-xs font-semibold text-[#142B45] mb-1.5">
                    Email Address (Optional)
                  </label>
                  <input
                    id="booking-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#142B45]/20 bg-[#FAF9F6] text-sm text-[#142B45] focus:outline-none focus:border-[#159C98]"
                  />
                </div>
                <div>
                  <label htmlFor="booking-dentist" className="block text-xs font-semibold text-[#142B45] mb-1.5">
                    Preferred Dentist
                  </label>
                  <select
                    id="booking-dentist"
                    value={preferredDentist}
                    onChange={(e) => setPreferredDentist(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#142B45]/20 bg-[#FAF9F6] text-sm text-[#142B45] focus:outline-none focus:border-[#159C98]"
                  >
                    <option value={dentistName}>{dentistName}</option>
                    <option value="First Available Specialist">First Available Dental Specialist</option>
                  </select>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="booking-treatment" className="block text-xs font-semibold text-[#142B45] mb-1.5">
                    Dental Treatment *
                  </label>
                  <select
                    id="booking-treatment"
                    value={treatmentId}
                    onChange={(e) => setTreatmentId(Number(e.target.value))}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#142B45]/20 bg-[#FAF9F6] text-sm text-[#142B45] focus:outline-none focus:border-[#159C98]"
                  >
                    {treatments.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.durationMinutes} min)
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label htmlFor="booking-date" className="block text-xs font-semibold text-[#142B45] mb-1.5">
                    Preferred Date *
                  </label>
                  <input
                    id="booking-date"
                    type="date"
                    required
                    min={todayMin}
                    value={appointmentDate}
                    onChange={(e) => setAppointmentDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#142B45]/20 bg-[#FAF9F6] text-sm text-[#142B45] tabular-nums focus:outline-none focus:border-[#159C98]"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold text-[#142B45]">
                    Select Available Time Slot (IST) *
                  </span>
                  {slotInfo?.isOpen && (
                    <span className="text-xs text-[#142B45]/65 tabular-nums">
                      {slotInfo.dayName}: {formatTime12h(slotInfo.openTime)} – {formatTime12h(slotInfo.closeTime)}
                    </span>
                  )}
                </div>

                {slotsLoading ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                    {Array.from({ length: 8 }).map((_, idx) => (
                      <div key={idx} className="h-10 rounded-lg bg-[#EEF1F4] animate-pulse" />
                    ))}
                  </div>
                ) : !slotInfo?.isOpen ? (
                  <div className="p-4 rounded-xl bg-[#FAF9F6] border border-[#142B45]/10 text-sm text-[#142B45]/75">
                    {slotInfo?.closedReason || 'No slots available on this date.'}
                  </div>
                ) : (
                  <div className="grid grid-cols-3 sm:grid-cols-4 gap-2 max-h-52 overflow-y-auto pr-1">
                    {slotInfo.slots.map((s) => {
                      const selected = timeSlot === s.time;
                      return (
                        <button
                          key={s.time}
                          type="button"
                          disabled={!s.available}
                          onClick={() => setTimeSlot(s.time)}
                          title={s.available ? `Request ${s.label}` : s.reason}
                          className={`px-2.5 py-2 rounded-lg text-xs font-medium tabular-nums border transition-colors ${
                            !s.available
                              ? 'bg-[#EEF1F4]/60 border-[#142B45]/5 text-[#142B45]/35 cursor-not-allowed line-through'
                              : selected
                                ? 'bg-[#142B45] border-[#142B45] text-white'
                                : 'bg-white border-[#142B45]/15 text-[#142B45] hover:border-[#159C98] hover:text-[#159C98]'
                          }`}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <label htmlFor="booking-notes" className="block text-xs font-semibold text-[#142B45] mb-1.5">
                  Additional Message or Dental Concern
                </label>
                <textarea
                  id="booking-notes"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Briefly describe any tooth sensitivity, pain, or preferences..."
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#142B45]/20 bg-[#FAF9F6] text-sm text-[#142B45] focus:outline-none focus:border-[#159C98]"
                />
              </div>

              <label className="flex items-start gap-2.5 text-xs text-[#142B45]/80 cursor-pointer">
                <input
                  type="checkbox"
                  checked={consentAccepted}
                  onChange={(e) => setConsentAccepted(e.target.checked)}
                  className="mt-0.5 rounded border-[#142B45]/30 text-[#159C98] focus:ring-[#159C98]"
                />
                <span>
                  I agree to the{' '}
                  <button
                    type="button"
                    onClick={onOpenPrivacy}
                    className="underline text-[#159C98] font-medium hover:text-[#142B45]"
                  >
                    Privacy Policy
                  </button>{' '}
                  and consent to MED Rx Dental Centre contacting me via phone, email, or WhatsApp to confirm my
                  appointment request.
                </span>
              </label>

              {submitError && (
                <div role="alert" className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-800">
                  {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[#142B45] text-white text-sm font-semibold hover:bg-[#159C98] disabled:opacity-60 transition-colors"
              >
                <CalendarCheck2 className="w-4 h-4" />
                {submitting ? 'Submitting Request...' : 'Request Appointment'}
              </button>
            </div>

            {/* Right Sidebar: Clinic Operating Hours & Booking Guidance */}
            <div className="lg:col-span-5 bg-[#FAF9F6] rounded-xl border border-[#142B45]/10 p-5 sm:p-6 space-y-5 self-start">
              <div>
                <h3 className="font-display font-semibold text-[#142B45] text-base flex items-center gap-2">
                  <Clock className="w-4 h-4 text-[#159C98]" />
                  Clinic Operating Hours
                </h3>
                <p className="text-xs text-[#142B45]/65 mt-1">
                  Sundays close at 2:00 PM IST. Unavailable slots are automatically disabled.
                </p>
                <dl className="mt-4 divide-y divide-[#142B45]/10 text-xs">
                  {operatingHours.map((h) => (
                    <div key={h.dayOfWeek} className="py-2 flex items-center justify-between gap-4">
                      <dt className="font-medium text-[#142B45]">{h.dayName}</dt>
                      <dd className="tabular-nums text-[#142B45]/75">
                        {h.isOpen ? `${formatTime12h(h.openTime)} – ${formatTime12h(h.closeTime)}` : 'Closed'}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>

              <div className="pt-4 border-t border-[#142B45]/10 space-y-2.5 text-xs text-[#142B45]/75">
                <p className="font-semibold text-[#142B45]">Need Urgent Assistance?</p>
                <p>Call our reception desk directly or message us on WhatsApp for same-day toothache enquiries.</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <a
                    href={CLINIC_INFO.phoneHref}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-white border border-[#142B45]/15 text-[#142B45] font-medium hover:border-[#159C98]"
                  >
                    <Phone className="w-3.5 h-3.5 text-[#159C98]" />
                    {CLINIC_INFO.phoneDisplay}
                  </a>
                  <a
                    href={CLINIC_INFO.whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-[#159C98] text-white font-medium hover:bg-[#142B45]"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    WhatsApp Us
                  </a>
                </div>
              </div>
            </div>
          </form>
        )
      ) : (
        /* Manage / Reschedule / Cancel Booking Tab */
        <div className="p-6 sm:p-8 space-y-6">
          <form onSubmit={handleLookup} className="grid sm:grid-cols-3 gap-4 items-end">
            <div>
              <label htmlFor="lookup-ref" className="block text-xs font-semibold text-[#142B45] mb-1.5">
                Reference Code
              </label>
              <input
                id="lookup-ref"
                type="text"
                required
                value={lookupRef}
                onChange={(e) => setLookupRef(e.target.value)}
                placeholder="e.g. MRX-261125-A1B2C3"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#142B45]/20 bg-[#FAF9F6] text-sm text-[#142B45] uppercase tabular-nums focus:outline-none focus:border-[#159C98]"
              />
            </div>
            <div>
              <label htmlFor="lookup-mobile" className="block text-xs font-semibold text-[#142B45] mb-1.5">
                Registered Mobile Number
              </label>
              <input
                id="lookup-mobile"
                type="tel"
                required
                value={lookupMobile}
                onChange={(e) => setLookupMobile(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full px-3.5 py-2.5 rounded-lg border border-[#142B45]/20 bg-[#FAF9F6] text-sm text-[#142B45] tabular-nums focus:outline-none focus:border-[#159C98]"
              />
            </div>
            <button
              type="submit"
              disabled={lookupLoading}
              className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg bg-[#142B45] text-white text-sm font-semibold hover:bg-[#159C98] transition-colors h-[42px]"
            >
              <Search className="w-4 h-4" />
              {lookupLoading ? 'Checking...' : 'Find Booking'}
            </button>
          </form>

          {lookupError && (
            <div role="alert" className="p-3.5 rounded-lg bg-red-50 border border-red-200 text-xs font-medium text-red-800">
              {lookupError}
            </div>
          )}
          {actionFeedback && (
            <div className="p-3.5 rounded-lg bg-[#159C98]/10 border border-[#159C98]/25 text-xs font-medium text-[#142B45]">
              {actionFeedback}
            </div>
          )}

          {foundAppointment && (
            <div className="p-5 sm:p-6 rounded-xl bg-[#FAF9F6] border border-[#142B45]/10 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#142B45]/10 pb-4">
                <div>
                  <p className="text-xs text-[#142B45]/60">
                    {foundAppointment.referenceCode} · Status: <strong className="text-[#142B45]">{foundAppointment.status}</strong>
                  </p>
                  <h3 className="font-display text-lg font-bold text-[#142B45] mt-0.5">
                    {foundAppointment.treatmentName}
                  </h3>
                </div>
                <div className="text-right text-sm tabular-nums">
                  <p className="font-semibold text-[#142B45]">{foundAppointment.appointmentDate}</p>
                  <p className="text-xs text-[#142B45]/70">{formatTime12h(foundAppointment.timeSlot)} IST</p>
                </div>
              </div>

              {foundAppointment.rescheduleRequest && (
                <p className="text-xs text-[#142B45]/80 bg-white p-3 rounded-lg border border-[#142B45]/10">
                  Latest request: {foundAppointment.rescheduleRequest}
                </p>
              )}

              {foundAppointment.status !== 'Cancelled' && foundAppointment.status !== 'Completed' && (
                <div className="space-y-4">
                  <p className="text-xs font-semibold text-[#142B45]">Request a New Date/Time or Cancel</p>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <input
                      type="date"
                      min={todayMin}
                      value={rescheduleDate}
                      onChange={(e) => setRescheduleDate(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-[#142B45]/20 bg-white text-sm text-[#142B45] tabular-nums"
                    />
                    <select
                      value={rescheduleTime}
                      onChange={(e) => setRescheduleTime(e.target.value)}
                      className="px-3 py-2 rounded-lg border border-[#142B45]/20 bg-white text-sm text-[#142B45]"
                    >
                      <option value="">Select new time slot</option>
                      {rescheduleSlots
                        .filter((s) => s.available)
                        .map((s) => (
                          <option key={s.time} value={s.time}>
                            {s.label}
                          </option>
                        ))}
                    </select>
                    <input
                      type="text"
                      value={actionReason}
                      onChange={(e) => setActionReason(e.target.value)}
                      placeholder="Optional reason"
                      className="px-3 py-2 rounded-lg border border-[#142B45]/20 bg-white text-sm text-[#142B45]"
                    />
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      disabled={!rescheduleTime}
                      onClick={() => handlePatientAction('reschedule')}
                      className="px-4 py-2 rounded-lg bg-[#142B45] text-white text-xs font-semibold hover:bg-[#159C98] disabled:opacity-50 transition-colors"
                    >
                      Submit Reschedule Request
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePatientAction('cancel')}
                      className="px-4 py-2 rounded-lg border border-red-300 text-red-700 text-xs font-semibold hover:bg-red-50 transition-colors"
                    >
                      Cancel Appointment
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );

  if (isModal) {
    return (
      <div
        className="fixed inset-0 z-50 bg-[#142B45]/60 backdrop-blur-xs overflow-y-auto p-4 sm:p-6 flex items-start justify-center"
        role="dialog"
        aria-modal="true"
      >
        <div className="w-full max-w-4xl my-4">{innerContent}</div>
      </div>
    );
  }

  return innerContent;
}

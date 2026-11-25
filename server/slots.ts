import { db, getClinicContent, listBlockedSlots, listOperatingHours } from './db.ts';
import type { TimeSlotAvailability } from '../src/types.ts';

export function getKolkataTodayAndMinutes(): { todayStr: string; currentMinutes: number } {
  const now = new Date();
  const dateFmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const timeFmt = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const todayStr = dateFmt.format(now);
  const timeParts = timeFmt.format(now).split(':');
  const hh = Number(timeParts[0]) % 24;
  const mm = Number(timeParts[1]);
  return { todayStr, currentMinutes: hh * 60 + mm };
}

export function isValidDateString(dateStr: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return false;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export function getDayOfWeekFromDateStr(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

export function parseTimeToMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function formatMinutesToHHMM(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatMinutesTo12Hour(totalMinutes: number): string {
  const h24 = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function normalizeIndianMobile(input: string): string | null {
  const cleaned = input.replace(/[\s\-()]/g, '');
  const match = cleaned.match(/^(?:\+91|91|0)?([6-9]\d{9})$/);
  if (!match) return null;
  const tenDigits = match[1];
  return `+91 ${tenDigits.slice(0, 5)} ${tenDigits.slice(5)}`;
}

export function getAvailableSlotsForDate(
  dateStr: string,
  requestedDuration?: number
): {
  isOpen: boolean;
  dayName: string;
  openTime: string;
  closeTime: string;
  slots: TimeSlotAvailability[];
  closedReason?: string;
} {
  if (!isValidDateString(dateStr)) {
    return {
      isOpen: false,
      dayName: '',
      openTime: '',
      closeTime: '',
      slots: [],
      closedReason: 'Invalid date selected.',
    };
  }

  const { todayStr, currentMinutes } = getKolkataTodayAndMinutes();
  if (dateStr < todayStr) {
    return {
      isOpen: false,
      dayName: '',
      openTime: '',
      closeTime: '',
      slots: [],
      closedReason: 'Past dates cannot be booked.',
    };
  }

  const dow = getDayOfWeekFromDateStr(dateStr);
  const hoursList = listOperatingHours();
  const dayConfig = hoursList.find((h) => h.dayOfWeek === dow);

  if (!dayConfig || !dayConfig.isOpen) {
    return {
      isOpen: false,
      dayName: dayConfig?.dayName || '',
      openTime: '',
      closeTime: '',
      slots: [],
      closedReason: 'The clinic is closed on this day.',
    };
  }

  const blockedForDate = listBlockedSlots(dateStr).filter((b) => b.blockDate === dateStr);
  const fullDayBlock = blockedForDate.find((b) => b.allDay);
  if (fullDayBlock) {
    return {
      isOpen: false,
      dayName: dayConfig.dayName,
      openTime: dayConfig.openTime,
      closeTime: dayConfig.closeTime,
      slots: [],
      closedReason: fullDayBlock.reason || 'Clinic closed / unavailable on this date.',
    };
  }

  const clinicContent = getClinicContent();
  const duration = Math.max(15, Math.min(120, requestedDuration || clinicContent.defaultDurationMinutes || 30));
  const step = Math.max(15, Math.min(60, dayConfig.slotIntervalMinutes || 30));

  const openMin = parseTimeToMinutes(dayConfig.openTime);
  const closeMin = parseTimeToMinutes(dayConfig.closeTime);

  const confirmedRows = db
    .prepare(
      "SELECT time_slot, duration_minutes FROM appointments WHERE appointment_date = ? AND status = 'Confirmed'"
    )
    .all(dateStr) as Array<{ time_slot: string; duration_minutes: number }>;

  const confirmedRanges = confirmedRows.map((r) => {
    const s = parseTimeToMinutes(r.time_slot);
    return { start: s, end: s + Number(r.duration_minutes || 30) };
  });

  const partialBlocks = blockedForDate
    .filter((b) => !b.allDay && b.startTime && b.endTime)
    .map((b) => ({
      start: parseTimeToMinutes(b.startTime!),
      end: parseTimeToMinutes(b.endTime!),
      reason: b.reason || 'Unavailable',
    }));

  const slots: TimeSlotAvailability[] = [];

  for (let startMin = openMin; startMin + duration <= closeMin; startMin += step) {
    const endMin = startMin + duration;
    const hhmm = formatMinutesToHHMM(startMin);
    const label = formatMinutesTo12Hour(startMin);

    let available = true;
    let reason: string | undefined;

    if (dateStr === todayStr && startMin <= currentMinutes + 15) {
      available = false;
      reason = 'Time passed';
    } else if (confirmedRanges.some((c) => startMin < c.end && c.start < endMin)) {
      available = false;
      reason = 'Booked';
    } else {
      const hitBlock = partialBlocks.find((b) => startMin < b.end && b.start < endMin);
      if (hitBlock) {
        available = false;
        reason = hitBlock.reason;
      }
    }

    slots.push({ time: hhmm, label, available, reason });
  }

  return {
    isOpen: true,
    dayName: dayConfig.dayName,
    openTime: dayConfig.openTime,
    closeTime: dayConfig.closeTime,
    slots,
  };
}

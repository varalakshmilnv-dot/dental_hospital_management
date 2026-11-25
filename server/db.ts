import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type {
  Appointment,
  AppointmentStatus,
  BlockedSlot,
  ClinicContent,
  NotificationRecord,
  OperatingHour,
  Treatment,
} from '../src/types.ts';

const DATA_DIR = path.resolve(process.cwd(), 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

const DB_PATH = path.join(DATA_DIR, 'medrx_dental.sqlite');
export const db = new DatabaseSync(DB_PATH);

db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

export function initDatabase(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS patients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      full_name TEXT NOT NULL,
      mobile TEXT NOT NULL UNIQUE,
      email TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS treatments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      slug TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      short_description TEXT NOT NULL,
      detailed_description TEXT NOT NULL,
      what_to_expect TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 30,
      image_url TEXT NOT NULL,
      is_active INTEGER NOT NULL DEFAULT 1,
      sort_order INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reference_code TEXT NOT NULL UNIQUE,
      patient_id INTEGER NOT NULL,
      patient_name TEXT NOT NULL,
      mobile TEXT NOT NULL,
      email TEXT DEFAULT '',
      treatment_id INTEGER,
      treatment_name TEXT NOT NULL,
      preferred_dentist TEXT NOT NULL DEFAULT 'Dr. Abdul Khadir (Subject to Availability)',
      appointment_date TEXT NOT NULL,
      time_slot TEXT NOT NULL,
      duration_minutes INTEGER NOT NULL DEFAULT 30,
      notes TEXT DEFAULT '',
      consent_accepted INTEGER NOT NULL DEFAULT 1,
      status TEXT NOT NULL DEFAULT 'Pending',
      reschedule_request TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (patient_id) REFERENCES patients(id)
    );

    CREATE INDEX IF NOT EXISTS idx_appointments_date ON appointments(appointment_date);
    CREATE INDEX IF NOT EXISTS idx_appointments_mobile ON appointments(mobile);
    CREATE INDEX IF NOT EXISTS idx_appointments_status ON appointments(status);

    CREATE TABLE IF NOT EXISTS operating_hours (
      day_of_week INTEGER PRIMARY KEY,
      day_name TEXT NOT NULL,
      is_open INTEGER NOT NULL DEFAULT 1,
      open_time TEXT NOT NULL,
      close_time TEXT NOT NULL,
      slot_interval_minutes INTEGER NOT NULL DEFAULT 30
    );

    CREATE TABLE IF NOT EXISTS blocked_slots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      block_date TEXT NOT NULL,
      start_time TEXT,
      end_time TEXT,
      all_day INTEGER NOT NULL DEFAULT 0,
      reason TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS admin_users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'owner',
      password_hash TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      appointment_id INTEGER,
      channel TEXT NOT NULL,
      recipient TEXT NOT NULL,
      subject TEXT DEFAULT '',
      message TEXT NOT NULL,
      status TEXT NOT NULL,
      provider_response TEXT DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS contact_messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      mobile TEXT NOT NULL,
      email TEXT DEFAULT '',
      subject TEXT DEFAULT '',
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS site_content (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS error_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      route TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  seedOperatingHours();
  seedTreatments();
  seedSiteContent();
}

function seedOperatingHours(): void {
  const countRow = db.prepare('SELECT COUNT(*) as c FROM operating_hours').get() as { c: number };
  if (countRow.c > 0) return;

  const days: Array<[number, string, number, string, string, number]> = [
    [0, 'Sunday', 1, '10:30', '14:00', 30],
    [1, 'Monday', 1, '10:30', '21:00', 30],
    [2, 'Tuesday', 1, '10:30', '21:00', 30],
    [3, 'Wednesday', 1, '10:30', '21:00', 30],
    [4, 'Thursday', 1, '10:30', '21:00', 30],
    [5, 'Friday', 1, '10:30', '21:00', 30],
    [6, 'Saturday', 1, '10:30', '21:00', 30],
  ];

  const stmt = db.prepare(
    'INSERT INTO operating_hours (day_of_week, day_name, is_open, open_time, close_time, slot_interval_minutes) VALUES (?, ?, ?, ?, ?, ?)'
  );
  for (const row of days) {
    stmt.run(...row);
  }
}

function seedTreatments(): void {
  const countRow = db.prepare('SELECT COUNT(*) as c FROM treatments').get() as { c: number };
  if (countRow.c > 0) return;

  const imgConsult = '/src/assets/images/care_consultation_1795623224295.jpg';
  const imgCosmetic = '/src/assets/images/care_cosmetic_smile_1795623224335.jpg';
  const imgRestorative = '/src/assets/images/care_restorative_craft_1795623223921.jpg';
  const imgFamily = '/src/assets/images/care_family_dental_1795623224851.jpg';
  const imgSuite = '/src/assets/images/hero_dental_suite_1795623222201.jpg';

  const initialTreatments: Array<{
    slug: string;
    name: string;
    category: Treatment['category'];
    shortDescription: string;
    detailedDescription: string;
    whatToExpect: string[];
    durationMinutes: number;
    imageUrl: string;
    sortOrder: number;
  }> = [
    {
      slug: 'general-dentistry',
      name: 'General Dentistry',
      category: 'General Dentistry',
      shortDescription: 'Comprehensive oral examinations, preventive checkups, and personalized care plans for lasting dental health.',
      detailedDescription: 'Routine preventive dentistry forms the foundation of comfortable long-term oral health. Each visit includes a careful clinical evaluation of teeth, gums, and bite alignment with clear guidance tailored to your needs.',
      whatToExpect: ['Thorough visual tooth and gum assessment', 'Digital imaging if clinically indicated', 'Clear explanation of findings and preventive options'],
      durationMinutes: 30,
      imageUrl: imgConsult,
      sortOrder: 1,
    },
    {
      slug: 'dental-consultation',
      name: 'Dental Consultation',
      category: 'General Dentistry',
      shortDescription: 'Unrushed one-on-one consultations to discuss tooth sensitivity, discomfort, or aesthetic goals clearly.',
      detailedDescription: 'Whether you are experiencing sudden sensitivity or planning future dental care, our consultations prioritize attentive listening, transparent explanations, and practical treatment options without pressure.',
      whatToExpect: ['Review of dental and medical history', 'Focused examination of areas of concern', 'Step-by-step discussion of suitable care pathways'],
      durationMinutes: 30,
      imageUrl: imgConsult,
      sortOrder: 2,
    },
    {
      slug: 'teeth-cleaning-and-scaling',
      name: 'Teeth Cleaning and Scaling',
      category: 'General Dentistry',
      shortDescription: 'Gentle ultrasonic scaling and polishing to remove plaque, tartar buildup, and surface stains.',
      detailedDescription: 'Professional oral prophylaxis helps maintain healthy gums and fresh breath by removing mineralized plaque along and beneath the gumline using gentle ultrasonic instruments and smooth polishing.',
      whatToExpect: ['Gentle ultrasonic tartar removal', 'Surface stain polishing for smoothness', 'Personalized brushing and interdental care guidance'],
      durationMinutes: 45,
      imageUrl: imgSuite,
      sortOrder: 3,
    },
    {
      slug: 'tooth-colored-fillings',
      name: 'Tooth-Colored Fillings',
      category: 'Restorative Care',
      shortDescription: 'Natural-shade composite restorations designed to repair cavities while blending with your enamel.',
      detailedDescription: 'Composite resin restorations repair areas affected by decay or minor enamel wear while preserving healthy tooth structure and matching the natural shade of adjacent teeth.',
      whatToExpect: ['Comfort-focused local anesthesia when needed', 'Gentle removal of decayed tooth structure', 'Shade-matched composite layering and bite polishing'],
      durationMinutes: 45,
      imageUrl: imgRestorative,
      sortOrder: 4,
    },
    {
      slug: 'root-canal-treatment',
      name: 'Root Canal Treatment',
      category: 'Restorative Care',
      shortDescription: 'Calm, precision endodontic therapy aimed at relieving toothache and preserving your natural tooth.',
      detailedDescription: 'When deep decay or trauma affects the inner pulp of a tooth, root canal therapy gently cleans and seals the root canal system under effective local comfort measures to help save the natural tooth.',
      whatToExpect: ['Digital radiograph assessment', 'Effective local numbing for patient comfort', 'Careful canal cleaning, shaping, and sealing'],
      durationMinutes: 60,
      imageUrl: imgConsult,
      sortOrder: 5,
    },
    {
      slug: 'dental-crowns-and-bridges',
      name: 'Dental Crowns and Bridges',
      category: 'Restorative Care',
      shortDescription: 'Custom-crafted ceramic and zirconia restorations to protect weakened teeth or replace missing gaps.',
      detailedDescription: 'Dental crowns reinforce structurally compromised or root-canal-treated teeth, while bridges span missing spaces cleanly. Every restoration is fitted carefully for natural bite comfort and aesthetics.',
      whatToExpect: ['Precision tooth preparation and impressions', 'Temporary protection while custom lab fabrication completes', 'Final shade, fit, and bite verification'],
      durationMinutes: 60,
      imageUrl: imgRestorative,
      sortOrder: 6,
    },
    {
      slug: 'dental-implants',
      name: 'Dental Implants',
      category: 'Restorative Care',
      shortDescription: 'Sturdy, natural-looking tooth replacement options evaluated through careful bone and bite planning.',
      detailedDescription: 'Dental implants offer a fixed foundation for replacing single or multiple missing teeth. Suitability depends on gum health, bone volume, and overall medical history, assessed thoroughly before planning.',
      whatToExpect: ['Comprehensive bone and gum evaluation', 'Individualized surgical and prosthetic timeline', 'Custom crown placement after integration'],
      durationMinutes: 60,
      imageUrl: imgRestorative,
      sortOrder: 7,
    },
    {
      slug: 'cosmetic-dentistry',
      name: 'Cosmetic Dentistry',
      category: 'Cosmetic & Orthodontics',
      shortDescription: 'Conservative aesthetic enhancements tailored to harmonize tooth shade, shape, and proportion.',
      detailedDescription: 'Cosmetic consultations focus on balanced, natural-looking improvements—from subtle composite bonding to ceramic veneers—respecting facial harmony and healthy tooth structure.',
      whatToExpect: ['Smile proportion and shade evaluation', 'Conservative treatment options comparison', 'Preview of planned aesthetic adjustments'],
      durationMinutes: 45,
      imageUrl: imgCosmetic,
      sortOrder: 8,
    },
    {
      slug: 'teeth-whitening',
      name: 'Teeth Whitening',
      category: 'Cosmetic & Orthodontics',
      shortDescription: 'Supervised clinical brightening procedures designed to gently lift deep lifestyle and dietary stains.',
      detailedDescription: 'Dentist-supervised whitening evaluates enamel sensitivity and existing restorations first, applying protective gum barriers and controlled brightening gels for safe, even results.',
      whatToExpect: ['Pre-treatment enamel and shade check', 'Protective gum isolation', 'Controlled clinical brightening session'],
      durationMinutes: 60,
      imageUrl: imgCosmetic,
      sortOrder: 9,
    },
    {
      slug: 'braces-and-orthodontics',
      name: 'Braces and Orthodontics',
      category: 'Cosmetic & Orthodontics',
      shortDescription: 'Structured orthodontic care for teens and adults to guide crowding, spacing, and bite alignment.',
      detailedDescription: 'Metal and ceramic orthodontic brackets gently guide teeth into healthier alignment over planned monthly reviews, supporting both bite function and ease of oral hygiene.',
      whatToExpect: ['Bite, arch, and photographic assessment', 'Discussion of bracket options and timelines', 'Scheduled monthly adjustments'],
      durationMinutes: 45,
      imageUrl: imgRestorative,
      sortOrder: 10,
    },
    {
      slug: 'clear-aligner-consultation',
      name: 'Clear Aligner Consultation',
      category: 'Cosmetic & Orthodontics',
      shortDescription: 'Discreet, removable orthodontic tray planning for suitable alignment and spacing concerns.',
      detailedDescription: 'Clear aligners offer a subtle, removable way to address mild-to-moderate crowding or spacing. A clinical consultation verifies candidacy and outlines expected tray wear schedules.',
      whatToExpect: ['Alignment evaluation and suitability check', 'Digital scan or impression planning', 'Review of projected stages and wear commitment'],
      durationMinutes: 45,
      imageUrl: imgRestorative,
      sortOrder: 11,
    },
    {
      slug: 'pediatric-dentistry',
      name: 'Pediatric Dentistry',
      category: 'Pediatric & Surgical',
      shortDescription: 'Patient, child-friendly dental checkups, gentle cleanings, and cavity prevention in a calm setting.',
      detailedDescription: 'Early positive dental visits help children build lifelong comfort with oral care. Our team moves at each child’s pace with clear, reassuring language for both young patients and parents.',
      whatToExpect: ['Unrushed, friendly introduction for children', 'Gentle examination of developing teeth', 'Preventive fluoride or sealant guidance when appropriate'],
      durationMinutes: 30,
      imageUrl: imgFamily,
      sortOrder: 12,
    },
    {
      slug: 'tooth-extraction',
      name: 'Tooth Extraction',
      category: 'Pediatric & Surgical',
      shortDescription: 'Careful, comfort-prioritized tooth removal and wisdom tooth assessment with clear aftercare support.',
      detailedDescription: 'When a severely damaged, non-restorable, or impacted wisdom tooth requires removal, procedures are performed gently under thorough local anesthesia with clear written healing guidance.',
      whatToExpect: ['Pre-extraction radiograph review', 'Thorough local numbing and gentle removal', 'Detailed post-operative comfort and recovery instructions'],
      durationMinutes: 45,
      imageUrl: imgSuite,
      sortOrder: 13,
    },
    {
      slug: 'smile-makeovers',
      name: 'Smile Makeovers',
      category: 'Cosmetic & Orthodontics',
      shortDescription: 'Coordinated multi-step restorative and cosmetic care planned thoughtfully around your goals.',
      detailedDescription: 'A smile makeover combines healthy foundational care with tailored restorative or cosmetic steps—such as whitening, alignment, or ceramics—sequenced transparently according to your clinical needs.',
      whatToExpect: ['Comprehensive diagnostic smile planning', 'Phased treatment options and transparent estimates', 'Coordinated follow-up and maintenance care'],
      durationMinutes: 60,
      imageUrl: imgCosmetic,
      sortOrder: 14,
    },
  ];

  const stmt = db.prepare(`
    INSERT INTO treatments (
      slug, name, category, short_description, detailed_description,
      what_to_expect, duration_minutes, image_url, is_active, sort_order
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
  `);

  for (const t of initialTreatments) {
    stmt.run(
      t.slug,
      t.name,
      t.category,
      t.shortDescription,
      t.detailedDescription,
      JSON.stringify(t.whatToExpect),
      t.durationMinutes,
      t.imageUrl,
      t.sortOrder
    );
  }
}

function seedSiteContent(): void {
  const existing = db.prepare('SELECT COUNT(*) as c FROM site_content').get() as { c: number };
  if (existing.c > 0) return;

  const defaultContent: ClinicContent = {
    heroHeadline: 'Your Smile Deserves Gentle, Expert Care.',
    heroSubheading:
      "Experience modern dentistry with a personal touch. From routine checkups to complete smile transformations, we're here to make every dental visit more comfortable.",
    aboutHeadline: 'Care That Puts Your Comfort First.',
    aboutStory:
      'At MED Rx Dental Centre in Nagarbhavi, Bengaluru, every appointment is built around unhurried listening, calm clinical spaces, and clear explanations. We take time to walk you through your oral health findings and available treatment choices—so children, adults, and seniors alike feel informed and at ease.',
    ctaHeadline: 'Ready to Take the First Step Toward a Healthier Smile?',
    ctaDescription: 'Book your dental appointment with MED Rx Dental Centre today.',
    defaultDurationMinutes: 30,
    googleReviewsVerified: false,
    googleRatingValue: '5.0',
    googleReviewCount: 143,
    verifiedReviews: [],
    dentist: {
      name: 'Dr. Abdul Khadir',
      designation: 'Lead Dental Surgeon (Details Pending Verification)',
      designationVerified: false,
      qualifications: 'Verified qualifications to be updated by clinic administration',
      qualificationsVerified: false,
      experience: 'Verified years of clinical experience to be updated by clinic',
      experienceVerified: false,
      registrationNumber: 'Pending verification',
      expertise: [
        'Comprehensive Dental Consultations',
        'Restorative & Root Canal Care',
        'Crowns, Bridges & Smile Planning',
        'Gentle Family Dentistry',
      ],
      bio: 'Dr. Abdul Khadir leads patient consultations at MED Rx Dental Centre with a calm, transparent approach—focusing on clear communication, gentle procedures, and comfortable care tailored to each patient. Exact academic degrees, registration credentials, and years of practice can be updated and verified directly through the clinic administrator dashboard.',
      portraitUrl: '/src/assets/images/dentist_portrait_1795623222992.jpg',
      portraitNote: 'Illustrative clinical portrait — clinic-supplied portrait can be updated via Admin.',
    },
  };

  db.prepare('INSERT INTO site_content (key, value) VALUES (?, ?)').run(
    'clinic_content',
    JSON.stringify(defaultContent)
  );
}

export function getClinicContent(): ClinicContent {
  const row = db.prepare('SELECT value FROM site_content WHERE key = ?').get('clinic_content') as
    | { value: string }
    | undefined;
  if (!row) {
    seedSiteContent();
    return getClinicContent();
  }
  return JSON.parse(row.value) as ClinicContent;
}

export function saveClinicContent(content: ClinicContent): void {
  db.prepare(
    "INSERT INTO site_content (key, value, updated_at) VALUES (?, ?, datetime('now')) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')"
  ).run('clinic_content', JSON.stringify(content));
}

export function listTreatments(includeInactive = false): Treatment[] {
  const rows = db
    .prepare(
      includeInactive
        ? 'SELECT * FROM treatments ORDER BY sort_order ASC, id ASC'
        : 'SELECT * FROM treatments WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'
    )
    .all() as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: Number(r.id),
    slug: String(r.slug),
    name: String(r.name),
    category: String(r.category) as Treatment['category'],
    shortDescription: String(r.short_description),
    detailedDescription: String(r.detailed_description),
    whatToExpect: JSON.parse(String(r.what_to_expect || '[]')) as string[],
    durationMinutes: Number(r.duration_minutes),
    imageUrl: String(r.image_url),
    isActive: Boolean(r.is_active),
    sortOrder: Number(r.sort_order),
  }));
}

export function listOperatingHours(): OperatingHour[] {
  const rows = db
    .prepare('SELECT * FROM operating_hours ORDER BY day_of_week ASC')
    .all() as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    dayOfWeek: Number(r.day_of_week),
    dayName: String(r.day_name),
    isOpen: Boolean(r.is_open),
    openTime: String(r.open_time),
    closeTime: String(r.close_time),
    slotIntervalMinutes: Number(r.slot_interval_minutes),
  }));
}

export function listBlockedSlots(fromDate?: string): BlockedSlot[] {
  const rows = (
    fromDate
      ? db
          .prepare('SELECT * FROM blocked_slots WHERE block_date >= ? ORDER BY block_date ASC, start_time ASC')
          .all(fromDate)
      : db.prepare('SELECT * FROM blocked_slots ORDER BY block_date ASC, start_time ASC').all()
  ) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: Number(r.id),
    blockDate: String(r.block_date),
    startTime: r.start_time ? String(r.start_time) : null,
    endTime: r.end_time ? String(r.end_time) : null,
    allDay: Boolean(r.all_day),
    reason: String(r.reason || ''),
    createdAt: String(r.created_at),
  }));
}

export function mapAppointmentRow(r: Record<string, unknown>): Appointment {
  return {
    id: Number(r.id),
    referenceCode: String(r.reference_code),
    patientId: Number(r.patient_id),
    patientName: String(r.patient_name),
    mobile: String(r.mobile),
    email: String(r.email || ''),
    treatmentId: r.treatment_id != null ? Number(r.treatment_id) : null,
    treatmentName: String(r.treatment_name),
    preferredDentist: String(r.preferred_dentist),
    appointmentDate: String(r.appointment_date),
    timeSlot: String(r.time_slot),
    durationMinutes: Number(r.duration_minutes),
    notes: String(r.notes || ''),
    consentAccepted: Boolean(r.consent_accepted),
    status: String(r.status) as AppointmentStatus,
    rescheduleRequest: r.reschedule_request ? String(r.reschedule_request) : null,
    createdAt: String(r.created_at),
    updatedAt: String(r.updated_at),
  };
}

export function logError(route: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  try {
    db.prepare('INSERT INTO error_logs (route, message) VALUES (?, ?)').run(route, msg.slice(0, 1000));
  } catch {
    // ignore logging failure
  }
}

export function listNotifications(limit = 50): NotificationRecord[] {
  const rows = db
    .prepare('SELECT * FROM notifications ORDER BY id DESC LIMIT ?')
    .all(limit) as Array<Record<string, unknown>>;

  return rows.map((r) => ({
    id: Number(r.id),
    appointmentId: r.appointment_id != null ? Number(r.appointment_id) : null,
    channel: String(r.channel) as NotificationRecord['channel'],
    recipient: String(r.recipient),
    subject: String(r.subject || ''),
    message: String(r.message),
    status: String(r.status) as NotificationRecord['status'],
    providerResponse: String(r.provider_response || ''),
    createdAt: String(r.created_at),
  }));
}

export type AppointmentStatus =
  | 'Pending'
  | 'Confirmed'
  | 'Completed'
  | 'Cancelled'
  | 'No-show';

export interface Treatment {
  id: number;
  slug: string;
  name: string;
  category: 'General Dentistry' | 'Restorative Care' | 'Cosmetic & Orthodontics' | 'Pediatric & Surgical';
  shortDescription: string;
  detailedDescription: string;
  whatToExpect: string[];
  durationMinutes: number;
  imageUrl: string;
  isActive: boolean;
  sortOrder: number;
}

export interface OperatingHour {
  dayOfWeek: number; // 0 = Sunday ... 6 = Saturday
  dayName: string;
  isOpen: boolean;
  openTime: string; // HH:mm
  closeTime: string; // HH:mm
  slotIntervalMinutes: number;
}

export interface BlockedSlot {
  id: number;
  blockDate: string; // YYYY-MM-DD
  startTime: string | null;
  endTime: string | null;
  allDay: boolean;
  reason: string;
  createdAt: string;
}

export interface Appointment {
  id: number;
  referenceCode: string;
  patientId: number;
  patientName: string;
  mobile: string;
  email: string;
  treatmentId: number | null;
  treatmentName: string;
  preferredDentist: string;
  appointmentDate: string; // YYYY-MM-DD
  timeSlot: string; // HH:mm
  durationMinutes: number;
  notes: string;
  consentAccepted: boolean;
  status: AppointmentStatus;
  rescheduleRequest: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationRecord {
  id: number;
  appointmentId: number | null;
  channel: 'email' | 'whatsapp' | 'admin_alert';
  recipient: string;
  subject: string;
  message: string;
  status: 'queued' | 'sent' | 'skipped_unconfigured' | 'failed';
  providerResponse: string;
  createdAt: string;
}

export interface VerifiedReview {
  id: string;
  authorName: string;
  rating: number;
  text: string;
  reviewDate: string;
}

export interface DentistProfile {
  name: string;
  designation: string;
  designationVerified: boolean;
  qualifications: string;
  qualificationsVerified: boolean;
  experience: string;
  experienceVerified: boolean;
  registrationNumber: string;
  expertise: string[];
  bio: string;
  portraitUrl: string;
  portraitNote: string;
}

export interface ClinicContent {
  heroHeadline: string;
  heroSubheading: string;
  aboutHeadline: string;
  aboutStory: string;
  ctaHeadline: string;
  ctaDescription: string;
  defaultDurationMinutes: number;
  googleReviewsVerified: boolean;
  googleRatingValue: string;
  googleReviewCount: number;
  verifiedReviews: VerifiedReview[];
  dentist: DentistProfile;
}

export interface TimeSlotAvailability {
  time: string;
  label: string;
  available: boolean;
  reason?: string;
}

export interface AdminStats {
  total: number;
  pending: number;
  confirmed: number;
  completed: number;
  cancelled: number;
  noShow: number;
  todayCount: number;
  upcomingCount: number;
}

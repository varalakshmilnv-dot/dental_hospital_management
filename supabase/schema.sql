-- MED Rx Dental Centre — Supabase PostgreSQL Schema & Public Booking Permissions
-- Project ID: jeyrykacwcahfpelifcp (Region: ap-south-1)
-- Run this script in your Supabase SQL Editor:
-- https://supabase.com/dashboard/project/jeyrykacwcahfpelifcp/sql/new

CREATE TABLE IF NOT EXISTS public.patients (
  id BIGSERIAL PRIMARY KEY,
  full_name TEXT NOT NULL,
  mobile TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.treatments (
  id BIGINT PRIMARY KEY,
  slug TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  short_description TEXT NOT NULL,
  detailed_description TEXT NOT NULL,
  what_to_expect JSONB NOT NULL DEFAULT '[]'::jsonb,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  image_url TEXT NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS public.appointments (
  id BIGSERIAL PRIMARY KEY,
  reference_code TEXT NOT NULL UNIQUE,
  patient_id BIGINT REFERENCES public.patients(id) ON DELETE SET NULL,
  patient_name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  treatment_id BIGINT,
  treatment_name TEXT NOT NULL,
  preferred_dentist TEXT NOT NULL DEFAULT 'Dr. Abdul Khadir',
  appointment_date DATE NOT NULL,
  time_slot TEXT NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 30,
  notes TEXT NOT NULL DEFAULT '',
  consent_accepted BOOLEAN NOT NULL DEFAULT TRUE,
  status TEXT NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Confirmed', 'Completed', 'Cancelled', 'No-show')),
  reschedule_request TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_appointments_date ON public.appointments(appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_mobile ON public.appointments(mobile);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);

CREATE TABLE IF NOT EXISTS public.operating_hours (
  day_of_week INTEGER PRIMARY KEY,
  day_name TEXT NOT NULL,
  is_open BOOLEAN NOT NULL DEFAULT TRUE,
  open_time TEXT NOT NULL,
  close_time TEXT NOT NULL,
  slot_interval_minutes INTEGER NOT NULL DEFAULT 30
);

CREATE TABLE IF NOT EXISTS public.blocked_slots (
  id BIGSERIAL PRIMARY KEY,
  block_date DATE NOT NULL,
  start_time TEXT,
  end_time TEXT,
  all_day BOOLEAN NOT NULL DEFAULT FALSE,
  reason TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id BIGSERIAL PRIMARY KEY,
  appointment_id BIGINT REFERENCES public.appointments(id) ON DELETE CASCADE,
  channel TEXT NOT NULL,
  recipient TEXT NOT NULL,
  subject TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  status TEXT NOT NULL,
  provider_response TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.contact_messages (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  mobile TEXT NOT NULL,
  email TEXT NOT NULL DEFAULT '',
  subject TEXT NOT NULL DEFAULT '',
  message TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.site_content (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Enable Row Level Security (RLS) on all tables
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.treatments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operating_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.blocked_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contact_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_content ENABLE ROW LEVEL SECURITY;

-- Grant explicit minimal table privileges to anon/authenticated roles
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT ON public.treatments, public.operating_hours, public.site_content TO anon, authenticated;
GRANT INSERT ON public.appointments, public.contact_messages TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.appointments_id_seq, public.contact_messages_id_seq TO anon, authenticated;

-- Public read-only access for non-sensitive catalog/schedule/content tables
DROP POLICY IF EXISTS "Public read treatments" ON public.treatments;
CREATE POLICY "Public read treatments" ON public.treatments FOR SELECT USING (is_active = TRUE);

DROP POLICY IF EXISTS "Public read operating_hours" ON public.operating_hours;
CREATE POLICY "Public read operating_hours" ON public.operating_hours FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS "Public read site_content" ON public.site_content;
CREATE POLICY "Public read site_content" ON public.site_content FOR SELECT USING (TRUE);

-- Insert-only policies (public key can submit bookings & enquiries, never read/update/delete others' PII)
DROP POLICY IF EXISTS "Public insert appointments" ON public.appointments;
CREATE POLICY "Public insert appointments" ON public.appointments FOR INSERT WITH CHECK (status = 'Pending' AND consent_accepted = TRUE);

DROP POLICY IF EXISTS "Public insert contact_messages" ON public.contact_messages;
CREATE POLICY "Public insert contact_messages" ON public.contact_messages FOR INSERT WITH CHECK (TRUE);

-- Atomic RPC for safe public booking submission (upserts patient + creates appointment without exposing SELECT)
CREATE OR REPLACE FUNCTION public.submit_clinic_booking(
  p_reference_code TEXT,
  p_patient_name TEXT,
  p_mobile TEXT,
  p_email TEXT,
  p_treatment_id BIGINT,
  p_treatment_name TEXT,
  p_preferred_dentist TEXT,
  p_appointment_date DATE,
  p_time_slot TEXT,
  p_duration_minutes INTEGER,
  p_notes TEXT,
  p_consent_accepted BOOLEAN
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_patient_id BIGINT;
BEGIN
  IF p_consent_accepted IS NOT TRUE THEN
    RAISE EXCEPTION 'Privacy consent is required';
  END IF;

  INSERT INTO public.patients (full_name, mobile, email, updated_at)
  VALUES (p_patient_name, p_mobile, COALESCE(p_email, ''), NOW())
  ON CONFLICT (mobile) DO UPDATE
    SET full_name = EXCLUDED.full_name,
        email = CASE WHEN EXCLUDED.email <> '' THEN EXCLUDED.email ELSE public.patients.email END,
        updated_at = NOW()
  RETURNING id INTO v_patient_id;

  INSERT INTO public.appointments (
    reference_code,
    patient_id,
    patient_name,
    mobile,
    email,
    treatment_id,
    treatment_name,
    preferred_dentist,
    appointment_date,
    time_slot,
    duration_minutes,
    notes,
    consent_accepted,
    status,
    updated_at
  )
  VALUES (
    p_reference_code,
    v_patient_id,
    p_patient_name,
    p_mobile,
    COALESCE(p_email, ''),
    p_treatment_id,
    p_treatment_name,
    COALESCE(p_preferred_dentist, 'Dr. Abdul Khadir'),
    p_appointment_date,
    p_time_slot,
    COALESCE(p_duration_minutes, 30),
    COALESCE(p_notes, ''),
    TRUE,
    'Pending',
    NOW()
  )
  ON CONFLICT (reference_code) DO NOTHING;
END;
$$;

REVOKE ALL ON FUNCTION public.submit_clinic_booking(TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, DATE, TEXT, INTEGER, TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_clinic_booking(TEXT, TEXT, TEXT, TEXT, BIGINT, TEXT, TEXT, DATE, TEXT, INTEGER, TEXT, BOOLEAN) TO anon, authenticated, service_role;

-- Atomic RPC for contact enquiries
CREATE OR REPLACE FUNCTION public.submit_contact_message(
  p_name TEXT,
  p_mobile TEXT,
  p_email TEXT,
  p_subject TEXT,
  p_message TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.contact_messages (name, mobile, email, subject, message)
  VALUES (p_name, p_mobile, COALESCE(p_email, ''), COALESCE(p_subject, ''), p_message);
END;
$$;

REVOKE ALL ON FUNCTION public.submit_contact_message(TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.submit_contact_message(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

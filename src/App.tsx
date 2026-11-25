import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  ExternalLink,
  MapPin,
  MessageCircle,
  Phone,
  Shield,
  Star,
} from 'lucide-react';
import { motion } from 'motion/react';
import { useCallback, useEffect, useState } from 'react';
import { AdminDashboard } from './components/AdminDashboard.tsx';
import { BookingSection } from './components/BookingSection.tsx';
import { LegalModal } from './components/LegalModal.tsx';
import { LocationMapCard } from './components/LocationMapCard.tsx';
import { Navbar } from './components/Navbar.tsx';
import { TreatmentModal } from './components/TreatmentModal.tsx';
import { CLINIC_IMAGES, CLINIC_INFO, formatTime12h } from './constants.ts';
import type { ClinicContent, OperatingHour, Treatment } from './types.ts';

function SafeImage({
  src,
  alt,
  className,
  fallbackTitle,
}: {
  src: string;
  alt: string;
  className?: string;
  fallbackTitle: string;
}) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div
        className={`bg-gradient-to-br from-[#142B45] to-[#159C98] flex items-center justify-center p-6 text-center text-white font-display font-semibold ${className || ''}`}
      >
        <span>{fallbackTitle}</span>
      </div>
    );
  }
  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}

function getInitialView(): 'home' | 'booking' | 'admin' {
  if (typeof window === 'undefined') return 'home';
  const path = window.location.pathname.toLowerCase();
  const hash = window.location.hash.toLowerCase();
  const params = new URLSearchParams(window.location.search);
  if (path === '/admin' || path === '/admin/' || hash === '#admin' || params.has('admin') || params.get('view') === 'admin') {
    return 'admin';
  }
  if (path === '/book' || path === '/booking' || hash === '#booking' || params.get('view') === 'booking') {
    return 'booking';
  }
  return 'home';
}

export default function App() {
  const [activeView, setActiveView] = useState<'home' | 'booking' | 'admin'>(getInitialView);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [selectedTreatmentId, setSelectedTreatmentId] = useState<number | null>(null);
  const [detailTreatment, setDetailTreatment] = useState<Treatment | null>(null);
  const [legalModal, setLegalModal] = useState<'privacy' | 'terms' | null>(null);
  const [categoryFilter, setCategoryFilter] = useState<string>('All');

  const [treatments, setTreatments] = useState<Treatment[]>([]);
  const [operatingHours, setOperatingHours] = useState<OperatingHour[]>([]);
  const [content, setContent] = useState<ClinicContent | null>(null);
  const [loadingClinic, setLoadingClinic] = useState(true);

  const loadClinicData = useCallback(async () => {
    try {
      const res = await fetch('/api/clinic-data');
      if (!res.ok) return;
      const data = await res.json();
      setTreatments(data.treatments || []);
      setOperatingHours(data.operatingHours || []);
      setContent(data.content || null);
    } catch {
      // fallback handled below
    } finally {
      setLoadingClinic(false);
    }
  }, []);

  useEffect(() => {
    loadClinicData();
  }, [loadClinicData]);

  useEffect(() => {
    const syncFromUrl = () => {
      setActiveView(getInitialView());
    };
    window.addEventListener('popstate', syncFromUrl);
    window.addEventListener('hashchange', syncFromUrl);
    return () => {
      window.removeEventListener('popstate', syncFromUrl);
      window.removeEventListener('hashchange', syncFromUrl);
    };
  }, []);

  const openAdminView = () => {
    setActiveView('admin');
    if (window.location.pathname !== '/admin') {
      window.history.pushState(null, '', '/admin');
    }
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  const handleNavigateHome = (sectionId?: string) => {
    setActiveView('home');
    if (window.location.pathname === '/admin' || window.location.pathname === '/admin/' || window.location.hash === '#admin') {
      window.history.pushState(null, '', sectionId && sectionId !== 'top' ? `/#${sectionId}` : '/');
    }
    if (sectionId) {
      setTimeout(() => {
        if (sectionId === 'top') {
          window.scrollTo({ top: 0, behavior: 'smooth' });
        } else {
          document.getElementById(sectionId)?.scrollIntoView({ behavior: 'smooth' });
        }
      }, 40);
    }
  };

  const openBookingWithTreatment = (treatmentId?: number | null) => {
    setSelectedTreatmentId(treatmentId ?? null);
    setDetailTreatment(null);
    setBookingModalOpen(true);
  };

  const categories = [
    'All',
    'General Dentistry',
    'Restorative Care',
    'Cosmetic & Orthodontics',
    'Pediatric & Surgical',
  ];

  const filteredTreatments =
    categoryFilter === 'All'
      ? treatments
      : treatments.filter((t) => t.category === categoryFilter);

  const dentistName = content?.dentist?.name || 'Dr. Abdul Khadir';

  if (activeView === 'admin') {
    return (
      <AdminDashboard
        onBackToSite={() => handleNavigateHome('top')}
        onContentUpdated={loadClinicData}
      />
    );
  }

  return (
    <div id="top" className="min-h-screen flex flex-col bg-[#FAF9F6] text-[#142B45] pb-16 sm:pb-0">
      <Navbar
        activeView={activeView}
        onNavigateHome={handleNavigateHome}
        onOpenBooking={() => openBookingWithTreatment(null)}
        onOpenAdmin={openAdminView}
      />

      {activeView === 'booking' ? (
        <main className="flex-1 py-10 sm:py-14">
          <div className="max-w-[1000px] mx-auto px-4 sm:px-6 space-y-6">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-xs font-semibold text-[#159C98]">Online Appointment Request</p>
                <h1 className="font-display text-3xl font-bold text-[#142B45] mt-1">
                  Book Your Dental Visit
                </h1>
              </div>
              <button
                type="button"
                onClick={() => handleNavigateHome('top')}
                className="px-4 py-2 rounded-lg border border-[#142B45]/15 text-xs font-semibold text-[#142B45] hover:bg-[#EEF1F4]"
              >
                Back to Clinic Overview
              </button>
            </div>
            <BookingSection
              treatments={treatments}
              operatingHours={operatingHours}
              dentistName={dentistName}
              initialTreatmentId={selectedTreatmentId}
              onOpenPrivacy={() => setLegalModal('privacy')}
            />
          </div>
        </main>
      ) : (
        <main className="flex-1">
          {/* HERO SECTION */}
          <section className="pt-10 pb-14 lg:pt-14 lg:pb-18">
            <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
              <div className="grid lg:grid-cols-12 gap-8 lg:gap-12 items-stretch">
                <motion.div
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                  className="lg:col-span-6 flex flex-col justify-center space-y-6 py-2"
                >
                  <p className="text-xs font-semibold tracking-wide text-[#159C98]">
                    {CLINIC_INFO.positioning}
                  </p>

                  <h1 className="font-display text-[clamp(2.25rem,4vw,3.45rem)] font-bold leading-[1.12] tracking-tight text-[#142B45] text-balance">
                    {content?.heroHeadline || 'Your Smile Deserves Gentle, Expert Care.'}
                  </h1>

                  <p className="text-base sm:text-lg text-[#142B45]/75 leading-relaxed max-w-xl">
                    {content?.heroSubheading ||
                      "Experience modern dentistry with a personal touch. From routine checkups to complete smile transformations, we're here to make every dental visit more comfortable."}
                  </p>

                  <div className="flex flex-wrap items-center gap-3.5 pt-2">
                    <button
                      type="button"
                      onClick={() => openBookingWithTreatment(null)}
                      className="inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-lg bg-[#142B45] text-white text-sm font-semibold hover:bg-[#159C98] transition-colors duration-150 whitespace-nowrap shrink-0"
                    >
                      <Calendar className="w-4 h-4" />
                      Book Your Appointment
                    </button>

                    <button
                      type="button"
                      onClick={() => handleNavigateHome('treatments')}
                      className="inline-flex items-center justify-center gap-2 px-5 py-3.5 rounded-lg border border-[#142B45]/20 bg-white text-[#142B45] text-sm font-semibold hover:border-[#159C98] hover:text-[#159C98] transition-colors duration-150 whitespace-nowrap shrink-0"
                    >
                      Explore Our Treatments
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="pt-2 flex flex-wrap items-center gap-5 text-xs text-[#142B45]/75">
                    <a
                      href={CLINIC_INFO.whatsappHref}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 font-semibold text-[#159C98] hover:text-[#142B45] transition-colors"
                    >
                      <MessageCircle className="w-4 h-4" />
                      WhatsApp Enquiry
                    </a>
                    <span aria-hidden="true">·</span>
                    <a
                      href={CLINIC_INFO.phoneHref}
                      className="inline-flex items-center gap-1.5 font-medium hover:text-[#142B45] tabular-nums"
                    >
                      <Phone className="w-3.5 h-3.5 text-[#159C98]" />
                      {CLINIC_INFO.phoneDisplay}
                    </a>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() => setActiveView('booking')}
                      className="font-medium underline underline-offset-4 hover:text-[#159C98]"
                    >
                      Full Booking Page & Status
                    </button>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={openAdminView}
                      className="font-medium underline underline-offset-4 hover:text-[#159C98]"
                    >
                      Admin Dashboard
                    </button>
                  </div>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  className="lg:col-span-6"
                >
                  <div className="relative rounded-2xl overflow-hidden border border-[#142B45]/10 bg-[#EEF1F4] h-72 sm:h-96 lg:h-full min-h-[380px]">
                    <SafeImage
                      src={CLINIC_IMAGES.heroSuite}
                      alt="Serene modern dental treatment suite at MED Rx Dental Centre in Nagarbhavi, Bengaluru"
                      fallbackTitle="MED Rx Dental Centre Treatment Suite"
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute inset-x-0 bottom-0 p-5 bg-gradient-to-t from-[#142B45]/80 via-[#142B45]/35 to-transparent text-white">
                      <p className="text-xs font-medium text-[#C6A879]">Annapoorneshwari Nagar · Nagarbhavi</p>
                      <p className="font-display text-sm sm:text-base font-semibold mt-0.5">
                        Calm clinical environment designed for unhurried, gentle care
                      </p>
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* 4-Column Trust Strip Below Hero */}
              <div className="mt-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-[#142B45]/10 rounded-xl overflow-hidden border border-[#142B45]/10">
                <div className="bg-white p-5">
                  <p className="text-xs text-[#142B45]/60">Google Business Profile</p>
                  {content?.googleReviewsVerified ? (
                    <p className="font-display font-bold text-[#142B45] text-base mt-1 tabular-nums">
                      {content.googleRatingValue} / 5 Rating · {content.googleReviewCount} Reviews
                    </p>
                  ) : (
                    <a
                      href={CLINIC_INFO.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-display font-bold text-[#142B45] text-base mt-1 inline-flex items-center gap-1.5 hover:text-[#159C98]"
                    >
                      View Google Profile
                      <ExternalLink className="w-3.5 h-3.5 text-[#159C98]" />
                    </a>
                  )}
                </div>
                <div className="bg-white p-5">
                  <p className="text-xs text-[#142B45]/60">Clinical Scope</p>
                  <p className="font-display font-bold text-[#142B45] text-base mt-1">
                    Comprehensive Dental Care
                  </p>
                </div>
                <div className="bg-white p-5">
                  <p className="text-xs text-[#142B45]/60">Care Philosophy</p>
                  <p className="font-display font-bold text-[#142B45] text-base mt-1">
                    Patient-Focused Approach
                  </p>
                </div>
                <div className="bg-white p-5">
                  <p className="text-xs text-[#142B45]/60">Clinic Timings (IST)</p>
                  <p className="font-display font-bold text-[#142B45] text-base mt-1 tabular-nums">
                    Mon–Sat 10:30 AM – 9:00 PM
                  </p>
                </div>
              </div>
            </div>
          </section>

          {/* WHY CHOOSE MED Rx */}
          <section className="py-18 bg-white border-y border-[#142B45]/10">
            <div className="max-w-[1200px] mx-auto px-4 sm:px-6 space-y-10">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div className="max-w-2xl">
                  <p className="text-xs font-semibold text-[#159C98]">Why Choose MED Rx</p>
                  <h2 className="font-display text-3xl font-bold text-[#142B45] mt-2 text-balance">
                    Thoughtful Dentistry Built Around Your Comfort
                  </h2>
                </div>
                <p className="text-sm text-[#142B45]/70 max-w-md">
                  Every visit balances modern clinical standards with transparent conversations and unhurried care.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
                {[
                  {
                    num: '01.',
                    title: 'Gentle Dental Care',
                    desc: 'A comfortable, reassuring experience for patients of all ages.',
                  },
                  {
                    num: '02.',
                    title: 'Modern Treatment Options',
                    desc: 'Contemporary dental treatments tailored to individual needs.',
                  },
                  {
                    num: '03.',
                    title: 'Personalized Attention',
                    desc: 'Clear explanations and treatment recommendations based on individual requirements.',
                  },
                  {
                    num: '04.',
                    title: 'Family-Friendly Dentistry',
                    desc: 'Dental care for children, adults and families.',
                  },
                ].map((feature) => (
                  <div
                    key={feature.num}
                    className="p-6 rounded-xl bg-[#FAF9F6] border border-[#142B45]/10 flex flex-col justify-between space-y-4"
                  >
                    <span className="font-display text-sm font-bold text-[#159C98] tabular-nums">
                      {feature.num}
                    </span>
                    <div className="space-y-2">
                      <h3 className="font-display text-lg font-bold text-[#142B45]">{feature.title}</h3>
                      <p className="text-sm text-[#142B45]/75 leading-relaxed">{feature.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* OUR DENTAL SERVICES */}
          <section id="treatments" className="py-20">
            <div className="max-w-[1200px] mx-auto px-4 sm:px-6 space-y-10">
              <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
                <div className="max-w-2xl">
                  <p className="text-xs font-semibold text-[#159C98]">Our Dental Services</p>
                  <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#142B45] mt-2 text-balance">
                    Comprehensive Care Under One Roof
                  </h2>
                  <p className="text-base text-[#142B45]/75 mt-3 leading-relaxed">
                    From preventive cleanings and pediatric checkups to root canal care, implants, and clear aligner
                    planning—explore our services and request an appointment online.
                  </p>
                </div>

                {/* Interactive Category Filter Tabs */}
                <div
                  role="tablist"
                  aria-label="Filter dental treatments by specialty"
                  className="flex flex-wrap items-center gap-1.5 p-1 bg-[#EEF1F4] rounded-xl self-start"
                >
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      role="tab"
                      aria-selected={categoryFilter === cat}
                      onClick={() => setCategoryFilter(cat)}
                      className={`px-3 py-2 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0 ${
                        categoryFilter === cat
                          ? 'bg-white text-[#142B45] shadow-xs'
                          : 'text-[#142B45]/70 hover:text-[#142B45]'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {loadingClinic ? (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {Array.from({ length: 6 }).map((_, idx) => (
                    <div key={idx} className="h-96 rounded-2xl bg-[#EEF1F4] animate-pulse" />
                  ))}
                </div>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {filteredTreatments.map((t) => (
                    <article
                      key={t.id}
                      id={`treatment-${t.slug}`}
                      className="group bg-white rounded-2xl border border-[#142B45]/10 overflow-hidden flex flex-col justify-between transition-transform duration-200 hover:-translate-y-0.5"
                    >
                      <div>
                        <div className="aspect-[4/3] bg-[#EEF1F4] overflow-hidden">
                          <SafeImage
                            src={t.imageUrl}
                            alt={`${t.name} service at MED Rx Dental Centre, Nagarbhavi`}
                            fallbackTitle={t.name}
                            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
                          />
                        </div>
                        <div className="p-6 space-y-2.5">
                          <p className="text-xs text-[#142B45]/60 tabular-nums">
                            {t.category} · {t.durationMinutes} min visit
                          </p>
                          <h3 className="font-display text-xl font-bold text-[#142B45]">{t.name}</h3>
                          <p className="text-sm text-[#142B45]/75 leading-relaxed">{t.shortDescription}</p>
                        </div>
                      </div>

                      <div className="px-6 pb-6 pt-2 flex items-center justify-between gap-3 border-t border-[#142B45]/5 mt-auto">
                        <button
                          type="button"
                          onClick={() => setDetailTreatment(t)}
                          className="text-xs font-semibold text-[#159C98] hover:text-[#142B45] transition-colors whitespace-nowrap shrink-0"
                        >
                          Learn More
                        </button>
                        <button
                          type="button"
                          onClick={() => openBookingWithTreatment(t.id)}
                          className="px-4 py-2 rounded-lg bg-[#142B45] text-white text-xs font-semibold hover:bg-[#159C98] transition-colors whitespace-nowrap shrink-0"
                        >
                          Book This Treatment
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
            </div>
          </section>

          {/* ABOUT THE CLINIC */}
          <section id="about" className="py-20 bg-white border-y border-[#142B45]/10">
            <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
              <div className="grid lg:grid-cols-12 gap-10 lg:gap-12 items-stretch">
                <div className="lg:col-span-6">
                  <div className="rounded-2xl overflow-hidden border border-[#142B45]/10 h-72 sm:h-96 lg:h-full min-h-[360px] bg-[#EEF1F4]">
                    <SafeImage
                      src={CLINIC_IMAGES.reception}
                      alt="Welcoming reception lounge at MED Rx Dental Centre, Annapoorneshwari Nagar"
                      fallbackTitle="MED Rx Dental Centre Reception"
                      className="w-full h-full object-cover"
                    />
                  </div>
                </div>

                <div className="lg:col-span-6 flex flex-col justify-center space-y-6">
                  <div>
                    <p className="text-xs font-semibold text-[#159C98]">About MED Rx Dental Centre</p>
                    <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#142B45] mt-2 text-balance">
                      {content?.aboutHeadline || 'Care That Puts Your Comfort First.'}
                    </h2>
                  </div>

                  <p className="text-base text-[#142B45]/80 leading-relaxed">
                    {content?.aboutStory ||
                      'At MED Rx Dental Centre in Nagarbhavi, Bengaluru, every appointment is built around unhurried listening, calm clinical spaces, and clear explanations.'}
                  </p>

                  <ul className="space-y-3 pt-1">
                    {[
                      'Patient-centered dental care with transparent explanations before any procedure',
                      'Clean, calm, and welcoming clinical environment in Health Layout, Nagarbhavi',
                      'Gentle treatment approach designed to ease dental anxiety',
                      'Comprehensive multi-specialty care for children, adults, and seniors',
                    ].map((point) => (
                      <li key={point} className="flex items-start gap-3 text-sm text-[#142B45]/85">
                        <CheckCircle2 className="w-4 h-4 text-[#159C98] shrink-0 mt-0.5" />
                        <span>{point}</span>
                      </li>
                    ))}
                  </ul>

                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => openBookingWithTreatment(null)}
                      className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-[#142B45] text-white text-sm font-semibold hover:bg-[#159C98] transition-colors"
                    >
                      Schedule a Consultation
                      <ArrowRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* MEET OUR DENTIST */}
          <section id="dentist" className="py-20">
            <div className="max-w-[1200px] mx-auto px-4 sm:px-6">
              <div className="bg-white rounded-2xl border border-[#142B45]/10 overflow-hidden grid lg:grid-cols-12 items-stretch">
                <div className="lg:col-span-5 bg-[#EEF1F4] flex flex-col">
                  <div className="relative flex-1 min-h-[360px]">
                    <SafeImage
                      src={content?.dentist?.portraitUrl || CLINIC_IMAGES.dentistPortrait}
                      alt={`${dentistName} — Lead Dentist at MED Rx Dental Centre`}
                      fallbackTitle={dentistName}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <p className="px-5 py-2.5 text-[11px] text-[#142B45]/60 bg-[#FAF9F6] border-t border-[#142B45]/10">
                    {content?.dentist?.portraitNote ||
                      'Illustrative clinical portrait — clinic-supplied portrait can be updated via Admin.'}
                  </p>
                </div>

                <div className="lg:col-span-7 p-6 sm:p-10 flex flex-col justify-center space-y-6">
                  <div>
                    <p className="text-xs font-semibold text-[#159C98]">Meet Our Dentist</p>
                    <h2 className="font-display text-3xl font-bold text-[#142B45] mt-1.5">{dentistName}</h2>
                    <p className="text-sm font-medium text-[#142B45]/75 mt-1">
                      {content?.dentist?.designation || 'Lead Dental Surgeon (Pending Clinic Verification)'}
                    </p>
                  </div>

                  <p className="text-sm sm:text-base text-[#142B45]/80 leading-relaxed">
                    {content?.dentist?.bio}
                  </p>

                  <div className="grid sm:grid-cols-2 gap-4 py-4 border-y border-[#142B45]/10 text-xs">
                    <div>
                      <p className="text-[#142B45]/60">Qualifications</p>
                      <p className="font-semibold text-[#142B45] mt-1">
                        {content?.dentist?.qualifications || 'Pending verification by clinic'}
                      </p>
                    </div>
                    <div>
                      <p className="text-[#142B45]/60">Clinical Experience</p>
                      <p className="font-semibold text-[#142B45] mt-1">
                        {content?.dentist?.experience || 'Pending verification by clinic'}
                      </p>
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-semibold text-[#142B45] mb-2.5">Areas of Focus</p>
                    <div className="grid sm:grid-cols-2 gap-2 text-xs text-[#142B45]/80">
                      {(content?.dentist?.expertise || []).map((item) => (
                        <div key={item} className="flex items-center gap-2">
                          <span className="text-[#159C98]" aria-hidden="true">
                            ·
                          </span>
                          <span>{item}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="pt-2 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => openBookingWithTreatment(null)}
                      className="px-5 py-3 rounded-lg bg-[#142B45] text-white text-sm font-semibold hover:bg-[#159C98] transition-colors"
                    >
                      Book with {dentistName}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* PATIENT TESTIMONIALS / GOOGLE REVIEWS */}
          <section id="reviews" className="py-20 bg-white border-t border-[#142B45]/10">
            <div className="max-w-[1200px] mx-auto px-4 sm:px-6 space-y-10">
              <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
                <div>
                  <p className="text-xs font-semibold text-[#159C98]">Patient Feedback</p>
                  <h2 className="font-display text-3xl font-bold text-[#142B45] mt-2">
                    Verified Patient Experiences
                  </h2>
                </div>
                <a
                  href={CLINIC_INFO.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg border border-[#142B45]/20 text-xs font-semibold text-[#142B45] hover:border-[#159C98] hover:text-[#159C98] transition-colors self-start"
                >
                  Read More Google Reviews
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {content?.googleReviewsVerified && content.verifiedReviews.length > 0 ? (
                <div className="space-y-6">
                  <div className="p-5 rounded-xl bg-[#FAF9F6] border border-[#142B45]/10 flex flex-wrap items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className="flex items-center gap-0.5 text-[#C6A879]">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className="w-4 h-4 fill-current" />
                        ))}
                      </div>
                      <p className="text-sm font-semibold text-[#142B45] tabular-nums">
                        {content.googleRatingValue} / 5.0 · Based on {content.googleReviewCount} verified Google reviews
                      </p>
                    </div>
                  </div>
                  <div className="grid md:grid-cols-3 gap-6">
                    {content.verifiedReviews.map((review) => (
                      <div
                        key={review.id}
                        className="p-6 rounded-xl bg-[#FAF9F6] border border-[#142B45]/10 flex flex-col justify-between space-y-4"
                      >
                        <div className="space-y-3">
                          <div className="flex items-center gap-0.5 text-[#C6A879]">
                            {Array.from({ length: review.rating }).map((_, i) => (
                              <Star key={i} className="w-3.5 h-3.5 fill-current" />
                            ))}
                          </div>
                          <p className="text-sm text-[#142B45]/85 leading-relaxed">“{review.text}”</p>
                        </div>
                        <p className="text-xs text-[#142B45]/60">
                          <strong className="text-[#142B45]">{review.authorName}</strong> · {review.reviewDate}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="p-8 rounded-2xl bg-[#FAF9F6] border border-[#142B45]/10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
                  <div className="space-y-2 max-w-2xl">
                    <p className="font-display font-semibold text-lg text-[#142B45]">
                      Read Authentic Patient Reviews on Our Google Business Profile
                    </p>
                    <p className="text-sm text-[#142B45]/75 leading-relaxed">
                      We display only verified patient reviews with explicit publication approval. Visit our Google Maps
                      listing directly to read current feedback from patients in Nagarbhavi and Bengaluru.
                    </p>
                  </div>
                  <a
                    href={CLINIC_INFO.googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-[#142B45] text-white text-sm font-semibold hover:bg-[#159C98] transition-colors whitespace-nowrap shrink-0"
                  >
                    Open Google Reviews
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              )}
            </div>
          </section>

          {/* CONVERSION CALL TO ACTION BAND */}
          <section className="py-16 bg-[#142B45] text-white">
            <div className="max-w-[1200px] mx-auto px-4 sm:px-6 flex flex-col lg:flex-row lg:items-center justify-between gap-8">
              <div className="max-w-2xl space-y-2.5">
                <h2 className="font-display text-2xl sm:text-3xl font-bold text-balance">
                  {content?.ctaHeadline || 'Ready to Take the First Step Toward a Healthier Smile?'}
                </h2>
                <p className="text-sm sm:text-base text-white/80">
                  {content?.ctaDescription || 'Book your dental appointment with MED Rx Dental Centre today.'}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => openBookingWithTreatment(null)}
                  className="px-5 py-3 rounded-lg bg-white text-[#142B45] text-sm font-semibold hover:bg-[#C6A879] hover:text-[#142B45] transition-colors whitespace-nowrap"
                >
                  Book Appointment
                </button>
                <a
                  href={CLINIC_INFO.phoneHref}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-lg border border-white/25 text-white text-sm font-semibold hover:bg-white/10 transition-colors whitespace-nowrap"
                >
                  <Phone className="w-4 h-4" />
                  Call Our Clinic
                </a>
                <a
                  href={CLINIC_INFO.whatsappHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-[#159C98] text-white text-sm font-semibold hover:bg-[#159C98]/90 transition-colors whitespace-nowrap"
                >
                  <MessageCircle className="w-4 h-4" />
                  WhatsApp Us
                </a>
              </div>
            </div>
          </section>

          {/* CONTACT & LOCATION */}
          <LocationMapCard operatingHours={operatingHours} />
        </main>
      )}

      {/* PREMIUM FOOTER */}
      <footer className="bg-[#142B45] text-white/80 border-t border-white/10">
        <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-14 grid sm:grid-cols-2 lg:grid-cols-12 gap-10 text-xs">
          <div className="lg:col-span-4 space-y-3">
            <div className="flex items-center gap-2.5 text-white">
              <span className="w-8 h-8 rounded-lg bg-[#159C98] text-white flex items-center justify-center font-display font-bold text-xs">
                Rx
              </span>
              <span className="font-display font-bold text-base">MED Rx Dental Centre</span>
            </div>
            <p className="leading-relaxed text-white/70">
              Modern Dentistry. Gentle Care. Confident Smiles. Multi-specialty family dental care serving
              Annapoorneshwari Nagar, Nagarbhavi, and Bengaluru.
            </p>
            <p className="text-white/75 flex items-start gap-2 pt-1">
              <MapPin className="w-4 h-4 text-[#C6A879] shrink-0 mt-0.5" />
              <span>{CLINIC_INFO.address}</span>
            </p>
          </div>

          <div className="lg:col-span-2 space-y-2.5">
            <p className="font-display font-semibold text-white text-sm">Quick Links</p>
            <ul className="space-y-2">
              {[
                { label: 'Home', id: 'top' },
                { label: 'About Us', id: 'about' },
                { label: 'Treatments', id: 'treatments' },
                { label: 'Our Dentist', id: 'dentist' },
                { label: 'Patient Reviews', id: 'reviews' },
                { label: 'Contact', id: 'contact' },
              ].map((l) => (
                <li key={l.id}>
                  <button
                    type="button"
                    onClick={() => handleNavigateHome(l.id)}
                    className="hover:text-white transition-colors"
                  >
                    {l.label}
                  </button>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={() => setActiveView('booking')}
                  className="hover:text-white transition-colors"
                >
                  Book / Manage Visit
                </button>
              </li>
            </ul>
          </div>

          <div className="lg:col-span-3 space-y-2.5">
            <p className="font-display font-semibold text-white text-sm">Dental Services</p>
            <ul className="space-y-2">
              {treatments.slice(0, 7).map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => setDetailTreatment(t)}
                    className="hover:text-white transition-colors text-left"
                  >
                    {t.name}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="lg:col-span-3 space-y-3">
            <p className="font-display font-semibold text-white text-sm">Clinic Contact & Hours</p>
            <div className="space-y-1.5">
              <a href={CLINIC_INFO.phoneHref} className="block font-semibold text-white tabular-nums hover:text-[#C6A879]">
                {CLINIC_INFO.phoneDisplay}
              </a>
              <p className="text-white/70 tabular-nums">
                Mon–Sat: {formatTime12h('10:30')} – {formatTime12h('21:00')}
              </p>
              <p className="text-white/70 tabular-nums">
                Sunday: {formatTime12h('10:30')} – {formatTime12h('14:00')}
              </p>
            </div>
            <div className="flex flex-wrap gap-3 pt-1">
              <a
                href={CLINIC_INFO.whatsappHref}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#159C98] font-semibold hover:underline"
              >
                WhatsApp Us
              </a>
              <a
                href={CLINIC_INFO.googleMapsUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[#C6A879] font-semibold hover:underline"
              >
                Google Maps Directions
              </a>
            </div>
          </div>
        </div>

        <div className="border-t border-white/10">
          <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-5 flex flex-wrap items-center justify-between gap-4 text-xs text-white/60">
            <p>© 2026 MED Rx Dental Centre. All Rights Reserved.</p>
            <div className="flex flex-wrap items-center gap-5">
              <button type="button" onClick={() => setLegalModal('privacy')} className="hover:text-white">
                Privacy Policy
              </button>
              <button type="button" onClick={() => setLegalModal('terms')} className="hover:text-white">
                Terms & Conditions
              </button>
              <button
                type="button"
                onClick={openAdminView}
                className="inline-flex items-center gap-1 hover:text-white"
              >
                <Shield className="w-3.5 h-3.5" />
                Admin Panel
              </button>
            </div>
          </div>
        </div>
      </footer>

      {/* Floating WhatsApp Shortcut */}
      <a
        href={CLINIC_INFO.whatsappHref}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Enquire on WhatsApp with MED Rx Dental Centre"
        className="fixed bottom-20 sm:bottom-6 right-5 z-30 inline-flex items-center gap-2 px-4 py-3 rounded-full bg-[#159C98] text-white text-xs font-semibold shadow-lg hover:bg-[#142B45] transition-colors"
      >
        <MessageCircle className="w-4 h-4" />
        <span className="hidden sm:inline">WhatsApp Clinic</span>
      </a>

      {/* Compact Mobile Bottom Sticky Shortcut (<= 15% mobile viewport) */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 z-30 bg-white/95 backdrop-blur-md border-t border-[#142B45]/10 px-3 py-2 flex items-center gap-2 h-14">
        <a
          href={CLINIC_INFO.phoneHref}
          className="flex-1 h-10 rounded-lg border border-[#142B45]/20 text-[#142B45] text-xs font-semibold flex items-center justify-center gap-1.5"
        >
          <Phone className="w-3.5 h-3.5 text-[#159C98]" />
          Call Clinic
        </a>
        <button
          type="button"
          onClick={() => openBookingWithTreatment(null)}
          className="flex-[1.5] h-10 rounded-lg bg-[#142B45] text-white text-xs font-semibold flex items-center justify-center gap-1.5"
        >
          <Calendar className="w-3.5 h-3.5" />
          Book Appointment
        </button>
      </div>

      {/* Modals */}
      {bookingModalOpen && (
        <BookingSection
          isModal
          treatments={treatments}
          operatingHours={operatingHours}
          dentistName={dentistName}
          initialTreatmentId={selectedTreatmentId}
          onClose={() => setBookingModalOpen(false)}
          onOpenPrivacy={() => setLegalModal('privacy')}
        />
      )}

      <TreatmentModal
        treatment={detailTreatment}
        onClose={() => setDetailTreatment(null)}
        onBookTreatment={(id) => openBookingWithTreatment(id)}
      />

      <LegalModal type={legalModal} onClose={() => setLegalModal(null)} />
    </div>
  );
}

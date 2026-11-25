import { Check, Clock, Copy, ExternalLink, MapPin, MessageCircle, Navigation, Phone, Send } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { CLINIC_INFO, formatTime12h } from '../constants.ts';
import type { OperatingHour } from '../types.ts';

interface LocationMapCardProps {
  operatingHours: OperatingHour[];
}

export function LocationMapCard({ operatingHours }: LocationMapCardProps) {
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState('');
  const [mobile, setMobile] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [honeypot, setHoneypot] = useState('');
  const [sending, setSending] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function handleCopyAddress() {
    try {
      await navigator.clipboard.writeText(CLINIC_INFO.address);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked
    }
  }

  async function handleContactSubmit(e: FormEvent) {
    e.preventDefault();
    setStatusMsg(null);
    setSending(true);
    try {
      const res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name,
          mobile,
          email,
          subject: 'Website Contact Form Enquiry',
          message,
          website: honeypot,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setStatusMsg({ ok: false, text: data.error || 'Unable to send message.' });
      } else {
        setStatusMsg({ ok: true, text: data.message });
        setName('');
        setMobile('');
        setEmail('');
        setMessage('');
      }
    } catch {
      setStatusMsg({ ok: false, text: 'Network error. Please call +91 99720 25712.' });
    } finally {
      setSending(false);
    }
  }

  return (
    <section id="contact" className="py-20 bg-[#EEF1F4]/60 border-t border-[#142B45]/10">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 space-y-12">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold tracking-wide text-[#159C98]">Visit Our Clinic · Nagarbhavi, Bengaluru</p>
          <h2 className="font-display text-3xl sm:text-4xl font-bold text-[#142B45] mt-2 text-balance">
            Easy to Reach in Annapoorneshwari Nagar
          </h2>
          <p className="text-[#142B45]/75 text-base mt-3 leading-relaxed">
            Located in Health Layout, Annapoorneshwari Nagar, Nagarbhavi. Call, message us on WhatsApp, or use Google
            Maps directions to plan your visit.
          </p>
        </div>

        <div className="grid lg:grid-cols-12 gap-8 items-stretch">
          {/* Left Column: Address, Map Locator Visual & Hours */}
          <div className="lg:col-span-6 flex flex-col justify-between bg-white rounded-2xl border border-[#142B45]/10 overflow-hidden">
            {/* Architectural Clinic Location Map Card (no external API key required) */}
            <div className="relative h-64 bg-[#FAF9F6] border-b border-[#142B45]/10 overflow-hidden p-6 flex flex-col justify-between">
              <svg
                aria-hidden="true"
                viewBox="0 0 600 260"
                className="absolute inset-0 w-full h-full object-cover opacity-55"
              >
                <rect width="600" height="260" fill="#FAF9F6" />
                <path d="M0 70 H600 M0 140 H600 M0 205 H600" stroke="#142B45" strokeOpacity="0.09" strokeWidth="6" />
                <path d="M120 0 V260 M260 0 V260 M420 0 V260 M520 0 V260" stroke="#142B45" strokeOpacity="0.09" strokeWidth="6" />
                <path d="M260 140 L420 140" stroke="#159C98" strokeOpacity="0.4" strokeWidth="8" />
                <rect x="275" y="82" width="128" height="46" rx="6" fill="#EEF1F4" />
                <rect x="135" y="154" width="110" height="40" rx="6" fill="#EEF1F4" />
                <text x="278" y="64" fill="#142B45" fillOpacity="0.45" fontSize="10" fontFamily="sans-serif">
                  4th Cross Road
                </text>
                <text x="195" y="120" fill="#142B45" fillOpacity="0.45" fontSize="10" fontFamily="sans-serif">
                  1st Main Rd
                </text>
                <text x="430" y="135" fill="#142B45" fillOpacity="0.45" fontSize="10" fontFamily="sans-serif">
                  Health Layout
                </text>
              </svg>

              <div className="relative z-10 flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white/95 border border-[#142B45]/10 text-xs font-semibold text-[#142B45] shadow-xs">
                  <MapPin className="w-3.5 h-3.5 text-[#159C98]" />
                  Annapoorneshwari Nagar · 560091
                </span>
                <a
                  href={CLINIC_INFO.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#142B45] text-white text-xs font-semibold hover:bg-[#159C98] transition-colors shadow-xs"
                >
                  <Navigation className="w-3.5 h-3.5" />
                  Get Directions
                </a>
              </div>

              <div className="relative z-10 self-center flex flex-col items-center">
                <div className="w-11 h-11 rounded-full bg-[#142B45] text-white flex items-center justify-center shadow-md border-2 border-white">
                  <MapPin className="w-5 h-5 text-[#C6A879]" />
                </div>
                <div className="mt-1.5 px-3 py-1 rounded-md bg-white border border-[#142B45]/15 text-xs font-semibold text-[#142B45] shadow-xs">
                  MED Rx Dental Centre (#50)
                </div>
              </div>

              <div className="relative z-10 flex justify-end">
                <a
                  href={CLINIC_INFO.googleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-[#142B45]/75 hover:text-[#159C98] inline-flex items-center gap-1 bg-white/80 px-2 py-1 rounded"
                >
                  Open Verified Pin on Google Maps
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>

            {/* Address, Direct Actions & Hours */}
            <div className="p-6 sm:p-7 space-y-6 flex-1 flex flex-col justify-between">
              <div className="space-y-3">
                <h3 className="font-display font-bold text-[#142B45] text-lg">MED Rx Dental Centre</h3>
                <p className="text-sm text-[#142B45]/80 leading-relaxed">{CLINIC_INFO.address}</p>
                <div className="flex flex-wrap gap-2.5 pt-1">
                  <a
                    href={CLINIC_INFO.phoneHref}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#142B45] text-white text-xs font-semibold hover:bg-[#159C98] transition-colors"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    Call {CLINIC_INFO.phoneDisplay}
                  </a>
                  <a
                    href={CLINIC_INFO.whatsappHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#159C98] text-white text-xs font-semibold hover:bg-[#142B45] transition-colors"
                  >
                    <MessageCircle className="w-3.5 h-3.5" />
                    WhatsApp Clinic
                  </a>
                  <button
                    type="button"
                    onClick={handleCopyAddress}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-[#142B45]/15 text-xs font-medium text-[#142B45] hover:bg-[#EEF1F4] transition-colors"
                  >
                    {copied ? <Check className="w-3.5 h-3.5 text-[#159C98]" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Address Copied' : 'Copy Address'}
                  </button>
                </div>
              </div>

              <div className="pt-5 border-t border-[#142B45]/10">
                <p className="text-xs font-semibold text-[#142B45] flex items-center gap-1.5 mb-3">
                  <Clock className="w-3.5 h-3.5 text-[#159C98]" />
                  Opening Hours (IST)
                </p>
                <dl className="grid sm:grid-cols-2 gap-x-6 gap-y-1.5 text-xs">
                  {operatingHours.map((h) => (
                    <div key={h.dayOfWeek} className="flex items-center justify-between py-1 border-b border-[#142B45]/5">
                      <dt className="text-[#142B45]/80 font-medium">{h.dayName}</dt>
                      <dd className="tabular-nums text-[#142B45]">
                        {h.isOpen ? `${formatTime12h(h.openTime)} – ${formatTime12h(h.closeTime)}` : 'Closed'}
                      </dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>

          {/* Right Column: Contact Enquiry Form */}
          <form
            onSubmit={handleContactSubmit}
            className="lg:col-span-6 bg-white rounded-2xl border border-[#142B45]/10 p-6 sm:p-8 flex flex-col justify-between space-y-5"
          >
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

            <div className="space-y-4">
              <div>
                <h3 className="font-display font-bold text-[#142B45] text-xl">Send an Enquiry</h3>
                <p className="text-sm text-[#142B45]/70 mt-1">
                  Have a question about treatments, clinic directions, or family checkups? Write to our reception desk.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-4">
                <div>
                  <label htmlFor="contact-name" className="block text-xs font-semibold text-[#142B45] mb-1.5">
                    Your Name *
                  </label>
                  <input
                    id="contact-name"
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Full name"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#142B45]/20 bg-[#FAF9F6] text-sm text-[#142B45] focus:outline-none focus:border-[#159C98]"
                  />
                </div>
                <div>
                  <label htmlFor="contact-mobile" className="block text-xs font-semibold text-[#142B45] mb-1.5">
                    Mobile Number *
                  </label>
                  <input
                    id="contact-mobile"
                    type="tel"
                    required
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    placeholder="+91 98765 43210"
                    className="w-full px-3.5 py-2.5 rounded-lg border border-[#142B45]/20 bg-[#FAF9F6] text-sm text-[#142B45] tabular-nums focus:outline-none focus:border-[#159C98]"
                  />
                </div>
              </div>

              <div>
                <label htmlFor="contact-email" className="block text-xs font-semibold text-[#142B45] mb-1.5">
                  Email Address (Optional)
                </label>
                <input
                  id="contact-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#142B45]/20 bg-[#FAF9F6] text-sm text-[#142B45] focus:outline-none focus:border-[#159C98]"
                />
              </div>

              <div>
                <label htmlFor="contact-message" className="block text-xs font-semibold text-[#142B45] mb-1.5">
                  How Can We Help? *
                </label>
                <textarea
                  id="contact-message"
                  rows={4}
                  required
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder="Share your question or preferred callback time..."
                  className="w-full px-3.5 py-2.5 rounded-lg border border-[#142B45]/20 bg-[#FAF9F6] text-sm text-[#142B45] focus:outline-none focus:border-[#159C98]"
                />
              </div>

              {statusMsg && (
                <div
                  role="status"
                  className={`p-3.5 rounded-lg border text-xs font-medium ${
                    statusMsg.ok
                      ? 'bg-[#159C98]/10 border-[#159C98]/25 text-[#142B45]'
                      : 'bg-red-50 border-red-200 text-red-800'
                  }`}
                >
                  {statusMsg.text}
                </div>
              )}
            </div>

            <button
              type="submit"
              disabled={sending}
              className="w-full sm:w-auto self-start inline-flex items-center justify-center gap-2 px-6 py-3 rounded-lg bg-[#142B45] text-white text-sm font-semibold hover:bg-[#159C98] disabled:opacity-60 transition-colors"
            >
              <Send className="w-4 h-4" />
              {sending ? 'Sending Enquiry...' : 'Send Enquiry'}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}

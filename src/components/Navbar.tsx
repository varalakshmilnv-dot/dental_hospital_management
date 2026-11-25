import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { CLINIC_INFO } from '../constants.ts';

interface NavbarProps {
  activeView: 'home' | 'booking' | 'admin';
  onNavigateHome: (sectionId?: string) => void;
  onOpenBooking: () => void;
  onOpenAdmin?: () => void;
}

export function Navbar({ activeView, onNavigateHome, onOpenBooking, onOpenAdmin }: NavbarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navItems = [
    { label: 'Home', sectionId: 'top' },
    { label: 'About Us', sectionId: 'about' },
    { label: 'Treatments', sectionId: 'treatments' },
    { label: 'Our Dentist', sectionId: 'dentist' },
    { label: 'Contact', sectionId: 'contact' },
  ];

  const handleLinkClick = (sectionId: string) => {
    setMobileOpen(false);
    onNavigateHome(sectionId);
  };

  return (
    <header className="sticky top-0 z-40 bg-[#FAF9F6]/95 backdrop-blur-md border-b border-[#142B45]/10">
      <div className="max-w-[1200px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
        {/* Zone 1: Single-line Brand Wordmark */}
        <button
          type="button"
          onClick={() => handleLinkClick('top')}
          className="flex items-center gap-2.5 text-left whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#159C98] rounded-md"
          aria-label="MED Rx Dental Centre Home"
        >
          <span className="w-8 h-8 rounded-lg bg-[#142B45] text-[#FAF9F6] flex items-center justify-center font-display font-bold text-xs tracking-tight shrink-0">
            Rx
          </span>
          <span className="font-display font-bold text-base sm:text-lg tracking-tight text-[#142B45] whitespace-nowrap shrink-0">
            MED Rx Dental Centre
          </span>
        </button>

        {/* Zone 2: Clean Single-Line Text Nav Links */}
        <nav
          aria-label="Primary Navigation"
          className="hidden lg:flex items-center gap-6 text-sm font-medium text-[#142B45]/75"
        >
          {navItems.map((item) => (
            <button
              key={item.sectionId}
              type="button"
              onClick={() => handleLinkClick(item.sectionId)}
              className="hover:text-[#142B45] transition-colors duration-150 whitespace-nowrap shrink-0 py-1 border-b border-transparent hover:border-[#159C98] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#159C98]"
            >
              {item.label}
            </button>
          ))}
          {onOpenAdmin && (
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                onOpenAdmin();
              }}
              className="hover:text-[#142B45] text-[#159C98] font-semibold transition-colors duration-150 whitespace-nowrap shrink-0 py-1 border-b border-transparent hover:border-[#159C98] focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-[#159C98]"
            >
              Admin
            </button>
          )}
        </nav>

        {/* Zone 3: Single Primary Action */}
        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={() => {
              setMobileOpen(false);
              onOpenBooking();
            }}
            className="hidden sm:inline-flex items-center justify-center px-4 py-2.5 rounded-lg bg-[#142B45] text-white text-sm font-semibold hover:bg-[#159C98] transition-colors duration-150 whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#159C98]"
          >
            {activeView === 'booking' ? 'Booking Open' : 'Book Appointment'}
          </button>

          <button
            type="button"
            onClick={() => setMobileOpen((v) => !v)}
            className="lg:hidden inline-flex items-center justify-center w-10 h-10 rounded-lg border border-[#142B45]/15 text-[#142B45] hover:bg-[#EEF1F4] transition-colors"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Navigation Drawer */}
      {mobileOpen && (
        <div className="lg:hidden bg-[#FAF9F6] border-t border-[#142B45]/10 px-4 py-4 space-y-2">
          <div className="flex flex-col space-y-1">
            {navItems.map((item) => (
              <button
                key={item.sectionId}
                type="button"
                onClick={() => handleLinkClick(item.sectionId)}
                className="text-left px-3 py-2.5 rounded-lg text-sm font-medium text-[#142B45] hover:bg-[#EEF1F4] transition-colors"
              >
                {item.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => handleLinkClick('reviews')}
              className="text-left px-3 py-2.5 rounded-lg text-sm font-medium text-[#142B45] hover:bg-[#EEF1F4] transition-colors"
            >
              Patient Reviews
            </button>
            {onOpenAdmin && (
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  onOpenAdmin();
                }}
                className="text-left px-3 py-2.5 rounded-lg text-sm font-semibold text-[#159C98] hover:bg-[#EEF1F4] transition-colors"
              >
                Admin Dashboard
              </button>
            )}
          </div>
          <div className="pt-2 border-t border-[#142B45]/10 flex flex-col gap-2">
            <button
              type="button"
              onClick={() => {
                setMobileOpen(false);
                onOpenBooking();
              }}
              className="w-full py-2.5 px-4 rounded-lg bg-[#142B45] text-white text-sm font-semibold hover:bg-[#159C98] transition-colors"
            >
              Book Appointment
            </button>
            <a
              href={CLINIC_INFO.whatsappHref}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full text-center py-2.5 px-4 rounded-lg border border-[#142B45]/20 text-[#142B45] text-sm font-medium hover:bg-[#EEF1F4] transition-colors"
            >
              WhatsApp Clinic
            </a>
          </div>
        </div>
      )}
    </header>
  );
}

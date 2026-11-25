import { X } from 'lucide-react';

interface LegalModalProps {
  type: 'privacy' | 'terms' | null;
  onClose: () => void;
}

export function LegalModal({ type, onClose }: LegalModalProps) {
  if (!type) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#142B45]/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="legal-modal-title"
    >
      <div className="bg-white rounded-2xl border border-[#142B45]/10 max-w-2xl w-full max-h-[85vh] flex flex-col shadow-xl">
        <div className="px-6 py-4 border-b border-[#142B45]/10 flex items-center justify-between gap-4">
          <h2 id="legal-modal-title" className="font-display text-lg font-bold text-[#142B45]">
            {type === 'privacy' ? 'Privacy Policy & Patient Data Consent' : 'Terms and Conditions'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-lg flex items-center justify-center text-[#142B45]/70 hover:bg-[#EEF1F4] hover:text-[#142B45] transition-colors"
            aria-label="Close dialog"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 text-sm text-[#142B45]/80 leading-relaxed">
          {type === 'privacy' ? (
            <>
              <p>
                MED Rx Dental Centre respects your privacy and handles all personal and health-related enquiry details
                with strict confidentiality.
              </p>
              <h3 className="font-display font-semibold text-[#142B45] text-base">Information We Collect</h3>
              <p>
                When you submit an appointment request or contact enquiry, we collect your full name, Indian mobile
                number, optional email address, preferred dental treatment, requested date and time, and any notes you
                choose to share regarding your dental concern.
              </p>
              <h3 className="font-display font-semibold text-[#142B45] text-base">How We Use Your Information</h3>
              <p>
                Your details are used solely to review slot availability, contact you to confirm or reschedule your
                dental visit, send appointment acknowledgements, and coordinate clinical care at our Nagarbhavi,
                Bengaluru clinic. We never sell or share patient details with third-party marketers.
              </p>
              <h3 className="font-display font-semibold text-[#142B45] text-base">Access & Corrections</h3>
              <p>
                To update or request deletion of your booking record, please call +91 99720 25712 or speak with our
                reception desk at 50, 1st Main, 4th Cross Road, Health Layout, Annapoorneshwari Nagar, Nagarbhavi,
                Bengaluru 560091.
              </p>
            </>
          ) : (
            <>
              <p>
                By using the MED Rx Dental Centre website and online appointment request system, you agree to the
                following terms.
              </p>
              <h3 className="font-display font-semibold text-[#142B45] text-base">Appointment Requests & Confirmation</h3>
              <p>
                Submitting an online booking form creates an appointment request with a unique reference number.
                Appointment slots are only confirmed once verified by our clinic team via phone call, email, or official
                clinic message.
              </p>
              <h3 className="font-display font-semibold text-[#142B45] text-base">Clinical Information</h3>
              <p>
                Treatment descriptions on this website provide general patient education and do not replace an in-person
                dental examination. Individual treatment suitability, timelines, and outcomes vary based on clinical
                assessment.
              </p>
              <h3 className="font-display font-semibold text-[#142B45] text-base">Rescheduling & Cancellations</h3>
              <p>
                If you need to reschedule or cancel your visit, please submit a request using your booking reference
                number or call +91 99720 25712 ahead of your scheduled time.
              </p>
            </>
          )}
        </div>

        <div className="px-6 py-4 border-t border-[#142B45]/10 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-[#142B45] text-white text-sm font-semibold hover:bg-[#159C98] transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}

import { Calendar, Clock, X } from 'lucide-react';
import { useState } from 'react';
import type { Treatment } from '../types.ts';

interface TreatmentModalProps {
  treatment: Treatment | null;
  onClose: () => void;
  onBookTreatment: (treatmentId: number) => void;
}

export function TreatmentModal({ treatment, onClose, onBookTreatment }: TreatmentModalProps) {
  const [imgError, setImgError] = useState(false);

  if (!treatment) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-[#142B45]/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="treatment-modal-title"
    >
      <div className="bg-white rounded-2xl border border-[#142B45]/10 max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden shadow-xl">
        <div className="relative h-52 sm:h-64 bg-[#EEF1F4] shrink-0">
          {!imgError ? (
            <img
              src={treatment.imageUrl}
              alt={`${treatment.name} at MED Rx Dental Centre`}
              referrerPolicy="no-referrer"
              onError={() => setImgError(true)}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-br from-[#142B45] to-[#159C98] flex items-center justify-center text-white font-display text-lg font-semibold px-6 text-center">
              {treatment.name}
            </div>
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#142B45]/75 via-[#142B45]/20 to-transparent" />
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 w-9 h-9 rounded-lg bg-white/90 text-[#142B45] flex items-center justify-center hover:bg-white transition-colors"
            aria-label="Close treatment details"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="absolute bottom-4 left-6 right-6 text-white">
            <p className="text-xs font-medium text-white/85">
              {treatment.category} · Typical Visit {treatment.durationMinutes} min
            </p>
            <h2 id="treatment-modal-title" className="font-display text-2xl font-bold mt-1">
              {treatment.name}
            </h2>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-5 text-sm text-[#142B45]/85 leading-relaxed">
          <p className="text-base text-[#142B45]">{treatment.detailedDescription}</p>

          <div>
            <h3 className="font-display font-semibold text-[#142B45] text-sm mb-2.5">What to Expect During Your Visit</h3>
            <ul className="space-y-2">
              {treatment.whatToExpect.map((step, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span className="text-xs font-semibold text-[#159C98] tabular-nums mt-0.5">
                    0{i + 1}.
                  </span>
                  <span>{step}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="p-4 rounded-xl bg-[#FAF9F6] border border-[#142B45]/10 flex flex-wrap items-center justify-between gap-4 text-xs text-[#142B45]/75">
            <span className="inline-flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#159C98]" />
              Estimated appointment slot: <strong className="text-[#142B45]">{treatment.durationMinutes} minutes</strong>
            </span>
            <span>Clinical recommendations are confirmed after an in-person exam.</span>
          </div>
        </div>

        <div className="px-6 py-4 border-t border-[#142B45]/10 bg-[#FAF9F6] flex items-center justify-between gap-4">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-lg border border-[#142B45]/15 text-sm font-medium text-[#142B45] hover:bg-[#EEF1F4] transition-colors"
          >
            Back to Treatments
          </button>
          <button
            type="button"
            onClick={() => onBookTreatment(treatment.id)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#142B45] text-white text-sm font-semibold hover:bg-[#159C98] transition-colors"
          >
            <Calendar className="w-4 h-4" />
            Book This Treatment
          </button>
        </div>
      </div>
    </div>
  );
}

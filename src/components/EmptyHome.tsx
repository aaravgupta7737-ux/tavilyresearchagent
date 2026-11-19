import { ShieldCheck } from 'lucide-react';
import type { AuthUser } from '../types/research';

interface EmptyHomeProps {
  user: AuthUser | null;
  onOpenAuthModal: () => void;
}

export function EmptyHome({ user, onOpenAuthModal }: EmptyHomeProps) {
  const firstName = user?.name?.trim().split(/\s+/)[0] || '';

  return (
    <div className="min-h-full flex flex-col items-center justify-center px-4 py-12 sm:py-16">
      <div className="max-w-2xl mx-auto text-center">
        <div className="mx-auto mb-6 w-14 h-14 flex items-center justify-center">
          <svg
            viewBox="0 0 64 64"
            className="w-14 h-14 text-sky-400"
            fill="none"
            aria-hidden="true"
          >
            <ellipse
              cx="32"
              cy="32"
              rx="26"
              ry="11"
              transform="rotate(-24 32 32)"
              stroke="currentColor"
              strokeOpacity="0.45"
              strokeWidth="1.25"
            />
            <ellipse
              cx="32"
              cy="32"
              rx="26"
              ry="11"
              transform="rotate(32 32 32)"
              stroke="#818cf8"
              strokeOpacity="0.55"
              strokeWidth="1.25"
            />
            <circle cx="32" cy="32" r="4.5" fill="#e0f2fe" />
            <circle cx="51" cy="21" r="2" fill="#38bdf8" />
          </svg>
        </div>

        <h1 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-slate-50 leading-tight [text-wrap:balance]">
          {firstName
            ? `Hi ${firstName}, what do you want to ask today?`
            : 'What do you want to ask today?'}
        </h1>

        {!user && (
          <div className="mt-7">
            <button
              type="button"
              onClick={onOpenAuthModal}
              className="inline-flex items-center gap-2 px-5 py-2.5 min-h-[44px] text-xs sm:text-sm font-medium text-slate-100 bg-white/[0.06] border border-white/15 hover:border-sky-400/50 hover:bg-white/[0.11] rounded-xl transition-colors cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4 text-sky-400" />
              <span>Sign in with Google or Phone Number</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

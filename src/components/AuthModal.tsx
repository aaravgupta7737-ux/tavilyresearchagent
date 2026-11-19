import { useState } from 'react';
import { Loader2, Mail, Phone, ShieldCheck, X } from 'lucide-react';
import type { AuthUser } from '../types/research';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onAuthenticated: (user: AuthUser) => void;
}

const COUNTRY_CODES = [
  { code: '+1', label: 'US +1' },
  { code: '+44', label: 'UK +44' },
  { code: '+91', label: 'IN +91' },
  { code: '+61', label: 'AU +61' },
  { code: '+49', label: 'DE +49' },
  { code: '+81', label: 'JP +81' },
];

export function AuthModal({ open, onClose, onAuthenticated }: AuthModalProps) {
  const [tab, setTab] = useState<'google' | 'phone'>('google');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('+1');
  const [phoneInput, setPhoneInput] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [sentPhone, setSentPhone] = useState('');
  const [maskedPhone, setMaskedPhone] = useState('');
  const [previewCode, setPreviewCode] = useState<string | null>(null);
  const [otpCode, setOtpCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-xs"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Sign In"
    >
      <div
        className="w-full max-w-md rounded-2xl bg-[#0B1124] border border-white/15 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-white/10 flex items-center justify-between">
          <span className="font-display text-base font-bold text-slate-50">
            Sign in to Private Workspace
          </span>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close sign in"
            className="p-1.5 text-slate-400 hover:text-white rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-1 p-1 bg-white/[0.05] border border-white/10 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setTab('google');
                setError(null);
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                tab === 'google'
                  ? 'bg-sky-400 text-slate-950 shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Mail className="w-3.5 h-3.5 shrink-0" />
              <span>Google</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('phone');
                setError(null);
              }}
              className={`flex items-center justify-center gap-2 py-2 px-3 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                tab === 'phone'
                  ? 'bg-sky-400 text-slate-950 shadow-xs'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              <Phone className="w-3.5 h-3.5 shrink-0" />
              <span>Phone Number</span>
            </button>
          </div>

          {error && (
            <div className="p-3 text-xs text-rose-200 bg-rose-950/60 border border-rose-500/30 rounded-lg">
              {error}
            </div>
          )}

          {tab === 'google' ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                setLoading(true);
                try {
                  const res = await fetch('/api/auth/google', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: name.trim(), email: email.trim() }),
                  });
                  const data = (await res.json()) as { user?: AuthUser; error?: string };
                  if (!res.ok || !data.user) {
                    throw new Error(data.error || 'Could not sign in with Google.');
                  }
                  onAuthenticated(data.user);
                  onClose();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Sign-in failed.');
                } finally {
                  setLoading(false);
                }
              }}
              className="space-y-3.5"
            >
              <div>
                <label
                  htmlFor="auth-google-name"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Your Name
                </label>
                <input
                  id="auth-google-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full px-3 py-2.5 text-sm text-slate-100 bg-[#050814] border border-white/15 rounded-xl placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                />
              </div>
              <div>
                <label
                  htmlFor="auth-google-email"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Google Email
                </label>
                <input
                  id="auth-google-email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@gmail.com"
                  className="w-full px-3 py-2.5 text-sm text-slate-100 bg-[#050814] border border-white/15 rounded-xl placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 disabled:opacity-60 rounded-xl transition-colors cursor-pointer"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Continue with Google</span>
              </button>
            </form>
          ) : otpSent ? (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                setLoading(true);
                try {
                  const res = await fetch('/api/auth/phone/verify-otp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                      phone: sentPhone,
                      code: otpCode.trim(),
                      name: name.trim(),
                    }),
                  });
                  const data = (await res.json()) as { user?: AuthUser; error?: string };
                  if (!res.ok || !data.user) {
                    throw new Error(data.error || 'Verification failed.');
                  }
                  onAuthenticated(data.user);
                  onClose();
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Verification failed.');
                } finally {
                  setLoading(false);
                }
              }}
              className="space-y-3.5"
            >
              <div className="text-xs text-slate-300 leading-relaxed">
                Enter the 6-digit verification code for{' '}
                <span className="font-mono font-semibold text-white">{maskedPhone}</span>.
              </div>

              {previewCode && (
                <div className="p-3 bg-sky-400/10 border border-sky-400/30 rounded-xl flex items-center justify-between gap-2">
                  <div className="text-xs text-sky-200">
                    Verification code:{' '}
                    <span className="font-mono font-bold tracking-wider tabular-nums text-white">
                      {previewCode}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setOtpCode(previewCode)}
                    className="px-2.5 py-1 text-xs font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 rounded-lg cursor-pointer"
                  >
                    Fill code
                  </button>
                </div>
              )}

              <div>
                <label
                  htmlFor="auth-otp-code"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  6-Digit Code
                </label>
                <input
                  id="auth-otp-code"
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  required
                  value={otpCode}
                  onChange={(e) => setOtpCode(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  className="w-full px-3 py-2.5 text-center text-lg font-mono tracking-[0.35em] text-white bg-[#050814] border border-white/15 rounded-xl focus:outline-none focus:border-sky-400 tabular-nums"
                />
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setOtpSent(false);
                    setOtpCode('');
                    setError(null);
                  }}
                  className="px-3.5 min-h-[44px] text-xs font-medium text-slate-300 bg-white/[0.06] border border-white/15 hover:bg-white/[0.12] rounded-xl cursor-pointer"
                >
                  Change number
                </button>
                <button
                  type="submit"
                  disabled={loading || otpCode.length !== 6}
                  className="flex-1 min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 disabled:opacity-60 rounded-xl transition-colors cursor-pointer"
                >
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Verify & Sign In</span>
                </button>
              </div>
            </form>
          ) : (
            <form
              onSubmit={async (e) => {
                e.preventDefault();
                setError(null);
                const digits = phoneInput.replace(/\D/g, '');
                const formatted = phoneInput.trim().startsWith('+')
                  ? phoneInput.trim()
                  : `${countryCode}${digits}`;
                setLoading(true);
                try {
                  const res = await fetch('/api/auth/phone/send-otp', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: name.trim(), phone: formatted }),
                  });
                  const data = (await res.json()) as {
                    ok?: boolean;
                    phone?: string;
                    maskedPhone?: string;
                    previewCode?: string;
                    error?: string;
                  };
                  if (!res.ok || !data.ok) {
                    throw new Error(data.error || 'Could not send verification code.');
                  }
                  setSentPhone(data.phone || formatted);
                  setMaskedPhone(data.maskedPhone || formatted);
                  setPreviewCode(data.previewCode || null);
                  setOtpSent(true);
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'Failed to send code.');
                } finally {
                  setLoading(false);
                }
              }}
              className="space-y-3.5"
            >
              <div>
                <label
                  htmlFor="auth-phone-name"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Your Name
                </label>
                <input
                  id="auth-phone-name"
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Enter your full name"
                  className="w-full px-3 py-2.5 text-sm text-slate-100 bg-[#050814] border border-white/15 rounded-xl placeholder:text-slate-500 focus:outline-none focus:border-sky-400"
                />
              </div>

              <div>
                <label
                  htmlFor="auth-phone-number"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Phone Number
                </label>
                <div className="flex gap-2">
                  <select
                    aria-label="Country code"
                    value={countryCode}
                    onChange={(e) => setCountryCode(e.target.value)}
                    className="px-2.5 py-2.5 text-xs font-medium text-slate-100 bg-[#050814] border border-white/15 rounded-xl focus:outline-none focus:border-sky-400"
                  >
                    {COUNTRY_CODES.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                  <input
                    id="auth-phone-number"
                    type="tel"
                    required
                    value={phoneInput}
                    onChange={(e) => setPhoneInput(e.target.value)}
                    placeholder="9876543210"
                    className="flex-1 min-w-0 px-3 py-2.5 text-sm font-mono text-slate-100 bg-[#050814] border border-white/15 rounded-xl placeholder:text-slate-500 focus:outline-none focus:border-sky-400 tabular-nums"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full min-h-[44px] flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-semibold text-slate-950 bg-sky-400 hover:bg-sky-300 disabled:opacity-60 rounded-xl transition-colors cursor-pointer"
              >
                {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                <span>Send Verification Code</span>
              </button>
            </form>
          )}

          <div className="pt-2 border-t border-white/10 flex items-center gap-2 text-[11px] text-slate-400">
            <ShieldCheck className="w-3.5 h-3.5 text-sky-400 shrink-0" />
            <span>
              Protected by signed HttpOnly session cookies—your data stays private to you.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

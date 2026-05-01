/* Shared icons + brand mark used across auth-flow pages
   (Login, Register, ForgotPassword, ResetPassword, VerifyEmail, Setup).
   Custom-drawn — not from a third-party icon library — so the auth
   surface has a consistent, recognizable visual language. */

export function IconEmail() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M3 8.5l8.4 5.6a1.2 1.2 0 0 0 1.2 0L21 8.5" />
    </svg>
  );
}

export function IconLock() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="10" width="16" height="11" rx="2.5" />
      <path d="M8 10V7a4 4 0 0 1 8 0v3" />
      <circle cx="12" cy="15.5" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconShield() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3 4 6v6c0 4.5 3.2 8.5 8 9.5 4.8-1 8-5 8-9.5V6l-8-3z" />
      <path d="M9.5 12l2 2 3.5-3.5" />
    </svg>
  );
}

export function IconKey() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="8" cy="12" r="4.5" />
      <path d="M12.5 12H21l-2 2 1 1.5-1.5 1.5L17 16l-2 2-2.5-2.5" />
    </svg>
  );
}

export function IconArrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function IconAlert() {
  return (
    <svg className="auth-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <line x1="12" y1="7.5" x2="12" y2="13" />
      <circle cx="12" cy="16.5" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function IconCheck() {
  return (
    <svg className="auth-error-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10" />
      <path d="M8 12.5l3 3 5-6" />
    </svg>
  );
}

export function IconMailSent() {
  // Larger illustration-style icon for "we sent you an email" state
  return (
    <svg width="36" height="36" viewBox="0 0 36 36" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="9" width="28" height="20" rx="3" />
      <path d="M4 12 18 22 32 12" />
      <circle cx="28" cy="9" r="4.5" fill="currentColor" stroke="none" />
      <path d="M26 9.5l1.5 1.5L30.5 8" stroke="#ffffff" strokeWidth="1.6" />
    </svg>
  );
}

/** Brand mark — stylized "A" silhouette with accent dot */
export function BrandMark() {
  return (
    <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
      <path d="M16 4 L26 26 H22 L20 21 H12 L10 26 H6 L16 4z" fill="currentColor" />
      <circle cx="16" cy="14" r="2" fill="#ffffff" />
    </svg>
  );
}

/** Larger spinner for full-page loading */
export function AuthSpinner({ small = false }: { small?: boolean }) {
  return <span className={small ? "auth-btn-spinner" : "auth-loading-spinner"} aria-hidden="true" />;
}

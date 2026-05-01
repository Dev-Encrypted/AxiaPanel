import { useState, useEffect, FormEvent, useCallback } from "react";
import { useNavigate, Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useBranding } from "../context/BrandingContext";

function base64urlToBuffer(b64: string): ArrayBuffer {
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  const base64 = (b64 + pad).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(base64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr.buffer;
}

function bufferToBase64url(buf: ArrayBuffer): string {
  const arr = new Uint8Array(buf);
  let binary = "";
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/* ─── Custom geometric sigils ─── */

function SigilEmail() {
  return (
    <svg className="auth-sigil" viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.25">
      <rect x="2.5" y="5" width="15" height="10" />
      <polyline points="2.5,5 10,11 17.5,5" />
      <line x1="2.5" y1="15" x2="7.5" y2="10" strokeDasharray="0.8 1.4" />
      <line x1="17.5" y1="15" x2="12.5" y2="10" strokeDasharray="0.8 1.4" />
    </svg>
  );
}

function SigilLock() {
  return (
    <svg className="auth-sigil" viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.25">
      <circle cx="10" cy="10" r="8" />
      <circle cx="10" cy="10" r="5" />
      <circle cx="10" cy="10" r="2" />
      <line x1="10" y1="2" x2="10" y2="0.5" />
      <line x1="10" y1="19.5" x2="10" y2="18" />
      <line x1="2" y1="10" x2="0.5" y2="10" />
      <line x1="19.5" y1="10" x2="18" y2="10" />
    </svg>
  );
}

function SigilToken() {
  return (
    <svg className="auth-sigil" viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.25">
      <rect x="1.5" y="6.5" width="2.5" height="7" />
      <rect x="4.5" y="6.5" width="2.5" height="7" />
      <rect x="7.5" y="6.5" width="2.5" height="7" />
      <rect x="10.5" y="6.5" width="2.5" height="7" fill="currentColor" />
      <rect x="13.5" y="6.5" width="2.5" height="7" />
      <rect x="16.5" y="6.5" width="2" height="7" />
    </svg>
  );
}

function SigilKey() {
  return (
    <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.25">
      <rect x="2.5" y="5" width="9" height="10" />
      <line x1="11.5" y1="10" x2="17.5" y2="10" />
      <line x1="14.5" y1="10" x2="14.5" y2="13" />
      <line x1="17.5" y1="10" x2="17.5" y2="13" />
      <circle cx="6.5" cy="9.5" r="1.25" />
    </svg>
  );
}

function LogoSigil({ size = 28 }: { size?: number }) {
  return (
    <svg className="auth-logo-sigil" viewBox="0 0 32 32" width={size} height={size} fill="none" stroke="currentColor" strokeWidth="1.5">
      <rect x="4" y="4" width="14" height="14" />
      <rect x="14" y="14" width="14" height="14" fill="currentColor" stroke="none" />
      <line x1="4" y1="18" x2="28" y2="18" />
      <line x1="14" y1="4" x2="14" y2="28" />
    </svg>
  );
}

function FrameMark() {
  return (
    <svg viewBox="0 0 12 12" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.25" aria-hidden="true">
      <polyline points="0,4 0,0 4,0" />
    </svg>
  );
}

/* Live clock — updates every 30s */
function useClock() {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(id);
  }, []);
  return now;
}

function formatTime(d: Date) {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatDateMeta(d: Date) {
  // YY.MM.DD
  return `${String(d.getFullYear()).slice(-2)}.${String(d.getMonth() + 1).padStart(2, "0")}.${String(d.getDate()).padStart(2, "0")}`;
}

/* Build hash — stamped at build time by Vite (vite.config.ts) */
const BUILD_HASH = (typeof __APP_BUILD__ !== "undefined" ? __APP_BUILD__ : "DEV").slice(0, 7);

export default function Login() {
  const { user, login, verify2fa, loading } = useAuth();
  const navigate = useNavigate();
  const branding = useBranding();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);

  const [twoFaToken, setTwoFaToken] = useState("");
  const [twoFaCode, setTwoFaCode] = useState("");
  const [passkeySupported, setPasskeySupported] = useState(false);

  const clock = useClock();

  useEffect(() => {
    if (window.PublicKeyCredential) {
      setPasskeySupported(true);
    }
  }, []);

  const handlePasskeyLogin = useCallback(async () => {
    setError("");
    setSubmitting(true);
    try {
      const beginRes = await fetch("/api/auth/passkey/auth/begin", { method: "POST" });
      if (!beginRes.ok) throw new Error("Falha ao iniciar autenticação com passkey");
      const { publicKey } = await beginRes.json();

      publicKey.challenge = base64urlToBuffer(publicKey.challenge);
      if (publicKey.allowCredentials) {
        publicKey.allowCredentials = publicKey.allowCredentials.map((c: { id: string; type: string }) => ({
          ...c, id: base64urlToBuffer(c.id),
        }));
      }

      const credential = await navigator.credentials.get({ publicKey }) as PublicKeyCredential;
      const response = credential.response as AuthenticatorAssertionResponse;

      const completeRes = await fetch("/api/auth/passkey/auth/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: credential.id,
          rawId: bufferToBase64url(credential.rawId),
          response: {
            authenticatorData: bufferToBase64url(response.authenticatorData),
            clientDataJson: bufferToBase64url(response.clientDataJSON),
            signature: bufferToBase64url(response.signature),
            userHandle: response.userHandle ? bufferToBase64url(response.userHandle) : null,
          },
        }),
      });

      if (!completeRes.ok) {
        const data = await completeRes.json();
        throw new Error(data.error || "Falha na autenticação com passkey");
      }

      window.location.href = "/";
    } catch (err) {
      if (err instanceof Error && err.name !== "NotAllowedError") {
        setError(err.message || "Falha na autenticação com passkey");
      }
    } finally {
      setSubmitting(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/auth/setup-status")
      .then(r => r.json())
      .then(d => { if (d.needs_setup) setNeedsSetup(true); })
      .catch(() => {});
  }, []);

  if (loading) return (
    <main className="auth-page flex items-center justify-center">
      <div className="auth-loading">CARREGANDO</div>
    </main>
  );
  if (user) return <Navigate to="/" replace />;
  if (needsSetup) return <Navigate to="/setup" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const challenge = await login(email, password);
      if (challenge) {
        setTwoFaToken(challenge.temp_token);
      } else {
        navigate("/");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no login");
    } finally {
      setSubmitting(false);
    }
  };

  const handle2fa = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await verify2fa(twoFaToken, twoFaCode);
      navigate("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Código 2FA inválido");
    } finally {
      setSubmitting(false);
    }
  };

  const brandName = branding.panelName || "AxiaPanel";
  const host = typeof window !== "undefined" ? window.location.hostname : "—";

  return (
    <main className="auth-page">
      {/* Corner registration marks */}
      <span className="auth-frame auth-frame-tl"><FrameMark /></span>
      <span className="auth-frame auth-frame-tr" style={{ transform: "rotate(90deg)" }}><FrameMark /></span>
      <span className="auth-frame auth-frame-bl" style={{ transform: "rotate(-90deg)" }}><FrameMark /></span>
      <span className="auth-frame auth-frame-br" style={{ transform: "rotate(180deg)" }}><FrameMark /></span>

      {/* Top bar */}
      <header className="auth-topbar">
        <Link to="/" className="auth-brand" aria-label={brandName}>
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt={brandName} className="h-7 w-auto max-h-7 object-contain" />
          ) : (
            <LogoSigil size={26} />
          )}
          {!branding.hideBranding && (
            <span className="auth-brand-name">
              {brandName === "AxiaPanel" ? (
                <>AXIA<span className="auth-brand-faint">PANEL</span></>
              ) : (
                brandName.toUpperCase()
              )}
            </span>
          )}
        </Link>

        <div className="auth-topbar-right">
          <span className="auth-meta-pair">
            <span className="auth-meta-key">{formatDateMeta(clock)}</span>
            <span className="auth-meta-sep">·</span>
            <span className="auth-meta-val auth-meta-tnum">{formatTime(clock)}</span>
          </span>
          <span className="auth-topbar-divider" aria-hidden="true" />
          <span className="auth-meta-pair">
            <span className="auth-meta-key">LOCALE</span>
            <span className="auth-meta-sep">·</span>
            <span className="auth-meta-val">PT-BR</span>
          </span>
          <span className="auth-topbar-divider" aria-hidden="true" />
          <span className="auth-chip" aria-hidden="true">
            <span className="auth-chip-dot" />
            <span className="auth-chip-key">SYS</span>
            <span className="auth-chip-sep">:</span>
            <span className="auth-chip-val">READY</span>
          </span>
        </div>
      </header>

      {/* Stage */}
      <section className="auth-stage">
        <div className="auth-card">
          <span className="auth-card-stripe" aria-hidden="true" />

          {/* Section number */}
          <div className="auth-section">
            <span className="auth-section-num">01</span>
            <span className="auth-section-rule" />
            <span className="auth-section-name">
              {twoFaToken ? "Verificação" : "Acesso"}
            </span>
          </div>

          {/* Heading */}
          <h1 className="auth-heading">
            {twoFaToken ? "Verifique sua identidade." : "Entre no painel."}
          </h1>
          <p className="auth-subheading">
            {twoFaToken
              ? "Forneça o código de seis dígitos do seu autenticador."
              : "Identifique-se para continuar."}
          </p>

          {/* Error */}
          {error && (
            <div role="alert" className="auth-error">
              <span className="auth-error-tag">ERR</span>
              <span className="auth-error-msg">{error}</span>
            </div>
          )}

          {/* 2FA Form */}
          {twoFaToken ? (
            <form onSubmit={handle2fa} className="auth-form">
              <FieldRow
                index="01"
                label="CÓDIGO"
                meta="6 DÍGITOS"
                sigil={<SigilToken />}
                input={
                  <input
                    id="totp-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={twoFaCode}
                    onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    required
                    autoFocus
                    placeholder="······"
                    className="auth-input auth-input-mono"
                  />
                }
              />

              <button
                type="submit"
                disabled={submitting || twoFaCode.length < 6}
                className="auth-btn auth-btn-primary"
              >
                <span>{submitting ? "VERIFICANDO" : "VERIFICAR"}</span>
                <span className="auth-btn-kbd" aria-hidden="true">↵</span>
              </button>

              <button
                type="button"
                onClick={() => { setTwoFaToken(""); setTwoFaCode(""); setError(""); }}
                className="auth-btn auth-btn-ghost"
              >
                <span aria-hidden="true">←</span>
                <span>VOLTAR</span>
              </button>
            </form>
          ) : (
            /* Login Form */
            <form onSubmit={handleSubmit} className="auth-form">
              <FieldRow
                index="01"
                label="EMAIL"
                meta="OBRIGATÓRIO"
                sigil={<SigilEmail />}
                input={
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    placeholder="seu@dominio.com"
                    className="auth-input"
                  />
                }
              />

              <FieldRow
                index="02"
                label="SENHA"
                sigil={<SigilLock />}
                trailing={
                  <Link to="/forgot-password" className="auth-field-link">
                    esqueci →
                  </Link>
                }
                input={
                  <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="auth-input"
                  />
                }
              />

              <button
                type="submit"
                disabled={submitting}
                className="auth-btn auth-btn-primary"
              >
                <span>{submitting ? "ENTRANDO" : "ENTRAR"}</span>
                <span className="auth-btn-kbd" aria-hidden="true">↵</span>
              </button>

              {passkeySupported && (
                <>
                  <div className="auth-or">
                    <span className="auth-or-rule" />
                    <span className="auth-or-text">OU</span>
                    <span className="auth-or-rule" />
                  </div>
                  <button
                    type="button"
                    onClick={handlePasskeyLogin}
                    disabled={submitting}
                    className="auth-btn auth-btn-ghost"
                  >
                    <SigilKey />
                    <span>USAR PASSKEY</span>
                  </button>
                </>
              )}

              {/* OAuth */}
              {branding.oauthProviders.length > 0 && (
                <div className="auth-oauth">
                  <p className="auth-oauth-label">PROVEDORES EXTERNOS</p>
                  <div className="auth-oauth-row">
                    {branding.oauthProviders.includes("google") && (
                      <a href="/api/auth/oauth/google" className="auth-oauth-btn" aria-label="Entrar com Google">
                        <svg className="w-3.5 h-3.5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                        <span>GOOGLE</span>
                      </a>
                    )}
                    {branding.oauthProviders.includes("github") && (
                      <a href="/api/auth/oauth/github" className="auth-oauth-btn" aria-label="Entrar com GitHub">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/></svg>
                        <span>GITHUB</span>
                      </a>
                    )}
                    {branding.oauthProviders.includes("gitlab") && (
                      <a href="/api/auth/oauth/gitlab" className="auth-oauth-btn" aria-label="Entrar com GitLab">
                        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24"><path d="m23.6 9.593-.033-.086L20.3.98a.851.851 0 0 0-.336-.384.859.859 0 0 0-.995.053.874.874 0 0 0-.29.387l-2.2 6.723H7.528L5.328 1.036a.857.857 0 0 0-.29-.387.86.86 0 0 0-.994-.053.854.854 0 0 0-.337.384L.44 9.507l-.033.086a6.066 6.066 0 0 0 2.012 7.01l.01.008.028.02 4.984 3.73 2.466 1.866 1.502 1.135a1.012 1.012 0 0 0 1.22 0l1.502-1.135 2.466-1.866 5.012-3.75.013-.01a6.072 6.072 0 0 0 2.008-7.008z"/></svg>
                        <span>GITLAB</span>
                      </a>
                    )}
                  </div>
                </div>
              )}
            </form>
          )}
        </div>

        {/* Right rail — system metadata */}
        <aside className="auth-rail" aria-label="Informações do sistema">
          <div className="auth-rail-vert" aria-hidden="true">AXIA · TERMINAL</div>

          <div className="auth-rail-card">
            <div className="auth-rail-head">
              <span className="auth-rail-tag">SYSTEM</span>
              <span className="auth-rail-marker">·</span>
              <span className="auth-rail-id">02</span>
            </div>
            <dl className="auth-rail-list">
              <div className="auth-rail-row">
                <dt>HOST</dt>
                <dd className="auth-meta-tnum" title={host}>{host}</dd>
              </div>
              <div className="auth-rail-row">
                <dt>AGENT</dt>
                <dd className="auth-meta-tnum">v2.7.20</dd>
              </div>
              <div className="auth-rail-row">
                <dt>BUILD</dt>
                <dd className="auth-meta-tnum">{BUILD_HASH}</dd>
              </div>
              <div className="auth-rail-row">
                <dt>RUNTIME</dt>
                <dd>Rust · 2024</dd>
              </div>
              <div className="auth-rail-row">
                <dt>NODES</dt>
                <dd className="auth-meta-tnum">01 / 01</dd>
              </div>
              <div className="auth-rail-row">
                <dt>STATUS</dt>
                <dd>
                  <span className="auth-rail-pill auth-rail-pill-ok">
                    <span className="auth-rail-pill-dot" />
                    OPERACIONAL
                  </span>
                </dd>
              </div>
            </dl>

            <div className="auth-rail-foot">
              <span>SESSÃO · NOVA</span>
              <span className="auth-rail-marker">·</span>
              <span>TLS 1.3</span>
            </div>
          </div>

          <div className="auth-rail-tip">
            <span className="auth-rail-kbd">TAB</span>
            <span>navegar campos</span>
            <br />
            <span className="auth-rail-kbd">↵</span>
            <span>enviar</span>
          </div>
        </aside>
      </section>

      {/* Footer */}
      <footer className="auth-footer">
        <div className="auth-footer-meta">
          <span>{brandName.toUpperCase()}</span>
          <span className="auth-footer-dot">·</span>
          <span>v2.7</span>
          <span className="auth-footer-dot">·</span>
          <span>{BUILD_HASH}</span>
          <span className="auth-footer-dot">·</span>
          <span>RUST</span>
        </div>
        <nav className="auth-footer-nav" aria-label="Links auxiliares">
          <a href="/status" className="auth-footer-link">STATUS</a>
          <span className="auth-footer-dot">·</span>
          <a href="https://docs.axiapanel.com" target="_blank" rel="noopener noreferrer" className="auth-footer-link">DOCS</a>
          <span className="auth-footer-dot">·</span>
          <Link to="/register" className="auth-footer-link auth-footer-link-cta">+ CADASTRAR</Link>
        </nav>
      </footer>
    </main>
  );
}

/* ─── Shared field row ─── */

function FieldRow({
  index,
  label,
  meta,
  sigil,
  input,
  trailing,
}: {
  index?: string;
  label: string;
  meta?: string;
  sigil: React.ReactNode;
  input: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="auth-field">
      <div className="auth-field-head">
        <span className="auth-field-label">
          {index && <span className="auth-field-index">[{index}]</span>}
          <span>{label}</span>
          {meta && <span className="auth-field-meta-inline">· {meta}</span>}
        </span>
        {trailing}
      </div>
      <div className="auth-field-body">
        <span className="auth-field-sigil" aria-hidden="true">{sigil}</span>
        {input}
      </div>
    </div>
  );
}

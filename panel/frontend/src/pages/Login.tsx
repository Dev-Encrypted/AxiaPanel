import { useState, useEffect, FormEvent, useCallback, type ReactNode } from "react";
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

// Logo mark — used in both hero and mobile header
function LogoMark({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const sizeClasses = size === "lg" ? "w-16 h-16" : size === "sm" ? "w-10 h-10" : "w-12 h-12";
  const iconClasses = size === "lg" ? "w-9 h-9" : size === "sm" ? "w-6 h-6" : "w-7 h-7";
  return (
    <div className={`inline-flex items-center justify-center ${sizeClasses} login-logo-mark logo-icon-glow shrink-0`}>
      <svg className={`${iconClasses} text-white`} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M5 16h4" strokeLinecap="square" />
        <path d="M5 12h8" strokeLinecap="square" />
        <path d="M5 8h6" strokeLinecap="square" />
        <rect x="16" y="7" width="4" height="4" fill="currentColor" stroke="none" />
        <rect x="16" y="13" width="4" height="4" fill="currentColor" stroke="none" />
      </svg>
    </div>
  );
}

// Feature row used in hero panel
function HeroFeature({ icon, title, desc }: { icon: ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="w-8 h-8 shrink-0 flex items-center justify-center login-hero-feature-icon mt-0.5">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold login-hero-feature-title">{title}</p>
        <p className="text-xs login-hero-feature-desc mt-0.5 leading-relaxed">{desc}</p>
      </div>
    </div>
  );
}

export default function Login() {
  const { user, login, verify2fa, loading } = useAuth();
  const navigate = useNavigate();
  const branding = useBranding();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [needsSetup, setNeedsSetup] = useState(false);

  // 2FA state
  const [twoFaToken, setTwoFaToken] = useState("");
  const [twoFaCode, setTwoFaCode] = useState("");
  const [passkeySupported, setPasskeySupported] = useState(false);

  // Check if WebAuthn is available
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

  // Check if setup is needed (no users exist)
  useEffect(() => {
    fetch("/api/auth/setup-status")
      .then(r => r.json())
      .then(d => { if (d.needs_setup) setNeedsSetup(true); })
      .catch(() => {});
  }, []);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center login-shell">
      <div className="w-7 h-7 border-2 border-dark-600 border-t-rust-500 rounded-full animate-spin" />
    </div>
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

  // Brand display name (split for "AxiaPanel" so we can color it)
  const brandLabel = !branding.hideBranding && (
    branding.panelName === "AxiaPanel" ? (
      <><span className="text-rust-500">Axia</span><span className="login-brand-fg">Panel</span></>
    ) : (
      <span className="login-brand-fg">{branding.panelName}</span>
    )
  );

  return (
    <main className="login-shell min-h-screen w-full grid lg:grid-cols-[1.05fr_1fr]">
      {/* ── HERO PANEL (desktop only) ───────────────────────────── */}
      <aside className="login-hero hidden lg:flex flex-col justify-between p-12 relative overflow-hidden">
        {/* Decorative bg */}
        <div className="login-hero-bg absolute inset-0 pointer-events-none" aria-hidden="true" />
        <div className="login-hero-grid absolute inset-0 pointer-events-none" aria-hidden="true" />

        {/* Logo + brand */}
        <div className="relative flex items-center gap-3">
          {branding.logoUrl ? (
            <img src={branding.logoUrl} alt={branding.panelName} className="h-10 w-auto max-h-10 object-contain" />
          ) : (
            <LogoMark size="sm" />
          )}
          {brandLabel && (
            <span className="text-base font-semibold tracking-tight">
              {brandLabel}
            </span>
          )}
        </div>

        {/* Hero copy */}
        <div className="relative max-w-md">
          <p className="login-hero-eyebrow text-xs font-medium uppercase tracking-[0.18em] mb-4">
            Painel de gestão
          </p>
          <h1 className="text-4xl font-semibold tracking-tight leading-[1.1] mb-4">
            <span className="login-hero-title-fg">Servidores sob</span>
            <br />
            <span className="login-hero-title-accent">controle total.</span>
          </h1>
          <p className="login-hero-subtitle text-sm leading-relaxed">
            Implante sites, gerencie bancos e monitore tudo em um só lugar — com segurança de nível
            empresarial e a velocidade do Rust.
          </p>

          <div className="mt-9 space-y-4">
            <HeroFeature
              title="Implantação em segundos"
              desc="Git push para deploy automatizado, com rollback instantâneo se algo der errado."
              icon={
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                </svg>
              }
            />
            <HeroFeature
              title="Backups que funcionam"
              desc="Snapshots agendados, replicação off-site e restauração com um clique."
              icon={
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 12a9 9 0 1 1-9-9c2.4 0 4.6.94 6.2 2.5L21 8" />
                  <path d="M21 3v5h-5" />
                </svg>
              }
            />
            <HeroFeature
              title="Visibilidade total"
              desc="Métricas em tempo real, alertas inteligentes e logs centralizados."
              icon={
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 12h4l3-9 4 18 3-9h4" />
                </svg>
              }
            />
          </div>
        </div>

        {/* Footer */}
        <div className="relative flex items-center justify-between text-xs">
          <span className="login-hero-footer-text inline-flex items-center gap-2">
            <span className="login-status-dot" aria-hidden="true" />
            Todos os sistemas operacionais
          </span>
          <span className="login-hero-footer-meta">
            Powered by Rust · v2.7
          </span>
        </div>
      </aside>

      {/* ── FORM PANEL ──────────────────────────────────────────── */}
      <section className="login-panel flex items-center justify-center px-5 py-10 sm:px-8 relative">
        <div className="w-full max-w-sm relative">
          {/* Mobile branding — only visible below lg */}
          <div className="lg:hidden flex flex-col items-center text-center mb-8">
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt={branding.panelName} className="h-12 w-auto max-h-12 object-contain mb-3" />
            ) : (
              <LogoMark size="md" />
            )}
            {brandLabel && (
              <h2 className="text-base font-semibold tracking-tight mt-3">
                {brandLabel}
              </h2>
            )}
          </div>

          {/* Heading */}
          <div className="mb-7">
            <h2 className="text-2xl font-semibold tracking-tight login-panel-heading">
              {twoFaToken ? "Verificação em duas etapas" : "Bem-vindo de volta"}
            </h2>
            <p className="text-sm login-panel-subheading mt-1.5">
              {twoFaToken
                ? "Digite o código do seu aplicativo autenticador"
                : "Entre com sua conta para acessar o painel"}
            </p>
          </div>

          {/* Error banner */}
          {error && (
            <div role="alert" className="login-error mb-5 text-sm px-4 py-3 flex items-start gap-2.5">
              <svg className="w-4 h-4 mt-0.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <span className="leading-relaxed">{error}</span>
            </div>
          )}

          {/* 2FA Form */}
          {twoFaToken ? (
            <form onSubmit={handle2fa} className="space-y-5 login-form-anim">
              <div>
                <label htmlFor="totp-code" className="block text-sm font-medium login-label mb-1.5">
                  Código de 6 dígitos
                </label>
                <input
                  id="totp-code"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={twoFaCode}
                  onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                  required
                  autoFocus
                  className="login-input w-full px-4 py-3 text-center tracking-[0.5em] font-mono text-lg"
                  placeholder="000000"
                />
                <p className="text-xs login-hint mt-2">
                  Aceitamos também códigos de recuperação.
                </p>
              </div>

              <button
                type="submit"
                disabled={submitting || twoFaCode.length < 6}
                className="login-btn-primary w-full py-3 text-sm font-medium"
              >
                {submitting ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Verificando…
                  </span>
                ) : "Verificar código"}
              </button>

              <button
                type="button"
                onClick={() => { setTwoFaToken(""); setTwoFaCode(""); setError(""); }}
                className="login-btn-link w-full py-2 text-sm"
              >
                ← Voltar para login
              </button>
            </form>
          ) : (
            /* Login Form */
            <form onSubmit={handleSubmit} className="space-y-5 login-form-anim">
              <div>
                <label htmlFor="login-email" className="block text-sm font-medium login-label mb-1.5">Email</label>
                <div className="login-input-wrap">
                  <svg className="login-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                    <polyline points="22,6 12,13 2,6" />
                  </svg>
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    className="login-input login-input-with-icon w-full px-4 py-3"
                    placeholder="seu@email.com"
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label htmlFor="login-password" className="block text-sm font-medium login-label">Senha</label>
                  <Link to="/forgot-password" className="login-link-subtle text-xs">
                    Esqueceu?
                  </Link>
                </div>
                <div className="login-input-wrap">
                  <svg className="login-input-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                    <path d="M7 11V7a5 5 0 0 1 10 0v4" />
                  </svg>
                  <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="login-input login-input-with-icon w-full px-4 py-3"
                    placeholder="••••••••"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="login-btn-primary w-full py-3 text-sm font-medium"
              >
                {submitting ? (
                  <span className="inline-flex items-center justify-center gap-2">
                    <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                    Entrando…
                  </span>
                ) : "Entrar"}
              </button>

              {passkeySupported && (
                <>
                  <div className="login-divider">
                    <span>ou</span>
                  </div>
                  <button
                    type="button"
                    onClick={handlePasskeyLogin}
                    disabled={submitting}
                    className="login-btn-secondary w-full py-3 text-sm font-medium inline-flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z" />
                      <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
                    </svg>
                    Usar passkey
                  </button>
                </>
              )}
            </form>
          )}

          {/* OAuth Buttons */}
          {branding.oauthProviders.length > 0 && !twoFaToken && (
            <div className="mt-5">
              <div className="login-divider">
                <span>ou continue com</span>
              </div>
              <div className={`grid gap-2 ${branding.oauthProviders.length > 1 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                {branding.oauthProviders.includes("google") && (
                  <a href="/api/auth/oauth/google" className="login-btn-oauth flex items-center justify-center gap-2 py-2.5 text-sm font-medium">
                    <svg className="w-4 h-4" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                    Google
                  </a>
                )}
                {branding.oauthProviders.includes("github") && (
                  <a href="/api/auth/oauth/github" className="login-btn-oauth login-btn-oauth-dark flex items-center justify-center gap-2 py-2.5 text-sm font-medium">
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/></svg>
                    GitHub
                  </a>
                )}
                {branding.oauthProviders.includes("gitlab") && (
                  <a href="/api/auth/oauth/gitlab" className="login-btn-oauth flex items-center justify-center gap-2 py-2.5 text-sm font-medium" style={{ backgroundColor: "#FC6D26", color: "#ffffff", borderColor: "#FC6D26" }}>
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="m23.6 9.593-.033-.086L20.3.98a.851.851 0 0 0-.336-.384.859.859 0 0 0-.995.053.874.874 0 0 0-.29.387l-2.2 6.723H7.528L5.328 1.036a.857.857 0 0 0-.29-.387.86.86 0 0 0-.994-.053.854.854 0 0 0-.337.384L.44 9.507l-.033.086a6.066 6.066 0 0 0 2.012 7.01l.01.008.028.02 4.984 3.73 2.466 1.866 1.502 1.135a1.012 1.012 0 0 0 1.22 0l1.502-1.135 2.466-1.866 5.012-3.75.013-.01a6.072 6.072 0 0 0 2.008-7.008z"/></svg>
                    GitLab
                  </a>
                )}
              </div>
            </div>
          )}

          {/* Sign-up + footer */}
          <p className="text-center text-sm login-footer-text mt-7">
            Não tem uma conta?{" "}
            <Link to="/register" className="login-link-strong">
              Cadastre-se
            </Link>
          </p>

          {/* Mobile-only mini footer */}
          <p className="lg:hidden text-center text-[10px] login-footer-meta mt-8 tracking-wider uppercase">
            Powered by Rust
          </p>
        </div>
      </section>
    </main>
  );
}

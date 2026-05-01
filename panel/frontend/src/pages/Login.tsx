import { useState, useEffect, FormEvent, useCallback } from "react";
import { useNavigate, Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useBranding } from "../context/BrandingContext";
import {
  IconEmail, IconLock, IconShield, IconKey, IconArrow, IconAlert, BrandMark,
} from "../components/AuthIcons";

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
      <div className="auth-loading-spinner" />
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

  return (
    <main className="auth-page">
      <section className="auth-stage">
        <div className="auth-card">
          {/* Brand */}
          <Link to="/" className="auth-brand" aria-label={brandName}>
            {branding.logoUrl ? (
              <img src={branding.logoUrl} alt={brandName} className="h-9 w-auto max-h-9 object-contain" />
            ) : (
              <span className="auth-brand-mark"><BrandMark /></span>
            )}
            {!branding.hideBranding && (
              <span className="auth-brand-name">
                {brandName === "AxiaPanel" ? (
                  <>Axia<span className="auth-brand-faint">Panel</span></>
                ) : (
                  brandName
                )}
              </span>
            )}
          </Link>

          {/* Heading */}
          <h1 className="auth-heading">
            {twoFaToken ? "Verificação em duas etapas" : "Bem-vindo de volta"}
          </h1>
          <p className="auth-subheading">
            {twoFaToken
              ? "Digite o código de 6 dígitos do seu aplicativo autenticador."
              : "Entre com sua conta para acessar o painel."}
          </p>

          {/* Error */}
          {error && (
            <div role="alert" className="auth-error">
              <IconAlert />
              <span>{error}</span>
            </div>
          )}

          {/* 2FA Form */}
          {twoFaToken ? (
            <form onSubmit={handle2fa} className="auth-form">
              <div className="auth-field">
                <label htmlFor="totp-code" className="auth-field-head">
                  <span className="auth-field-label">Código de autenticação</span>
                </label>
                <div className="auth-field-body">
                  <span className="auth-field-icon" aria-hidden="true"><IconShield /></span>
                  <input
                    id="totp-code"
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    value={twoFaCode}
                    onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, "").slice(0, 8))}
                    required
                    autoFocus
                    placeholder="000000"
                    className="auth-input auth-input-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting || twoFaCode.length < 6}
                className="auth-btn auth-btn-primary"
              >
                {submitting ? (
                  <><span className="auth-btn-spinner" /><span>Verificando…</span></>
                ) : (
                  <><span>Verificar código</span><IconArrow /></>
                )}
              </button>

              <button
                type="button"
                onClick={() => { setTwoFaToken(""); setTwoFaCode(""); setError(""); }}
                className="auth-btn-link"
              >
                ← Voltar para login
              </button>
            </form>
          ) : (
            /* Login Form */
            <form onSubmit={handleSubmit} className="auth-form">
              <div className="auth-field">
                <label htmlFor="login-email" className="auth-field-head">
                  <span className="auth-field-label">Email</span>
                </label>
                <div className="auth-field-body">
                  <span className="auth-field-icon" aria-hidden="true"><IconEmail /></span>
                  <input
                    id="login-email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    autoFocus
                    placeholder="seu@email.com"
                    className="auth-input"
                  />
                </div>
              </div>

              <div className="auth-field">
                <div className="auth-field-head">
                  <label htmlFor="login-password" className="auth-field-label">Senha</label>
                  <Link to="/forgot-password" className="auth-field-link">
                    Esqueceu a senha?
                  </Link>
                </div>
                <div className="auth-field-body">
                  <span className="auth-field-icon" aria-hidden="true"><IconLock /></span>
                  <input
                    id="login-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    placeholder="••••••••"
                    className="auth-input"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="auth-btn auth-btn-primary"
              >
                {submitting ? (
                  <><span className="auth-btn-spinner" /><span>Entrando…</span></>
                ) : (
                  <><span>Entrar</span><IconArrow /></>
                )}
              </button>

              {passkeySupported && (
                <>
                  <div className="auth-or">
                    <span className="auth-or-rule" />
                    <span className="auth-or-text">ou</span>
                    <span className="auth-or-rule" />
                  </div>
                  <button
                    type="button"
                    onClick={handlePasskeyLogin}
                    disabled={submitting}
                    className="auth-btn auth-btn-secondary"
                  >
                    <IconKey />
                    <span>Entrar com passkey</span>
                  </button>
                </>
              )}

              {branding.oauthProviders.length > 0 && (
                <div className="auth-oauth">
                  <div className="auth-or">
                    <span className="auth-or-rule" />
                    <span className="auth-or-text">ou continue com</span>
                    <span className="auth-or-rule" />
                  </div>
                  <div className="auth-oauth-row">
                    {branding.oauthProviders.includes("google") && (
                      <a href="/api/auth/oauth/google" className="auth-oauth-btn" aria-label="Entrar com Google">
                        <svg width="16" height="16" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                        <span>Google</span>
                      </a>
                    )}
                    {branding.oauthProviders.includes("github") && (
                      <a href="/api/auth/oauth/github" className="auth-oauth-btn" aria-label="Entrar com GitHub">
                        <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0 1 12 6.844a9.59 9.59 0 0 1 2.504.337c1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.02 10.02 0 0 0 22 12.017C22 6.484 17.522 2 12 2z"/></svg>
                        <span>GitHub</span>
                      </a>
                    )}
                    {branding.oauthProviders.includes("gitlab") && (
                      <a href="/api/auth/oauth/gitlab" className="auth-oauth-btn" aria-label="Entrar com GitLab">
                        <svg width="16" height="16" fill="#FC6D26" viewBox="0 0 24 24"><path d="m23.6 9.593-.033-.086L20.3.98a.851.851 0 0 0-.336-.384.859.859 0 0 0-.995.053.874.874 0 0 0-.29.387l-2.2 6.723H7.528L5.328 1.036a.857.857 0 0 0-.29-.387.86.86 0 0 0-.994-.053.854.854 0 0 0-.337.384L.44 9.507l-.033.086a6.066 6.066 0 0 0 2.012 7.01l.01.008.028.02 4.984 3.73 2.466 1.866 1.502 1.135a1.012 1.012 0 0 0 1.22 0l1.502-1.135 2.466-1.866 5.012-3.75.013-.01a6.072 6.072 0 0 0 2.008-7.008z"/></svg>
                        <span>GitLab</span>
                      </a>
                    )}
                  </div>
                </div>
              )}
            </form>
          )}

          {/* Sign-up */}
          {!twoFaToken && (
            <p className="auth-altline">
              Não tem uma conta?
              <Link to="/register" className="auth-altline-link">Cadastre-se</Link>
            </p>
          )}
        </div>
      </section>

      {/* Footer */}
      <footer className="auth-footer">
        <span>© {new Date().getFullYear()} {brandName}</span>
        <span className="auth-footer-dot">·</span>
        <a href="/status" className="auth-footer-link">Status</a>
        <span className="auth-footer-dot">·</span>
        <a href="https://docs.axiapanel.com" target="_blank" rel="noopener noreferrer" className="auth-footer-link">Documentação</a>
      </footer>
    </main>
  );
}

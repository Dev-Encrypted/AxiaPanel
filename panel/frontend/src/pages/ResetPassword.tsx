import { useState, useEffect, useMemo, FormEvent } from "react";
import { Link, Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useBranding } from "../context/BrandingContext";
import { api } from "../api";
import {
  IconLock, IconArrow, IconAlert, IconCheck, BrandMark,
} from "../components/AuthIcons";

export default function ResetPassword() {
  const { user, loading } = useAuth();
  const branding = useBranding();
  const [params] = useSearchParams();
  const token = useMemo(() => params.get("token") || "", []); // eslint-disable-line react-hooks/exhaustive-deps
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Prevent token from leaking via Referer header and clear it from URL
  useEffect(() => {
    if (token) {
      const meta = document.createElement("meta");
      meta.name = "referrer";
      meta.content = "no-referrer";
      document.head.appendChild(meta);
      window.history.replaceState({}, "", "/reset-password");
      return () => { document.head.removeChild(meta); };
    }
  }, [token]);

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  const brandName = branding.panelName || "AxiaPanel";

  const Brand = (
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
          ) : brandName}
        </span>
      )}
    </Link>
  );

  // Invalid / missing token state
  if (!token) {
    return (
      <main className="auth-page">
        <section className="auth-stage">
          <div className="auth-card">
            {Brand}
            <h1 className="auth-heading">Link inválido</h1>
            <p className="auth-subheading">
              O link de redefinição é inválido ou já foi usado. Solicite um novo abaixo.
            </p>
            <div className="auth-form">
              <Link to="/forgot-password" className="auth-btn auth-btn-primary">
                <span>Solicitar novo link</span>
                <IconArrow />
              </Link>
              <Link to="/login" className="auth-btn-link">← Voltar para login</Link>
            </div>
          </div>
        </section>
        <footer className="auth-footer">
          <span>© {new Date().getFullYear()} {brandName}</span>
        </footer>
      </main>
    );
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("As senhas não coincidem");
      return;
    }
    setSubmitting(true);
    try {
      await api.post("/auth/reset-password", { token, password });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha na redefinição");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main className="auth-page">
      <section className="auth-stage">
        <div className="auth-card">
          {Brand}

          {success ? (
            <>
              <div className="auth-illustration auth-illustration-success"><IconCheck /></div>
              <h1 className="auth-heading">Senha redefinida</h1>
              <p className="auth-subheading">
                Sua nova senha já está ativa. Faça login para continuar.
              </p>
              <Link to="/login" className="auth-btn auth-btn-primary">
                <span>Entrar</span>
                <IconArrow />
              </Link>
            </>
          ) : (
            <>
              <h1 className="auth-heading">Defina uma nova senha</h1>
              <p className="auth-subheading">
                Escolha uma senha forte com pelo menos 8 caracteres.
              </p>

              {error && (
                <div role="alert" className="auth-error">
                  <IconAlert />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="auth-form">
                <div className="auth-field">
                  <label htmlFor="new-password" className="auth-field-head">
                    <span className="auth-field-label">Nova senha</span>
                    <span className="auth-field-hint">mínimo 8 caracteres</span>
                  </label>
                  <div className="auth-field-body">
                    <span className="auth-field-icon" aria-hidden="true"><IconLock /></span>
                    <input
                      id="new-password"
                      type="password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      minLength={8}
                      autoFocus
                      placeholder="••••••••"
                      className="auth-input"
                    />
                  </div>
                </div>

                <div className="auth-field">
                  <label htmlFor="confirm-password" className="auth-field-head">
                    <span className="auth-field-label">Confirmar senha</span>
                  </label>
                  <div className="auth-field-body">
                    <span className="auth-field-icon" aria-hidden="true"><IconLock /></span>
                    <input
                      id="confirm-password"
                      type="password"
                      value={confirm}
                      onChange={(e) => setConfirm(e.target.value)}
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
                    <><span className="auth-btn-spinner" /><span>Redefinindo…</span></>
                  ) : (
                    <><span>Redefinir senha</span><IconArrow /></>
                  )}
                </button>
              </form>
            </>
          )}
        </div>
      </section>

      <footer className="auth-footer">
        <span>© {new Date().getFullYear()} {brandName}</span>
        <span className="auth-footer-dot">·</span>
        <a href="/status" className="auth-footer-link">Status</a>
      </footer>
    </main>
  );
}

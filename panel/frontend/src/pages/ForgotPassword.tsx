import { useState, FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useBranding } from "../context/BrandingContext";
import { api } from "../api";
import {
  IconEmail, IconArrow, IconAlert, IconMailSent, BrandMark,
} from "../components/AuthIcons";

export default function ForgotPassword() {
  const { user, loading } = useAuth();
  const branding = useBranding();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await api.post("/auth/forgot-password", { email });
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha ao enviar email de redefinição");
    } finally {
      setSubmitting(false);
    }
  };

  const brandName = branding.panelName || "AxiaPanel";

  return (
    <main className="auth-page">
      <section className="auth-stage">
        <div className="auth-card">
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

          {success ? (
            <>
              <div className="auth-illustration"><IconMailSent /></div>
              <h1 className="auth-heading">Verifique seu email</h1>
              <p className="auth-subheading">
                Se uma conta existir com esse endereço, enviamos um link de redefinição.
                O link expira em 1 hora.
              </p>
              <Link to="/login" className="auth-btn auth-btn-primary">
                <span>Voltar para login</span>
                <IconArrow />
              </Link>
            </>
          ) : (
            <>
              <h1 className="auth-heading">Esqueceu a senha?</h1>
              <p className="auth-subheading">
                Digite seu email e enviaremos um link para redefinir.
              </p>

              {error && (
                <div role="alert" className="auth-error">
                  <IconAlert />
                  <span>{error}</span>
                </div>
              )}

              <form onSubmit={handleSubmit} className="auth-form">
                <div className="auth-field">
                  <label htmlFor="forgot-email" className="auth-field-head">
                    <span className="auth-field-label">Email</span>
                  </label>
                  <div className="auth-field-body">
                    <span className="auth-field-icon" aria-hidden="true"><IconEmail /></span>
                    <input
                      id="forgot-email"
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

                <button
                  type="submit"
                  disabled={submitting}
                  className="auth-btn auth-btn-primary"
                >
                  {submitting ? (
                    <><span className="auth-btn-spinner" /><span>Enviando…</span></>
                  ) : (
                    <><span>Enviar link de redefinição</span><IconArrow /></>
                  )}
                </button>
              </form>

              <p className="auth-altline">
                Lembrou a senha?
                <Link to="/login" className="auth-altline-link">Voltar para login</Link>
              </p>
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

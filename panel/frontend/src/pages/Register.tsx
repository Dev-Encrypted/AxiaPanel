import { useState, FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useBranding } from "../context/BrandingContext";
import { api } from "../api";
import {
  IconEmail, IconLock, IconArrow, IconAlert, IconCheck, BrandMark,
} from "../components/AuthIcons";

export default function Register() {
  const { user, loading } = useAuth();
  const branding = useBranding();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [submitting, setSubmitting] = useState(false);

  if (loading) return null;
  if (user) return <Navigate to="/" replace />;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirm) {
      setError("As senhas não coincidem");
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.post<{ message: string }>("/auth/register", {
        email,
        password,
      });
      setSuccess(res.message || "Conta criada! Verifique seu email para confirmar.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Falha no cadastro");
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

          <h1 className="auth-heading">
            {success ? "Tudo certo" : "Crie sua conta"}
          </h1>
          <p className="auth-subheading">
            {success
              ? "Verifique seu email para confirmar e começar."
              : "Comece a gerenciar seus servidores em minutos."}
          </p>

          {error && (
            <div role="alert" className="auth-error">
              <IconAlert />
              <span>{error}</span>
            </div>
          )}

          {success ? (
            <div className="auth-form">
              <div className="auth-success">
                <IconCheck />
                <span>{success}</span>
              </div>
              <Link to="/login" className="auth-btn auth-btn-primary">
                <span>Ir para login</span>
                <IconArrow />
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="auth-form">
              <div className="auth-field">
                <label htmlFor="reg-email" className="auth-field-head">
                  <span className="auth-field-label">Email</span>
                </label>
                <div className="auth-field-body">
                  <span className="auth-field-icon" aria-hidden="true"><IconEmail /></span>
                  <input
                    id="reg-email"
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
                <label htmlFor="reg-password" className="auth-field-head">
                  <span className="auth-field-label">Senha</span>
                  <span className="auth-field-hint">mínimo 8 caracteres</span>
                </label>
                <div className="auth-field-body">
                  <span className="auth-field-icon" aria-hidden="true"><IconLock /></span>
                  <input
                    id="reg-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    minLength={8}
                    placeholder="••••••••"
                    className="auth-input"
                  />
                </div>
              </div>

              <div className="auth-field">
                <label htmlFor="reg-confirm" className="auth-field-head">
                  <span className="auth-field-label">Confirmar senha</span>
                </label>
                <div className="auth-field-body">
                  <span className="auth-field-icon" aria-hidden="true"><IconLock /></span>
                  <input
                    id="reg-confirm"
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
                  <><span className="auth-btn-spinner" /><span>Criando conta…</span></>
                ) : (
                  <><span>Criar conta</span><IconArrow /></>
                )}
              </button>
            </form>
          )}

          {!success && (
            <p className="auth-altline">
              Já tem uma conta?
              <Link to="/login" className="auth-altline-link">Entrar</Link>
            </p>
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

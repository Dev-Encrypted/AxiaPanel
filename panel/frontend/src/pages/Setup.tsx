import { useState, FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useBranding } from "../context/BrandingContext";
import { api, ApiError } from "../api";
import {
  IconEmail, IconLock, IconArrow, IconAlert, BrandMark,
} from "../components/AuthIcons";

export default function Setup() {
  const navigate = useNavigate();
  const branding = useBranding();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirm) {
      setError("As senhas não coincidem");
      return;
    }
    if (password.length < 8) {
      setError("A senha deve ter no mínimo 8 caracteres");
      return;
    }

    setSubmitting(true);
    try {
      await api.post("/auth/setup", { email, password });
      navigate("/login");
    } catch (err) {
      if (err instanceof ApiError && err.status === 403) {
        setError("Configuração já concluída. Por favor, faça login.");
      } else {
        setError(err instanceof Error ? err.message : "Falha na configuração");
      }
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

          <h1 className="auth-heading">Configuração inicial</h1>
          <p className="auth-subheading">
            Crie a primeira conta de administrador para começar a usar o painel.
          </p>

          {error && (
            <div role="alert" className="auth-error">
              <IconAlert />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="auth-form">
            <div className="auth-field">
              <label htmlFor="setup-email" className="auth-field-head">
                <span className="auth-field-label">Email do administrador</span>
              </label>
              <div className="auth-field-body">
                <span className="auth-field-icon" aria-hidden="true"><IconEmail /></span>
                <input
                  id="setup-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  placeholder="admin@dominio.com"
                  className="auth-input"
                />
              </div>
            </div>

            <div className="auth-field">
              <label htmlFor="setup-password" className="auth-field-head">
                <span className="auth-field-label">Senha</span>
                <span className="auth-field-hint">mínimo 8 caracteres</span>
              </label>
              <div className="auth-field-body">
                <span className="auth-field-icon" aria-hidden="true"><IconLock /></span>
                <input
                  id="setup-password"
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
              <label htmlFor="setup-confirm-password" className="auth-field-head">
                <span className="auth-field-label">Confirmar senha</span>
              </label>
              <div className="auth-field-body">
                <span className="auth-field-icon" aria-hidden="true"><IconLock /></span>
                <input
                  id="setup-confirm-password"
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
                <><span className="auth-btn-spinner" /><span>Criando…</span></>
              ) : (
                <><span>Criar conta de admin</span><IconArrow /></>
              )}
            </button>
          </form>

          <p className="auth-altline">
            Já configurado?
            <Link to="/login" className="auth-altline-link">Entrar</Link>
          </p>
        </div>
      </section>

      <footer className="auth-footer">
        <span>© {new Date().getFullYear()} {brandName}</span>
      </footer>
    </main>
  );
}

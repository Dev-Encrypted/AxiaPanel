import { useState, useEffect } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useBranding } from "../context/BrandingContext";
import { api } from "../api";
import {
  IconArrow, IconAlert, IconCheck, BrandMark, AuthSpinner,
} from "../components/AuthIcons";

export default function VerifyEmail() {
  const branding = useBranding();
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const [status, setStatus] = useState<"loading" | "success" | "error">("loading");
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!token) {
      setStatus("error");
      setMessage("Link de verificação inválido.");
      return;
    }
    api
      .post<{ message: string }>("/auth/verify-email", { token })
      .then((res) => {
        setStatus("success");
        setMessage(res.message || "Email verificado!");
      })
      .catch((err) => {
        setStatus("error");
        setMessage(err instanceof Error ? err.message : "Falha na verificação");
      });
  }, [token]);

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

          {status === "loading" && (
            <>
              <div className="auth-illustration"><AuthSpinner /></div>
              <h1 className="auth-heading">Verificando…</h1>
              <p className="auth-subheading">
                Estamos confirmando seu email. Isso leva só um instante.
              </p>
            </>
          )}

          {status === "success" && (
            <>
              <div className="auth-illustration auth-illustration-success"><IconCheck /></div>
              <h1 className="auth-heading">Email verificado</h1>
              <p className="auth-subheading">{message}</p>
              <Link to="/login" className="auth-btn auth-btn-primary">
                <span>Ir para login</span>
                <IconArrow />
              </Link>
            </>
          )}

          {status === "error" && (
            <>
              <div className="auth-illustration auth-illustration-error"><IconAlert /></div>
              <h1 className="auth-heading">Não foi possível verificar</h1>
              <p className="auth-subheading">{message}</p>
              <Link to="/login" className="auth-btn auth-btn-primary">
                <span>Ir para login</span>
                <IconArrow />
              </Link>
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

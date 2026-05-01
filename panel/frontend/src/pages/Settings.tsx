import { useState, useEffect, useRef } from "react";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import ProvisionLog from "../components/ProvisionLog";
import UpdatesContent from "./Updates";

interface HealthStatus {
  db: string;
  agent: string;
  uptime: string;
  database: boolean; // computed
  agentOk: boolean;  // computed
}

interface BackupDestination {
  id: string;
  name: string;
  dtype: string;
  config: Record<string, string>;
  created_at: string;
}

interface Passkey {
  id: string;
  name: string;
  created_at: string;
}

interface ApiKey {
  id: string;
  name: string;
  created_at: string;
}

interface ExportConfig {
  settings: Record<string, string>;
  [key: string]: unknown;
}

interface CleanupResult {
  cleaned?: string[];
}

/** WebAuthn PublicKeyCredentialCreationOptions as returned by the server (base64url-encoded) */
interface WebAuthnPublicKeyOptions {
  challenge: string | ArrayBuffer;
  user: { id: string | ArrayBuffer; name: string; displayName: string };
  rp: { name: string; id?: string };
  pubKeyCredParams: { type: string; alg: number }[];
  excludeCredentials?: { id: string | ArrayBuffer; type: string }[];
  [key: string]: unknown;
}

type ServiceStatus = Record<string, { installed?: boolean; running?: boolean; active?: boolean; version?: string | null }>;

export default function Settings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [message, setMessage] = useState({ text: "", type: "" });
  const healthTimer = useRef<ReturnType<typeof setInterval>>(undefined);
  const qrRef = useRef<HTMLDivElement>(null);

  // Form state
  const [panelName, setPanelName] = useState("");
  const [smtpProvider, setSmtpProvider] = useState("custom");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpFromName, setSmtpFromName] = useState("");
  const [smtpEncryption, setSmtpEncryption] = useState("starttls");
  const [testingEmail, setTestingEmail] = useState(false);

  // Update count for tab badge
  const [updateCount, setUpdateCount] = useState(0);

  // 2FA state
  const [twoFaEnabled, setTwoFaEnabled] = useState(false);
  const [twoFaSetup, setTwoFaSetup] = useState<{ secret: string; qr_svg: string } | null>(null);
  const [twoFaCode, setTwoFaCode] = useState("");
  const [twoFaDisableCode, setTwoFaDisableCode] = useState("");
  const [recoveryCodes, setRecoveryCodes] = useState<string[]>([]);
  const [twoFaLoading, setTwoFaLoading] = useState(false);

  // Passkeys
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [passkeyLoading, setPasskeyLoading] = useState(false);
  const [passkeyName, setPasskeyName] = useState("Meu Passkey");
  const [passkeySupported] = useState(() => !!window.PublicKeyCredential);
  const [renamingPasskey, setRenamingPasskey] = useState<string | null>(null);
  const [passkeyRenameValue, setPasskeyRenameValue] = useState("");

  // Auto-healing
  const [autoHealEnabled, setAutoHealEnabled] = useState(false);
  const [reverseProxy, setReverseProxy] = useState("nginx");
  const [traefikInstalling, setTraefikInstalling] = useState(false);
  const [showTraefikEmail, setShowTraefikEmail] = useState(false);
  const [traefikEmail, setTraefikEmail] = useState("admin@example.com");

  // PowerDNS
  const [pdnsApiUrl, setPdnsApiUrl] = useState("");
  const [pdnsApiKey, setPdnsApiKey] = useState("");
  const [showPdnsGuide, setShowPdnsGuide] = useState(false);

  // Notification channels
  const [notifySlackUrl, setNotifySlackUrl] = useState("");
  const [notifyDiscordUrl, setNotifyDiscordUrl] = useState("");
  const [notifyPagerdutyKey, setNotifyPagerdutyKey] = useState("");
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [testingWebhook, setTestingWebhook] = useState<string | null>(null);
  const [webhookResult, setWebhookResult] = useState<{ type: string; msg: string }>({ type: "", msg: "" });
  const [mutedTypes, setMutedTypes] = useState<string[]>([]);
  // GPU alert thresholds
  const [gpuAlertEnabled, setGpuAlertEnabled] = useState(true);
  const [gpuUtilThreshold, setGpuUtilThreshold] = useState(95);
  const [gpuUtilDuration, setGpuUtilDuration] = useState(5);
  const [gpuTempThreshold, setGpuTempThreshold] = useState(85);
  const [gpuVramThreshold, setGpuVramThreshold] = useState(95);

  // Password change
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");

  // API Keys
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [showNewKey, setShowNewKey] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyResult, setNewKeyResult] = useState<string | null>(null);

  // Hostname
  const [hostname, setHostname] = useState("");

  // Theme
  const [currentTheme, setCurrentTheme] = useState(() => localStorage.getItem("dp-theme") || "axia");
  const [showHeader, setShowHeader] = useState(() => localStorage.getItem("dp-show-header") === "true");
  const [flatNav, setFlatNav] = useState(() => localStorage.getItem("dp-flat-nav") === "true");

  // Backup destinations
  const [destinations, setDestinations] = useState<BackupDestination[]>([]);
  const [showDestForm, setShowDestForm] = useState(false);
  const [destName, setDestName] = useState("");
  const [destType, setDestType] = useState("s3");
  const [destBucket, setDestBucket] = useState("");
  const [destRegion, setDestRegion] = useState("us-east-1");
  const [destEndpoint, setDestEndpoint] = useState("https://s3.amazonaws.com");
  const [destAccessKey, setDestAccessKey] = useState("");
  const [destSecretKey, setDestSecretKey] = useState("");
  const [destPathPrefix, setDestPathPrefix] = useState("backups");
  const [destSftpHost, setDestSftpHost] = useState("");
  const [destSftpPort, setDestSftpPort] = useState("22");
  const [destSftpUser, setDestSftpUser] = useState("");
  const [destSftpPass, setDestSftpPass] = useState("");
  const [destSftpPath, setDestSftpPath] = useState("/backups");
  const [savingDest, setSavingDest] = useState(false);
  const [testingDest, setTestingDest] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{ type: string; label: string; data?: Record<string, unknown> } | null>(null);

  const loadSettings = async () => {
    try {
      const data = await api.get<Record<string, string>>("/settings");
      setSettings(data);
      setPanelName(data.panel_name || "");
      setSmtpHost(data.smtp_host || "");
      setSmtpPort(data.smtp_port || "");
      setSmtpUser(data.smtp_username || "");
      setSmtpPass(data.smtp_password || "");
      setSmtpFrom(data.smtp_from || "");
      setSmtpFromName(data.smtp_from_name || "");
      setSmtpEncryption(data.smtp_encryption || "starttls");
      setAutoHealEnabled(data.auto_heal_enabled === "true");
      setReverseProxy(data.reverse_proxy || "nginx");
      setPdnsApiUrl(data.pdns_api_url || "");
      setPdnsApiKey(data.pdns_api_key || "");
    } catch (e) {
      setMessage({
        text: e instanceof Error ? e.message : "Falha ao carregar configurações",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadHealth = async () => {
    try {
      const raw = await api.get<{ db: string; agent: string; uptime: string }>("/settings/health");
      setHealth({ ...raw, database: raw.db === "ok", agentOk: raw.agent === "ok" });
    } catch {
      setHealth(null);
    } finally {
      setHealthLoading(false);
    }
  };

  const loadDestinations = async () => {
    try {
      const data = await api.get<BackupDestination[]>("/backup-destinations");
      setDestinations(data);
    } catch {
      setMessage({ text: "Falha ao carregar destinos de backup", type: "error" });
    }
  };

  const executeConfirm = async () => {
    if (!pendingConfirm) return;
    const { type, data } = pendingConfirm;
    setPendingConfirm(null);
    try {
      switch (type) {
        case "traefik_uninstall": {
          setTraefikInstalling(true);
          await api.post("/traefik/uninstall");
          setReverseProxy("nginx");
          setMessage({ text: "Alternado para nginx", type: "success" });
          setTraefikInstalling(false);
          break;
        }
        case "import_config": {
          if (!data) break;
          await api.post("/settings/import", data.config);
          setMessage({ text: "Configuração importada", type: "success" });
          window.location.reload();
          break;
        }
        case "delete_destination": {
          if (!data) break;
          await api.delete(`/backup-destinations/${data.id}`);
          loadDestinations();
          setMessage({ text: "Destino removido", type: "success" });
          break;
        }
        case "revoke_sessions": {
          await api.post("/auth/revoke-all");
          setMessage({ text: "Todas as sessões revogadas", type: "success" });
          setTimeout(() => { window.location.href = "/login"; }, 2000);
          break;
        }
        case "revoke_key": {
          if (!data) break;
          await api.delete(`/api-keys/${data.id}`);
          setApiKeys(apiKeys.filter((a) => a.id !== data.id));
          setMessage({ text: "API key revogada", type: "success" });
          break;
        }
      }
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Falha na ação", type: "error" });
      if (type === "traefik_uninstall") setTraefikInstalling(false);
    }
  };

  const load2faStatus = async () => {
    try {
      const data = await api.get<{ enabled: boolean }>("/auth/2fa/status");
      setTwoFaEnabled(data.enabled);
    } catch { /* ignore */ }
  };

  const loadPasskeys = async () => {
    try {
      const data = await api.get<{ passkeys: Passkey[] }>("/auth/passkeys");
      setPasskeys(data.passkeys || []);
    } catch { /* ignore */ }
  };

  const loadNotifyChannels = async () => {
    try {
      const rules = await api.get<{ notify_email?: boolean; notify_slack_url?: string; notify_discord_url?: string; notify_pagerduty_key?: string; muted_types?: string; alert_gpu?: boolean; gpu_util_threshold?: number; gpu_util_duration?: number; gpu_temp_threshold?: number; gpu_vram_threshold?: number }[]>("/alert-rules");
      if (rules.length > 0) {
        const r = rules[0];
        setNotifyEmail(r.notify_email !== false);
        setNotifySlackUrl(r.notify_slack_url || "");
        setNotifyDiscordUrl(r.notify_discord_url || "");
        setNotifyPagerdutyKey(r.notify_pagerduty_key || "");
        if (r.muted_types) {
          setMutedTypes(r.muted_types.split(',').filter((t: string) => t.trim()));
        }
        if (r.alert_gpu !== undefined) setGpuAlertEnabled(r.alert_gpu);
        if (r.gpu_util_threshold) setGpuUtilThreshold(r.gpu_util_threshold);
        if (r.gpu_util_duration) setGpuUtilDuration(r.gpu_util_duration);
        if (r.gpu_temp_threshold) setGpuTempThreshold(r.gpu_temp_threshold);
        if (r.gpu_vram_threshold) setGpuVramThreshold(r.gpu_vram_threshold);
      }
    } catch { /* ignore */ }
  };

  useEffect(() => {
    loadSettings();
    loadHealth();
    loadDestinations();
    load2faStatus();
    loadPasskeys();
    loadNotifyChannels();
    api.get<{ count: number }>("/system/updates/count")
      .then((d) => setUpdateCount(d.count))
      .catch(() => {});
    api.get<ApiKey[]>("/api-keys").then(setApiKeys).catch(() => {});
    api.get<{ hostname?: string }>("/system/info")
      .then((d) => { if (d.hostname) setHostname(d.hostname); })
      .catch(() => {});
    healthTimer.current = setInterval(loadHealth, 30000);
    return () => clearInterval(healthTimer.current);
  }, []);

  // Render QR SVG safely as a data URI image (sandboxes any embedded scripts)
  useEffect(() => {
    if (qrRef.current && twoFaSetup?.qr_svg) {
      const encoded = btoa(unescape(encodeURIComponent(twoFaSetup.qr_svg)));
      qrRef.current.innerHTML = "";
      const img = document.createElement("img");
      img.src = `data:image/svg+xml;base64,${encoded}`;
      img.alt = "2FA QR Code";
      img.width = 200;
      img.height = 200;
      qrRef.current.appendChild(img);
    }
  }, [twoFaSetup?.qr_svg]);

  const saveGeneral = async () => {
    setSaving("general");
    setMessage({ text: "", type: "" });
    try {
      await api.put("/settings", { panel_name: panelName });
      setMessage({ text: "Configurações gerais salvas", type: "success" });
    } catch (e) {
      setMessage({
        text: e instanceof Error ? e.message : "Falha ao salvar configurações",
        type: "error",
      });
    } finally {
      setSaving(null);
    }
  };

  const saveSMTP = async () => {
    setSaving("smtp");
    setMessage({ text: "", type: "" });
    try {
      await api.put("/settings", {
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_username: smtpUser,
        smtp_password: smtpPass,
        smtp_from: smtpFrom,
        smtp_from_name: smtpFromName,
        smtp_encryption: smtpEncryption,
      });
      setMessage({ text: "Configurações SMTP salvas", type: "success" });
    } catch (e) {
      setMessage({
        text: e instanceof Error ? e.message : "Falha ao salvar configurações SMTP",
        type: "error",
      });
    } finally {
      setSaving(null);
    }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    setMessage({ text: "", type: "" });
    try {
      const result = await api.post<{ message: string }>("/settings/smtp/test", {});
      setMessage({ text: result.message || "Email de teste enviado!", type: "success" });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Falha no envio do email de teste", type: "error" });
    } finally {
      setTestingEmail(false);
    }
  };

  const SMTP_PRESETS: Record<string, { host: string; port: string; encryption: string }> = {
    custom: { host: "", port: "", encryption: "starttls" },
    mailgun: { host: "smtp.mailgun.org", port: "587", encryption: "starttls" },
    ses: { host: "email-smtp.us-east-1.amazonaws.com", port: "587", encryption: "starttls" },
    sendgrid: { host: "smtp.sendgrid.net", port: "587", encryption: "starttls" },
    resend: { host: "smtp.resend.com", port: "465", encryption: "tls" },
    gmail: { host: "smtp.gmail.com", port: "587", encryption: "starttls" },
    outlook: { host: "smtp-mail.outlook.com", port: "587", encryption: "starttls" },
    zoho: { host: "smtp.zoho.com", port: "465", encryption: "tls" },
  };

  const applyPreset = (provider: string) => {
    setSmtpProvider(provider);
    const preset = SMTP_PRESETS[provider];
    if (preset && provider !== "custom") {
      setSmtpHost(preset.host);
      setSmtpPort(preset.port);
      setSmtpEncryption(preset.encryption);
    }
  };

  const [tab, setTab] = useState("general");

  if (loading) {
    return (
      <div className="p-6 lg:p-8">
        <h1 className="text-sm font-medium text-dark-300 uppercase font-mono tracking-widest mb-6">Configurações</h1>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-dark-800 rounded-lg border border-dark-500 p-6 animate-pulse">
              <div className="h-5 bg-dark-700 rounded w-40 mb-4" />
              <div className="h-10 bg-dark-700 rounded w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Configurações</h1>
          <p className="page-header-subtitle">Gerencie a configuração do painel</p>
        </div>
      </div>

      <div className="p-6 lg:p-8">
      <div className="flex gap-1 mb-6 border-b border-dark-600 pb-1 overflow-x-auto">
        {[
          { id: "general", label: "Geral" },
          { id: "email", label: "Email" },
          { id: "account", label: "Conta" },
          { id: "channels", label: "Canais de Alerta" },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap shrink-0 ${
              tab === t.id ? "text-rust-400 border-b-2 border-rust-400" : "text-dark-300 hover:text-dark-100"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {message.text && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm border ${
            message.type === "success"
              ? "bg-rust-500/10 text-rust-400 border-rust-500/20"
              : "bg-danger-500/10 text-danger-400 border-danger-500/20"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Inline confirmation bar */}
      {pendingConfirm && (
        <div className={`mb-4 px-4 py-3 rounded-lg border flex items-center justify-between ${
          ["revoke_sessions", "revoke_key", "delete_destination"].includes(pendingConfirm.type) ? "border-danger-500/30 bg-danger-500/5" : "border-warn-500/30 bg-warn-500/5"
        }`}>
          <span className={`text-xs font-mono ${["revoke_sessions", "revoke_key", "delete_destination"].includes(pendingConfirm.type) ? "text-danger-400" : "text-warn-400"}`}>
            {pendingConfirm.label}
          </span>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button onClick={executeConfirm} className="px-3 py-1.5 bg-danger-500 text-white text-xs font-bold uppercase tracking-wider hover:bg-danger-400 transition-colors">
              Confirmar
            </button>
            <button onClick={() => setPendingConfirm(null)} className="px-3 py-1.5 bg-dark-600 text-dark-200 text-xs font-bold uppercase tracking-wider hover:bg-dark-500 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {/* General Settings */}
        {tab === "general" && (<>
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Configurações Gerais</h3>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label htmlFor="panel_name" className="block text-sm font-medium text-dark-100 mb-1">Nome do Painel</label>
              <input
                id="panel_name"
                type="text"
                value={panelName}
                onChange={(e) => setPanelName(e.target.value)}
                className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                placeholder="AxiaPanel"
              />
            </div>
            <div className="flex justify-end">
              <button
                onClick={saveGeneral}
                disabled={saving === "general"}
                className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50"
              >
                {saving === "general" ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>

        {/* Auto-Healing — part of General tab */}
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Auto-Healing</h3>
            <p className="text-xs text-dark-200 mt-0.5">Corrige automaticamente problemas comuns quando detectados</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-100">Habilitar auto-healing</p>
                <p className="text-xs text-dark-300 mt-0.5">
                  Reinicia serviços travados, limpa logs quando o disco está cheio, renova certificados SSL próximos do vencimento
                </p>
              </div>
              <button
                onClick={async () => {
                  const newVal = !autoHealEnabled;
                  try {
                    await api.put("/settings", { auto_heal_enabled: newVal ? "true" : "false" });
                    setAutoHealEnabled(newVal);
                    setMessage({ text: `Auto-healing ${newVal ? "habilitado" : "desabilitado"}`, type: "success" });
                  } catch (e) {
                    setMessage({ text: e instanceof Error ? e.message : "Falha", type: "error" });
                  }
                }}
                role="switch"
                aria-checked={autoHealEnabled}
                aria-label="Habilitar auto-healing"
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoHealEnabled ? "bg-rust-500" : "bg-dark-600"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoHealEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
            {autoHealEnabled && (
              <div className="text-xs text-dark-300 space-y-1 pl-4 border-l-2 border-dark-600">
                <p>Serviços travados são reiniciados (no máximo 1x a cada 10 minutos)</p>
                <p>Logs são limpos quando o disco passa de 90% (no máximo 1x por hora)</p>
                <p>Certificados SSL são renovados conforme o cronograma ACME Renewal Information (ARI) da CA, ou um fallback baseado no perfil (2d para shortlived, 15d para tlsserver, 30d para classic). No máximo 1x a cada 6 horas por domínio.</p>
                <p>Todas as ações são registradas na página Audit Log</p>
              </div>
            )}
          </div>
        </div>

        {/* Reverse Proxy — Traefik option */}
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Reverse Proxy</h3>
            <p className="text-xs text-dark-200 mt-0.5">Escolha nginx ou Traefik para o roteamento de apps Docker</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-4">
              <button
                onClick={async () => {
                  if (reverseProxy === "traefik") {
                    setPendingConfirm({ type: "traefik_uninstall", label: "Voltar para nginx? Apps Docker existentes com domínios precisarão de novo deploy." });
                  }
                }}
                className={`flex-1 px-4 py-3 rounded-lg border text-sm font-mono text-center transition-colors ${reverseProxy === "nginx" ? "border-rust-500 bg-rust-500/10 text-rust-400" : "border-dark-600 bg-dark-900 text-dark-300 hover:border-dark-400 cursor-pointer"}`}
              >
                <div className="font-bold">nginx</div>
                <div className="text-xs text-dark-400 mt-1">Padrão, serve PHP/estáticos + proxy</div>
              </button>
              <button
                onClick={() => {
                  if (reverseProxy === "nginx") {
                    setShowTraefikEmail(true);
                    setTraefikEmail("admin@example.com");
                  }
                }}
                disabled={traefikInstalling || showTraefikEmail}
                className={`flex-1 px-4 py-3 rounded-lg border text-sm font-mono text-center transition-colors ${reverseProxy === "traefik" ? "border-rust-500 bg-rust-500/10 text-rust-400" : "border-dark-600 bg-dark-900 text-dark-300 hover:border-dark-400 cursor-pointer"} disabled:opacity-50`}
              >
                <div className="font-bold">{traefikInstalling ? "Instalando..." : "Traefik"}</div>
                <div className="text-xs text-dark-400 mt-1">Docker-native, SSL automático, dashboard</div>
              </button>
            </div>
            {showTraefikEmail && (
              <div className="flex items-center gap-2 mt-3 px-1">
                <label className="text-xs text-dark-300">Email ACME para Let's Encrypt:</label>
                <input
                  type="email"
                  value={traefikEmail}
                  onChange={(e) => setTraefikEmail(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter") {
                      if (!traefikEmail.includes("@") || !traefikEmail.includes(".")) { setMessage({ text: "Email inválido", type: "error" }); return; }
                      setShowTraefikEmail(false);
                      setTraefikInstalling(true);
                      try {
                        await api.post("/traefik/install", { acme_email: traefikEmail });
                        setReverseProxy("traefik");
                        setMessage({ text: "Traefik instalado e ativo", type: "success" });
                      } catch (err) { setMessage({ text: err instanceof Error ? err.message : "Falha", type: "error" }); }
                      finally { setTraefikInstalling(false); }
                    }
                    if (e.key === "Escape") setShowTraefikEmail(false);
                  }}
                  autoFocus
                  className="flex-1 px-3 py-1.5 bg-dark-900 border border-dark-500 rounded text-sm text-dark-100"
                  placeholder="you@example.com"
                />
                <button
                  onClick={async () => {
                    if (!traefikEmail.includes("@") || !traefikEmail.includes(".")) { setMessage({ text: "Invalid email address", type: "error" }); return; }
                    setShowTraefikEmail(false);
                    setTraefikInstalling(true);
                    try {
                      await api.post("/traefik/install", { acme_email: traefikEmail });
                      setReverseProxy("traefik");
                      setMessage({ text: "Traefik installed and active", type: "success" });
                    } catch (err) { setMessage({ text: err instanceof Error ? err.message : "Falha", type: "error" }); }
                    finally { setTraefikInstalling(false); }
                  }}
                  className="px-3 py-1.5 bg-rust-500 text-white rounded text-xs font-medium"
                >Instalar</button>
                <button onClick={() => setShowTraefikEmail(false)} className="px-3 py-1.5 bg-dark-600 text-dark-200 rounded text-xs font-medium">Cancelar</button>
              </div>
            )}
            {reverseProxy === "traefik" && (
              <div className="text-xs text-dark-300 space-y-1 pl-4 border-l-2 border-rust-500/30">
                <p>Traefik faz o roteamento de apps Docker via labels de container</p>
                <p>SSL automático via Let's Encrypt (sem provisionamento manual de cert)</p>
                <p>Dashboard: <a href="http://127.0.0.1:8080" target="_blank" rel="noreferrer" className="text-rust-400 hover:text-rust-300">http://127.0.0.1:8080</a></p>
                <p>Sites (PHP/estáticos) continuam usando nginx</p>
              </div>
            )}
          </div>
        </div>

        {/* Public Status Page — part of General tab */}
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Página de Status Pública</h3>
            <p className="text-xs text-dark-200 mt-0.5">Compartilhe o status dos monitores publicamente em /api/status-page</p>
          </div>
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-100">Habilitar página de status pública</p>
                <p className="text-xs text-dark-300 mt-0.5">
                  Expõe o status de todos os monitores habilitados (apenas nome + status, sem URLs) em um endpoint JSON público
                </p>
              </div>
              <button
                onClick={async () => {
                  const newVal = settings.status_page_enabled !== "true";
                  try {
                    await api.put("/settings", { status_page_enabled: newVal ? "true" : "false" });
                    setSettings({ ...settings, status_page_enabled: newVal ? "true" : "false" });
                    setMessage({ text: `Página de status ${newVal ? "habilitada" : "desabilitada"}`, type: "success" });
                  } catch (e) {
                    setMessage({ text: e instanceof Error ? e.message : "Falha", type: "error" });
                  }
                }}
                role="switch"
                aria-checked={settings.status_page_enabled === "true"}
                aria-label="Habilitar página de status pública"
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.status_page_enabled === "true" ? "bg-rust-500" : "bg-dark-600"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.status_page_enabled === "true" ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          </div>
        </div>

        {/* Feature #1: Timezone */}
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Fuso Horário</h3>
          </div>
          <div className="p-5">
            <select value={settings.timezone || "UTC"} onChange={async (e) => {
              try {
                await api.put("/settings", { timezone: e.target.value });
                setSettings({ ...settings, timezone: e.target.value });
                setMessage({ text: "Fuso horário atualizado", type: "success" });
              } catch (err) { setMessage({ text: err instanceof Error ? err.message : "Falha", type: "error" }); }
            }} className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none">
              {["UTC", "America/New_York", "America/Chicago", "America/Denver", "America/Los_Angeles",
                "Europe/London", "Europe/Paris", "Europe/Berlin", "Europe/Bucharest", "Europe/Moscow",
                "Asia/Tokyo", "Asia/Shanghai", "Asia/Kolkata", "Asia/Dubai",
                "Australia/Sydney", "Pacific/Auckland"].map(tz => (
                <option key={tz} value={tz}>{tz}</option>
              ))}
            </select>
            <p className="text-xs text-dark-300 mt-1">Afeta os timestamps exibidos em todo o painel</p>
          </div>
        </div>

        {/* Feature #2: Branding */}
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Marca</h3>
          </div>
          <div className="p-5 space-y-3">
            <div>
              <label className="block text-sm font-medium text-dark-100 mb-1">URL do Logo</label>
              <input type="url" value={settings.logo_url || ""} onChange={e => setSettings({ ...settings, logo_url: e.target.value })}
                placeholder="https://example.com/logo.png" className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none" />
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-100 mb-1">Cor de Destaque</label>
              <div className="flex gap-2">
                {["#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#ef4444"].map(color => (
                  <button key={color} onClick={() => setSettings({ ...settings, accent_color: color })}
                    className={`w-8 h-8 rounded-full border-2 ${settings.accent_color === color ? "border-white" : "border-transparent"}`}
                    style={{ backgroundColor: color }} />
                ))}
              </div>
            </div>
            <button onClick={async () => {
              try {
                await api.put("/settings", { logo_url: settings.logo_url || "", accent_color: settings.accent_color || "" });
                setMessage({ text: "Marca salva", type: "success" });
              } catch (err) { setMessage({ text: err instanceof Error ? err.message : "Falha", type: "error" }); }
            }} className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50">Salvar Marca</button>
          </div>
        </div>

        {/* Feature #5: Configuration Backup */}
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Backup de Configuração</h3>
          </div>
          <div className="p-5 flex gap-3">
            <button onClick={async () => {
              try {
                const data = await api.get<ExportConfig>("/settings/export");
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a"); a.href = url; a.download = "axiapanel-config.json"; a.click();
                URL.revokeObjectURL(url);
              } catch (err) { setMessage({ text: err instanceof Error ? err.message : "Falha ao exportar", type: "error" }); }
            }} className="px-4 py-2 bg-dark-700 text-dark-100 rounded-lg text-sm font-medium hover:bg-dark-600">Exportar Config</button>
            <label className="px-4 py-2 bg-dark-700 text-dark-100 rounded-lg text-sm font-medium hover:bg-dark-600 cursor-pointer">
              Importar Config
              <input type="file" accept=".json" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const text = await file.text();
                try {
                  const data = JSON.parse(text);
                  setPendingConfirm({
                    type: "import_config",
                    label: `Importar ${Object.keys(data.settings || {}).length} configurações? Isso sobrescreverá os valores atuais.`,
                    data: { config: data }
                  });
                } catch { setMessage({ text: "Arquivo de configuração inválido", type: "error" }); }
                e.target.value = "";
              }} />
            </label>
          </div>
        </div>

        {/* Feature #9: Disk Cleanup */}
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Limpeza de Disco</h3>
          </div>
          <div className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-dark-100">Liberar espaço em disco</p>
              <p className="text-xs text-dark-300 mt-0.5">Limpa cache do apt, logs antigos, arquivos temporários, imagens Docker órfãs</p>
            </div>
            <button onClick={async () => {
              try {
                const result = await api.post<CleanupResult>("/system/cleanup");
                setMessage({ text: `Limpo: ${result.cleaned?.join(", ") || "concluído"}`, type: "success" });
              } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Falha", type: "error" }); }
            }} className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600">Limpar</button>
          </div>
        </div>

        {/* Feature #10: Hostname */}
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Hostname do Servidor</h3>
          </div>
          <div className="p-5">
            <div className="flex gap-2">
              <input type="text" value={hostname} onChange={e => setHostname(e.target.value)}
                placeholder="server.example.com" className="flex-1 px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 outline-none" />
              <button onClick={async () => {
                try {
                  await api.post("/system/hostname", { hostname });
                  setMessage({ text: "Hostname atualizado", type: "success" });
                } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Falha", type: "error" }); }
              }} className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 shrink-0">Salvar</button>
            </div>
            <p className="text-xs text-dark-300 mt-1">Apenas caracteres alfanuméricos, hífens e pontos são permitidos</p>
          </div>
        </div>

        {/* Feature #11: Theme Picker */}
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Aparência</h3>
          </div>
          <div className="p-5 space-y-6">
            {/* Layout selector */}
            <div>
              <p className="text-sm text-dark-100 mb-3">Layout</p>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { id: "command", name: "Sidebar", desc: "Menu lateral completo, navegação agrupada",
                    preview: (c: { bg: string; bar: string; accent: string; text: string }) => (
                      <div className="flex gap-1" style={{ height: "44px" }}>
                        <div style={{ background: c.bar, width: "22%", borderRadius: "2px" }} className="flex flex-col gap-0.5 p-1">
                          <div style={{ background: c.accent, height: "2px", width: "80%" }} />
                          <div style={{ background: c.text, height: "1.5px", opacity: 0.4 }} />
                          <div style={{ background: c.text, height: "1.5px", width: "70%", opacity: 0.4 }} />
                          <div style={{ background: c.text, height: "1.5px", width: "85%", opacity: 0.4 }} />
                        </div>
                        <div style={{ width: "78%" }} className="flex flex-col gap-0.5 p-0.5">
                          <div style={{ background: c.bar, height: "14px", borderRadius: "1px" }} />
                          <div style={{ background: c.bar, flex: 1, borderRadius: "1px" }} />
                        </div>
                      </div>
                    )},
                  { id: "glass", name: "Compacto", desc: "Sidebar de ícones recolhível",
                    preview: (c: { bg: string; bar: string; accent: string; text: string }) => (
                      <div className="flex gap-1" style={{ height: "44px" }}>
                        <div style={{ background: c.bar, width: "10%", borderRadius: "2px", opacity: 0.6 }} className="flex flex-col items-center gap-1.5 pt-1.5">
                          <div style={{ background: c.accent, width: "5px", height: "5px", borderRadius: "1px" }} />
                          <div style={{ background: c.text, width: "4px", height: "4px", borderRadius: "1px", opacity: 0.4 }} />
                          <div style={{ background: c.text, width: "4px", height: "4px", borderRadius: "1px", opacity: 0.4 }} />
                        </div>
                        <div style={{ width: "90%" }} className="flex flex-col gap-0.5 p-0.5">
                          <div style={{ background: c.bar, height: "14px", borderRadius: "1px" }} />
                          <div style={{ background: c.bar, flex: 1, borderRadius: "1px" }} />
                        </div>
                      </div>
                    )},
                  { id: "atlas", name: "Topbar", desc: "Navbar horizontal, trilha de navegação",
                    preview: (c: { bg: string; bar: string; accent: string; text: string }) => (
                      <div className="flex flex-col gap-0.5" style={{ height: "44px" }}>
                        <div style={{ background: c.bar, height: "10px", borderRadius: "1px" }} className="flex items-center gap-1 px-1">
                          <div style={{ background: c.accent, width: "8px", height: "3px", borderRadius: "1px" }} />
                          <div style={{ background: c.text, width: "6px", height: "2px", opacity: 0.4 }} />
                          <div style={{ background: c.text, width: "6px", height: "2px", opacity: 0.4 }} />
                          <div style={{ background: c.text, width: "6px", height: "2px", opacity: 0.4 }} />
                        </div>
                        <div style={{ background: c.bar, height: "5px", borderRadius: "1px", opacity: 0.5 }} />
                        <div style={{ background: c.bar, flex: 1, borderRadius: "1px" }} />
                      </div>
                    )},
                ] as const).map(l => {
                  const currentLayout = localStorage.getItem("dp-layout") || "command";
                  const isActive = currentLayout === l.id;
                  const accent = currentTheme === "axia" ? "#0891b2" : currentTheme === "midnight" ? "#3b82f6" : currentTheme === "arctic" ? "#0d9488" : currentTheme === "ember" ? "#f97316" : "#22c55e";
                  const bg = currentTheme === "axia" ? "#f7f9fc" : currentTheme === "arctic" ? "#f7f9fc" : currentTheme === "midnight" ? "#0a1628" : currentTheme === "ember" ? "#1a1614" : "#111113";
                  const bar = currentTheme === "axia" ? "#eaeef4" : currentTheme === "arctic" ? "#dce3ed" : currentTheme === "midnight" ? "#182d50" : currentTheme === "ember" ? "#332b26" : "#27272a";
                  const text = currentTheme === "axia" ? "#8a96aa" : currentTheme === "arctic" ? "#8d9bb0" : currentTheme === "midnight" ? "#6280a8" : currentTheme === "ember" ? "#8a7968" : "#71717a";
                  return (
                    <button key={l.id} onClick={() => {
                      localStorage.setItem("dp-layout", l.id);
                      document.documentElement.setAttribute("data-layout", l.id);
                      window.dispatchEvent(new Event("dp-layout-change"));
                    }}
                      className="text-left transition-all duration-150"
                      style={{
                        borderRadius: "8px",
                        border: isActive ? `2px solid ${accent}` : "2px solid transparent",
                        boxShadow: isActive ? `0 0 12px ${accent}33` : "none",
                      }}
                    >
                      <div style={{ background: bg, borderRadius: "6px 6px 0 0", overflow: "hidden", padding: "6px" }}>
                        {l.preview({ bg, bar, accent, text })}
                      </div>
                      <div style={{ background: bar, borderRadius: "0 0 6px 6px", padding: "6px 10px" }}>
                        <div style={{ color: isActive ? accent : text, fontSize: "12px", fontWeight: 600, fontFamily: "'Inter', sans-serif" }}>{l.name}</div>
                        <div style={{ color: text, fontSize: "10px", fontFamily: "'Inter', sans-serif", opacity: 0.7 }}>{l.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Layout options */}
            <div className="flex gap-6 text-sm">
              <label className="flex items-center gap-2 text-dark-100 cursor-pointer">
                <input type="checkbox"
                  checked={showHeader}
                  onChange={e => {
                    const val = e.target.checked;
                    setShowHeader(val);
                    localStorage.setItem("dp-show-header", val ? "true" : "false");
                    window.dispatchEvent(new Event("dp-layout-options-change"));
                  }}
                />
                Mostrar barra de cabeçalho
              </label>
              <label className="flex items-center gap-2 text-dark-100 cursor-pointer">
                <input type="checkbox"
                  checked={flatNav}
                  onChange={e => {
                    const val = e.target.checked;
                    setFlatNav(val);
                    localStorage.setItem("dp-flat-nav", val ? "true" : "false");
                    window.dispatchEvent(new Event("dp-layout-options-change"));
                  }}
                />
                Navegação plana (sem grupos)
              </label>
            </div>

            {/* Theme selector */}
            <div>
              <p className="text-sm text-dark-100 mb-3">Tema</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {([
                  { id: "axia", name: "Axia", desc: "Padrão — teal moderno, gradient mesh", bg: "#f7f9fc", sidebar: "#ffffff", accent: "#0891b2", card: "#ffffff", text: "#8a96aa", bar: "#eaeef4" },
                  { id: "terminal", name: "Terminal", desc: "Estética hacker", bg: "#111113", sidebar: "#09090b", accent: "#22c55e", card: "#18181b", text: "#71717a", bar: "#27272a" },
                  { id: "midnight", name: "Midnight", desc: "Azul-marinho, moderno", bg: "#0a1628", sidebar: "#050a18", accent: "#3b82f6", card: "#0f1f3a", text: "#6280a8", bar: "#182d50" },
                  { id: "ember", name: "Ember", desc: "Quente e premium", bg: "#1a1614", sidebar: "#0c0a09", accent: "#f97316", card: "#241f1c", text: "#8a7968", bar: "#332b26" },
                  { id: "clean-dark", name: "Clean Dark", desc: "GitHub-dark, arredondado", bg: "#161b22", sidebar: "#0d1117", accent: "#3b82f6", card: "#1c2333", text: "#636e7b", bar: "#2d333b" },
                  { id: "arctic", name: "Arctic", desc: "Teal e claro", bg: "#f7f9fc", sidebar: "#ffffff", accent: "#0d9488", card: "#edf1f7", text: "#8d9bb0", bar: "#dce3ed" },
                  { id: "clean", name: "Clean Light", desc: "SaaS moderno, azul", bg: "#f8fafc", sidebar: "#ffffff", accent: "#2563eb", card: "#f1f5f9", text: "#94a3b8", bar: "#e2e8f0" },
                ] as const).map(t => {
                  const active = currentTheme === t.id;
                  return (
                    <button key={t.id} onClick={() => {
                      localStorage.setItem("dp-theme", t.id);
                      document.documentElement.setAttribute("data-theme", t.id);
                      document.documentElement.setAttribute("data-color-scheme", (t.id === "arctic" || t.id === "clean" || t.id === "axia") ? "light" : "dark");
                      setCurrentTheme(t.id);
                    }}
                      className="group text-left transition-all duration-150"
                      style={{
                        borderRadius: "8px",
                        border: active ? `2px solid ${t.accent}` : "2px solid transparent",
                        boxShadow: active ? `0 0 12px ${t.accent}33` : "none",
                      }}
                    >
                      {/* Mini preview */}
                      <div style={{ background: t.bg, borderRadius: "6px 6px 0 0", overflow: "hidden" }} className="p-1.5">
                        <div className="flex gap-1" style={{ height: "52px" }}>
                          {/* Mini sidebar */}
                          <div style={{ background: t.sidebar, width: "20%", borderRadius: "3px" }} className="flex flex-col gap-1 p-1">
                            <div style={{ background: t.accent, height: "3px", borderRadius: "1px", width: "80%" }} />
                            <div style={{ background: t.bar, height: "2px", borderRadius: "1px" }} />
                            <div style={{ background: t.bar, height: "2px", borderRadius: "1px", width: "70%" }} />
                            <div style={{ background: t.bar, height: "2px", borderRadius: "1px", width: "85%" }} />
                          </div>
                          {/* Mini content */}
                          <div style={{ width: "80%" }} className="flex flex-col gap-1 p-1">
                            <div className="flex gap-1">
                              <div style={{ background: t.card, height: "16px", borderRadius: "2px", flex: 1 }}>
                                <div style={{ background: t.accent, height: "2px", borderRadius: "1px", width: "40%", margin: "4px" }} />
                              </div>
                              <div style={{ background: t.card, height: "16px", borderRadius: "2px", flex: 1 }}>
                                <div style={{ background: t.text, height: "2px", borderRadius: "1px", width: "60%", margin: "4px" }} />
                              </div>
                            </div>
                            <div style={{ background: t.card, flex: 1, borderRadius: "2px" }}>
                              <div style={{ background: t.text, height: "2px", borderRadius: "1px", width: "70%", margin: "4px" }} />
                              <div style={{ background: t.text, height: "2px", borderRadius: "1px", width: "50%", margin: "2px 4px" }} />
                            </div>
                          </div>
                        </div>
                      </div>
                      {/* Label */}
                      <div style={{ background: t.sidebar, borderRadius: "0 0 6px 6px", padding: "6px 10px" }}>
                        <div style={{ color: active ? t.accent : t.text, fontSize: "12px", fontWeight: 600, fontFamily: "'Inter', sans-serif" }}>{t.name}</div>
                        <div style={{ color: t.text, fontSize: "10px", fontFamily: "'Inter', sans-serif", opacity: 0.7 }}>{t.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Feature #12: Locale Selector */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-100">Idioma</p>
                <p className="text-xs text-dark-300">Mais idiomas em breve</p>
              </div>
              <select disabled className="px-2 py-1.5 border border-dark-500 rounded text-sm opacity-50">
                <option>Português (BR)</option>
              </select>
            </div>
          </div>
        </div>
        </>)}

        {/* SMTP Configuration */}
        {tab === "email" && (
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Configuração SMTP</h3>
            <p className="text-xs text-dark-200 mt-0.5">Configure o email de saída para todos os sites neste servidor</p>
          </div>
          <div className="p-5 space-y-4">
            {/* Provider Preset */}
            <div>
              <label htmlFor="smtp-provider" className="block text-sm font-medium text-dark-100 mb-1">Provedor</label>
              <select
                id="smtp-provider"
                value={smtpProvider}
                onChange={(e) => applyPreset(e.target.value)}
                className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm bg-dark-800 focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none"
              >
                <option value="custom">SMTP Personalizado</option>
                <option value="mailgun">Mailgun</option>
                <option value="ses">Amazon SES</option>
                <option value="sendgrid">SendGrid</option>
                <option value="resend">Resend</option>
                <option value="gmail">Gmail</option>
                <option value="outlook">Outlook / Microsoft 365</option>
                <option value="zoho">Zoho Mail</option>
              </select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="smtp_host" className="block text-sm font-medium text-dark-100 mb-1">Host</label>
                <input
                  id="smtp_host"
                  type="text"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none font-mono"
                  placeholder="smtp.example.com"
                />
              </div>
              <div>
                <label htmlFor="smtp_port" className="block text-sm font-medium text-dark-100 mb-1">Porta</label>
                <input
                  id="smtp_port"
                  type="text"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(e.target.value)}
                  className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none font-mono"
                  placeholder="587"
                />
              </div>
              <div>
                <label htmlFor="smtp-encryption" className="block text-sm font-medium text-dark-100 mb-1">Criptografia</label>
                <select
                  id="smtp-encryption"
                  value={smtpEncryption}
                  onChange={(e) => setSmtpEncryption(e.target.value)}
                  className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm bg-dark-800 focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none"
                >
                  <option value="starttls">STARTTLS (porta 587)</option>
                  <option value="tls">TLS/SSL (porta 465)</option>
                  <option value="none">Nenhuma (porta 25)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="smtp_user" className="block text-sm font-medium text-dark-100 mb-1">Usuário</label>
                <input
                  id="smtp_user"
                  type="text"
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                  className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none"
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label htmlFor="smtp_pass" className="block text-sm font-medium text-dark-100 mb-1">Senha</label>
                <input
                  id="smtp_pass"
                  type="password"
                  value={smtpPass}
                  onChange={(e) => setSmtpPass(e.target.value)}
                  className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none"
                  placeholder="Senha ou API key"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="smtp_from" className="block text-sm font-medium text-dark-100 mb-1">Endereço Remetente</label>
                <input
                  id="smtp_from"
                  type="text"
                  value={smtpFrom}
                  onChange={(e) => setSmtpFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none"
                  placeholder="noreply@example.com"
                />
              </div>
              <div>
                <label htmlFor="smtp_from_name" className="block text-sm font-medium text-dark-100 mb-1">Nome Remetente</label>
                <input
                  id="smtp_from_name"
                  type="text"
                  value={smtpFromName}
                  onChange={(e) => setSmtpFromName(e.target.value)}
                  className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none"
                  placeholder="AxiaPanel"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={handleTestEmail}
                disabled={testingEmail || !smtpHost}
                className="px-4 py-2 text-sm font-medium text-dark-100 bg-dark-700 rounded-lg hover:bg-dark-600 disabled:opacity-50"
              >
                {testingEmail ? "Enviando..." : "Enviar Email de Teste"}
              </button>
              <button
                onClick={saveSMTP}
                disabled={saving === "smtp"}
                className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50"
              >
                {saving === "smtp" ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>

        )}

        {/* Backup Destinations — moved to Backup Manager page */}
        {false && (
        <div className="hidden">
          <div>
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Backup Destinations</h3>
            {showDestForm ? (
              <button
                onClick={() => setShowDestForm(false)}
                className="px-3 py-1 text-dark-300 border border-dark-600 rounded-md text-xs font-medium hover:text-dark-100 hover:border-dark-400"
              >
                Cancel
              </button>
            ) : (
              <button
                onClick={() => setShowDestForm(true)}
                className="px-3 py-1 bg-rust-500 text-white rounded-md text-xs font-medium hover:bg-rust-600"
              >
                Add Destination
              </button>
            )}
          </div>
          <div className="p-5">
            {showDestForm && (
              <div className="mb-4 p-4 bg-dark-900 rounded-lg space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-dark-100 mb-1">Name</label>
                    <input type="text" value={destName} onChange={(e) => setDestName(e.target.value)} placeholder="My S3 Backup" className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-dark-100 mb-1">Type</label>
                    <select value={destType} onChange={(e) => setDestType(e.target.value)} className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm bg-dark-800 focus:ring-2 focus:ring-accent-500 outline-none">
                      <option value="s3">S3 / R2 / MinIO</option>
                      <option value="sftp">SFTP</option>
                    </select>
                  </div>
                </div>
                {destType === "s3" ? (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-dark-100 mb-1">Bucket</label>
                        <input type="text" value={destBucket} onChange={(e) => setDestBucket(e.target.value)} placeholder="my-backups" className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-dark-100 mb-1">Region</label>
                        <input type="text" value={destRegion} onChange={(e) => setDestRegion(e.target.value)} className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-dark-100 mb-1">Endpoint URL</label>
                      <input type="text" value={destEndpoint} onChange={(e) => setDestEndpoint(e.target.value)} placeholder="https://s3.amazonaws.com" className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none font-mono" />
                      <p className="text-xs text-dark-300 mt-1">For R2: https://ACCOUNT_ID.r2.cloudflarestorage.com</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-dark-100 mb-1">Access Key</label>
                        <input type="text" value={destAccessKey} onChange={(e) => setDestAccessKey(e.target.value)} className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-dark-100 mb-1">Secret Key</label>
                        <input type="password" value={destSecretKey} onChange={(e) => setDestSecretKey(e.target.value)} className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-dark-100 mb-1">Path Prefix</label>
                      <input type="text" value={destPathPrefix} onChange={(e) => setDestPathPrefix(e.target.value)} placeholder="backups" className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none" />
                    </div>
                  </>
                ) : (
                  <>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-dark-100 mb-1">Host</label>
                        <input type="text" value={destSftpHost} onChange={(e) => setDestSftpHost(e.target.value)} placeholder="backup.example.com" className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none font-mono" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-dark-100 mb-1">Port</label>
                        <input type="text" value={destSftpPort} onChange={(e) => setDestSftpPort(e.target.value)} className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none font-mono" />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-dark-100 mb-1">Username</label>
                        <input type="text" value={destSftpUser} onChange={(e) => setDestSftpUser(e.target.value)} className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-dark-100 mb-1">Password</label>
                        <input type="password" value={destSftpPass} onChange={(e) => setDestSftpPass(e.target.value)} className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none" />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-dark-100 mb-1">Remote Path</label>
                      <input type="text" value={destSftpPath} onChange={(e) => setDestSftpPath(e.target.value)} placeholder="/backups" className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none font-mono" />
                    </div>
                  </>
                )}
                <div className="flex justify-end">
                  <button
                    disabled={savingDest}
                    onClick={async () => {
                      setSavingDest(true);
                      setMessage({ text: "", type: "" });
                      try {
                        const config = destType === "s3"
                          ? { bucket: destBucket, region: destRegion, endpoint: destEndpoint, access_key: destAccessKey, secret_key: destSecretKey, path_prefix: destPathPrefix }
                          : { host: destSftpHost, port: parseInt(destSftpPort), username: destSftpUser, password: destSftpPass, remote_path: destSftpPath };
                        await api.post("/backup-destinations", { name: destName, dtype: destType, config });
                        setShowDestForm(false);
                        setDestName(""); setDestBucket(""); setDestAccessKey(""); setDestSecretKey("");
                        setDestSftpHost(""); setDestSftpUser(""); setDestSftpPass("");
                        loadDestinations();
                        setMessage({ text: "Destination created", type: "success" });
                      } catch (e) {
                        setMessage({ text: e instanceof Error ? e.message : "Failed", type: "error" });
                      } finally {
                        setSavingDest(false);
                      }
                    }}
                    className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50"
                  >
                    {savingDest ? "Saving..." : "Save Destination"}
                  </button>
                </div>
              </div>
            )}
            {destinations.length === 0 && !showDestForm ? (
              <p className="text-sm text-dark-300 text-center py-4">No backup destinations configured</p>
            ) : (
              <div className="space-y-2">
                {destinations.map((d) => (
                  <div key={d.id} className="flex items-center justify-between p-3 bg-dark-900 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-dark-50">{d.name}</p>
                      <p className="text-xs text-dark-200 font-mono">
                        {d.dtype === "s3" ? `S3: ${d.config.bucket || ""}` : `SFTP: ${d.config.host || ""}`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={async () => {
                          setTestingDest(d.id);
                          try {
                            await api.post(`/backup-destinations/${d.id}/test`);
                            setMessage({ text: `${d.name}: Connection successful`, type: "success" });
                          } catch (e) {
                            setMessage({ text: e instanceof Error ? e.message : "Test failed", type: "error" });
                          } finally {
                            setTestingDest(null);
                          }
                        }}
                        disabled={testingDest === d.id}
                        className="px-2 py-1 bg-accent-500/10 text-accent-400 rounded text-xs font-medium hover:bg-accent-500/20 disabled:opacity-50"
                      >
                        {testingDest === d.id ? "Testing..." : "Test"}
                      </button>
                      <button
                        onClick={() => setPendingConfirm({
                          type: "delete_destination",
                          label: `Delete "${d.name}"?`,
                          data: { id: d.id }
                        })}
                        className="px-2 py-1 bg-danger-500/10 text-danger-400 rounded text-xs font-medium hover:bg-danger-500/20"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        )}

        {/* Two-Factor Authentication */}
        {tab === "account" && (<>
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Autenticação de Dois Fatores</h3>
            <p className="text-xs text-dark-200 mt-0.5">Adicione uma camada extra de segurança à sua conta</p>
          </div>
          <div className="p-5">
            {twoFaEnabled ? (
              <div className="space-y-4">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-rust-500" />
                  <span className="text-sm text-rust-400 font-medium">2FA está habilitado</span>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={twoFaDisableCode}
                    onChange={(e) => setTwoFaDisableCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="Digite o código TOTP para desabilitar"
                    aria-label="Código TOTP para desabilitar 2FA"
                    className="px-3 py-2 border border-dark-500 rounded-lg text-sm w-48 focus:ring-2 focus:ring-accent-500 outline-none font-mono"
                  />
                  <button
                    disabled={twoFaLoading || twoFaDisableCode.length < 6}
                    onClick={async () => {
                      setTwoFaLoading(true);
                      setMessage({ text: "", type: "" });
                      try {
                        await api.post("/auth/2fa/disable", { code: twoFaDisableCode });
                        setTwoFaEnabled(false);
                        setTwoFaDisableCode("");
                        setMessage({ text: "2FA desabilitado", type: "success" });
                      } catch (e) {
                        setMessage({ text: e instanceof Error ? e.message : "Falha", type: "error" });
                      } finally {
                        setTwoFaLoading(false);
                      }
                    }}
                    className="px-4 py-2 bg-danger-500/20 text-danger-400 rounded-lg text-sm font-medium hover:bg-danger-500/30 disabled:opacity-50"
                  >
                    Desabilitar 2FA
                  </button>
                </div>
              </div>
            ) : twoFaSetup ? (
              <div className="space-y-4">
                <p className="text-sm text-dark-100">Escaneie este QR code com seu aplicativo autenticador:</p>
                <div ref={qrRef} className="flex justify-center bg-white rounded-lg p-4 w-fit mx-auto" />
                <p className="text-xs text-dark-300 text-center font-mono break-all">
                  Entrada manual: {twoFaSetup.secret}
                </p>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={twoFaCode}
                    onChange={(e) => setTwoFaCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                    placeholder="Digite o código de 6 dígitos"
                    aria-label="Código de verificação TOTP"
                    className="px-3 py-2 border border-dark-500 rounded-lg text-sm w-48 focus:ring-2 focus:ring-accent-500 outline-none font-mono"
                    autoFocus
                  />
                  <button
                    disabled={twoFaLoading || twoFaCode.length < 6}
                    onClick={async () => {
                      setTwoFaLoading(true);
                      setMessage({ text: "", type: "" });
                      try {
                        const res = await api.post<{ recovery_codes: string[] }>("/auth/2fa/enable", { code: twoFaCode });
                        setTwoFaEnabled(true);
                        setTwoFaSetup(null);
                        setTwoFaCode("");
                        setRecoveryCodes(res.recovery_codes);
                        setMessage({ text: "2FA habilitado! Salve seus códigos de recuperação.", type: "success" });
                      } catch (e) {
                        setMessage({ text: e instanceof Error ? e.message : "Código inválido", type: "error" });
                      } finally {
                        setTwoFaLoading(false);
                      }
                    }}
                    className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50"
                  >
                    Verificar e Habilitar
                  </button>
                  <button
                    onClick={() => { setTwoFaSetup(null); setTwoFaCode(""); }}
                    className="px-4 py-2 text-dark-300 border border-dark-600 rounded-lg text-sm font-medium hover:text-dark-100 hover:border-dark-400"
                  >
                    Cancelar
                  </button>
                </div>
                {recoveryCodes.length > 0 && (
                  <div className="mt-4 p-4 bg-warn-500/10 rounded-lg border border-warn-500/20">
                    <p className="text-sm font-medium text-warn-400 mb-2">Códigos de Recuperação (salve-os!)</p>
                    <div className="grid grid-cols-2 gap-1">
                      {recoveryCodes.map((code, i) => (
                        <code key={i} className="text-xs text-dark-100 font-mono bg-dark-900 px-2 py-1 rounded">{code}</code>
                      ))}
                    </div>
                    <p className="text-xs text-dark-300 mt-2">Cada código só pode ser usado uma vez. Armazene-os com segurança.</p>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-dark-200">
                  Proteja sua conta com senhas únicas baseadas em tempo (TOTP).
                  Funciona com Google Authenticator, Authy, 1Password, etc.
                </p>
                <button
                  disabled={twoFaLoading}
                  onClick={async () => {
                    setTwoFaLoading(true);
                    setMessage({ text: "", type: "" });
                    try {
                      const res = await api.post<{ secret: string; qr_svg: string }>("/auth/2fa/setup");
                      setTwoFaSetup(res);
                    } catch (e) {
                      setMessage({ text: e instanceof Error ? e.message : "Falha", type: "error" });
                    } finally {
                      setTwoFaLoading(false);
                    }
                  }}
                  className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50"
                >
                  {twoFaLoading ? "Configurando..." : "Habilitar 2FA"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* 2FA Enforcement (admin only) */}
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden mt-4">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Imposição de 2FA</h3>
          </div>
          <div className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-dark-100">Exigir 2FA para todos os usuários</p>
              <p className="text-xs text-dark-300 mt-0.5">Usuários sem 2FA verão um aviso em todas as páginas</p>
            </div>
            <button
              onClick={async () => {
                const newVal = settings.enforce_2fa !== "true";
                try {
                  await api.put("/settings", { enforce_2fa: newVal ? "true" : "false" });
                  setSettings({ ...settings, enforce_2fa: newVal ? "true" : "false" });
                  setMessage({ text: `Imposição de 2FA ${newVal ? "habilitada" : "desabilitada"}`, type: "success" });
                } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Falha", type: "error" }); }
              }}
              className={`relative w-11 h-6 rounded-full transition-colors ${settings.enforce_2fa === "true" ? "bg-rust-500" : "bg-dark-600"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${settings.enforce_2fa === "true" ? "translate-x-5" : ""}`} />
            </button>
          </div>
        </div>

        {/* Passkeys / WebAuthn */}
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden mt-4">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Passkeys</h3>
            <p className="text-xs text-dark-200 mt-0.5">Login sem senha com biometria ou chaves de segurança</p>
          </div>
          <div className="p-5">
            {!passkeySupported ? (
              <p className="text-sm text-dark-300">Seu navegador não suporta WebAuthn/Passkeys.</p>
            ) : (
              <div className="space-y-4">
                {/* Existing passkeys list */}
                {passkeys.length > 0 && (
                  <div className="space-y-2">
                    {passkeys.map((pk) => (
                      <div key={pk.id} className="flex items-center justify-between px-3 py-2 bg-dark-700 rounded-lg border border-dark-600">
                        <div className="flex items-center gap-3">
                          <svg className="w-4 h-4 text-rust-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M2 18v3c0 .6.4 1 1 1h4v-3h3v-3h2l1.4-1.4a6.5 6.5 0 1 0-4-4Z" />
                            <circle cx="16.5" cy="7.5" r=".5" fill="currentColor" />
                          </svg>
                          <div>
                            <p className="text-sm text-dark-100">{pk.name}</p>
                            <p className="text-xs text-dark-400">Adicionado em {new Date(pk.created_at).toLocaleDateString()}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-3">
                          {renamingPasskey === pk.id ? (
                            <span className="inline-flex items-center gap-1">
                              <input
                                type="text"
                                value={passkeyRenameValue}
                                onChange={(e) => setPasskeyRenameValue(e.target.value)}
                                onKeyDown={async (e) => {
                                  if (e.key === "Enter" && passkeyRenameValue && passkeyRenameValue !== pk.name) {
                                    try {
                                      await api.put(`/auth/passkeys/${pk.id}`, { name: passkeyRenameValue });
                                      setPasskeys(prev => prev.map(p => p.id === pk.id ? { ...p, name: passkeyRenameValue } : p));
                                      setMessage({ text: "Passkey renomeado", type: "success" });
                                    } catch (err) { setMessage({ text: err instanceof Error ? err.message : "Falha", type: "error" }); }
                                    setRenamingPasskey(null);
                                  }
                                  if (e.key === "Escape") setRenamingPasskey(null);
                                }}
                                autoFocus
                                className="w-28 px-2 py-0.5 bg-dark-900 border border-dark-500 rounded text-xs text-dark-100"
                              />
                              <button
                                onClick={async () => {
                                  if (!passkeyRenameValue || passkeyRenameValue === pk.name) { setRenamingPasskey(null); return; }
                                  try {
                                    await api.put(`/auth/passkeys/${pk.id}`, { name: passkeyRenameValue });
                                    setPasskeys(prev => prev.map(p => p.id === pk.id ? { ...p, name: passkeyRenameValue } : p));
                                    setMessage({ text: "Passkey renamed", type: "success" });
                                  } catch (err) { setMessage({ text: err instanceof Error ? err.message : "Falha", type: "error" }); }
                                  setRenamingPasskey(null);
                                }}
                                className="px-1.5 py-0.5 bg-rust-500 text-white rounded text-[10px] font-medium"
                              >Salvar</button>
                              <button onClick={() => setRenamingPasskey(null)} className="px-1.5 py-0.5 bg-dark-600 text-dark-200 rounded text-[10px]">Cancelar</button>
                            </span>
                          ) : (
                            <button
                              onClick={() => { setRenamingPasskey(pk.id); setPasskeyRenameValue(pk.name); }}
                              className="text-xs text-accent-400 hover:text-accent-300"
                            >
                              Renomear
                          </button>
                          )}
                          <button
                            onClick={async () => {
                              try {
                                await api.delete(`/auth/passkeys/${pk.id}`);
                                setPasskeys(prev => prev.filter(p => p.id !== pk.id));
                                setMessage({ text: "Passkey removido", type: "success" });
                              } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Falha", type: "error" }); }
                            }}
                            className="text-xs text-danger-400 hover:text-danger-300"
                          >
                            Remover
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Add new passkey */}
                {passkeys.length < 10 && (
                  <div className="flex items-end gap-3">
                    <div className="flex-1">
                      <label className="block text-xs text-dark-300 mb-1">Nome do passkey</label>
                      <input
                        type="text"
                        value={passkeyName}
                        onChange={e => setPasskeyName(e.target.value)}
                        className="w-full px-3 py-2 text-sm border border-dark-500 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none"
                        placeholder="Meu Passkey"
                      />
                    </div>
                    <button
                      disabled={passkeyLoading}
                      onClick={async () => {
                        setPasskeyLoading(true);
                        try {
                          // 1. Begin registration
                          const beginData = await api.post<{ publicKey: WebAuthnPublicKeyOptions }>("/auth/passkey/register/begin", {});
                          const publicKey = beginData.publicKey;

                          // 2. Convert base64url to ArrayBuffer
                          const b64toBuf = (b64: string) => {
                            const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
                            const raw = atob((b64 + pad).replace(/-/g, "+").replace(/_/g, "/"));
                            const arr = new Uint8Array(raw.length);
                            for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
                            return arr.buffer;
                          };
                          const bufTo64 = (buf: ArrayBuffer) => {
                            const arr = new Uint8Array(buf);
                            let bin = "";
                            for (let i = 0; i < arr.length; i++) bin += String.fromCharCode(arr[i]);
                            return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
                          };

                          publicKey.challenge = b64toBuf(publicKey.challenge as string);
                          publicKey.user.id = b64toBuf(publicKey.user.id as string);
                          if (publicKey.excludeCredentials) {
                            publicKey.excludeCredentials = (publicKey.excludeCredentials as { id: string; type: string }[]).map((c) => ({
                              ...c, id: b64toBuf(c.id),
                            }));
                          }

                          // 3. Create credential via browser
                          const credential = await navigator.credentials.create({ publicKey: publicKey as unknown as PublicKeyCredentialCreationOptions }) as PublicKeyCredential;
                          const attestation = credential.response as AuthenticatorAttestationResponse;

                          // 4. Get transports
                          const transports = "getTransports" in attestation && typeof (attestation as AuthenticatorAttestationResponse & { getTransports?: () => string[] }).getTransports === "function"
                            ? (attestation as AuthenticatorAttestationResponse & { getTransports: () => string[] }).getTransports() : undefined;

                          // 5. Complete registration
                          await api.post("/auth/passkey/register/complete", {
                            id: credential.id,
                            rawId: bufTo64(credential.rawId),
                            response: {
                              attestationObject: bufTo64(attestation.attestationObject),
                              clientDataJson: bufTo64(attestation.clientDataJSON),
                            },
                            name: passkeyName || "Meu Passkey",
                            transports,
                          });

                          setMessage({ text: "Passkey registrado!", type: "success" });
                          setPasskeyName("Meu Passkey");
                          loadPasskeys();
                        } catch (e) {
                          if (e instanceof DOMException && e.name === "NotAllowedError") {
                            // User cancelled — ignore
                          } else {
                            setMessage({ text: e instanceof Error ? e.message : "Falha ao registrar passkey", type: "error" });
                          }
                        } finally {
                          setPasskeyLoading(false);
                        }
                      }}
                      className="px-4 py-2 text-sm bg-rust-500 text-white rounded-lg hover:bg-rust-600 disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      {passkeyLoading ? "Registrando..." : "Adicionar Passkey"}
                    </button>
                  </div>
                )}

                {passkeys.length === 0 && (
                  <p className="text-xs text-dark-400">Nenhum passkey registrado. Adicione um para habilitar login sem senha.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* SSH Keys — Security tab */}
        <SSHKeys />

        {/* Auto-Updates — Security tab */}
        <AutoUpdates />

        {/* IP Whitelist — Security tab */}
        <IPWhitelist />

        {/* Feature #6: Password Change */}
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden mt-4">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Alterar Senha</h3>
          </div>
          <div className="p-5 space-y-3">
            <input type="password" value={currentPass} onChange={e => setCurrentPass(e.target.value)} placeholder="Senha atual"
              className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none" />
            <input type="password" value={newPass} onChange={e => setNewPass(e.target.value)} placeholder="Nova senha (mín. 8 caracteres)"
              className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none" />
            <input type="password" value={confirmPass} onChange={e => setConfirmPass(e.target.value)} placeholder="Confirmar nova senha"
              className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none" />
            <button disabled={!currentPass || !newPass || newPass !== confirmPass || newPass.length < 8} onClick={async () => {
              try {
                await api.post("/auth/change-password", { current_password: currentPass, new_password: newPass });
                setMessage({ text: "Senha alterada com sucesso", type: "success" });
                setCurrentPass(""); setNewPass(""); setConfirmPass("");
              } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Falha", type: "error" }); }
            }} className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50">
              Alterar Senha
            </button>
          </div>
        </div>

        {/* Feature #3: Session Management */}
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden mt-4">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Sessões</h3>
          </div>
          <div className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-dark-100">Sessões Ativas</p>
              <p className="text-xs text-dark-300 mt-0.5">Forçar todos os usuários a fazer login novamente</p>
            </div>
            <button onClick={() => setPendingConfirm({ type: "revoke_sessions", label: "Revogar todas as sessões? Todos os usuários (incluindo você) serão deslogados." })}
              className="px-3 py-1.5 bg-danger-500/10 text-danger-400 rounded text-xs font-medium hover:bg-danger-500/20">Revogar Todas as Sessões</button>
          </div>
        </div>

        {/* Feature #4: API Key Management */}
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden mt-4">
          <div className="px-5 py-3 border-b border-dark-600 flex justify-between items-center">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">API Keys</h3>
            <button onClick={() => setShowNewKey(!showNewKey)} className="text-xs text-rust-400 hover:text-rust-300">
              {showNewKey ? "Cancelar" : "+ Criar Key"}
            </button>
          </div>
          {showNewKey && (
            <div className="px-5 py-3 border-b border-dark-600 flex gap-2">
              <input value={newKeyName} onChange={e => setNewKeyName(e.target.value)} placeholder="Nome da key"
                className="flex-1 px-3 py-1.5 border border-dark-500 rounded text-sm focus:ring-2 focus:ring-accent-500 outline-none" />
              <button onClick={async () => {
                try {
                  const result = await api.post<{ key: string }>("/api-keys", { name: newKeyName || "API Key" });
                  setNewKeyResult(result.key);
                  setNewKeyName("");
                  setShowNewKey(false);
                  api.get<ApiKey[]>("/api-keys").then(setApiKeys).catch(() => {});
                } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Falha", type: "error" }); }
              }} className="px-3 py-1.5 bg-rust-500 text-white rounded text-xs font-medium hover:bg-rust-600">Criar</button>
            </div>
          )}
          {newKeyResult && (
            <div className="px-5 py-3 border-b border-dark-600 bg-rust-500/5">
              <p className="text-xs text-rust-400 mb-1">Copie esta key agora — ela não será mostrada novamente:</p>
              <div className="flex gap-2">
                <code className="flex-1 px-2 py-1 bg-dark-900 rounded text-xs font-mono text-dark-100 break-all">{newKeyResult}</code>
                <button onClick={() => { navigator.clipboard.writeText(newKeyResult); setNewKeyResult(null); }} className="px-2 py-1 bg-dark-700 rounded text-xs text-dark-200 shrink-0">Copiar</button>
              </div>
            </div>
          )}
          <div className="divide-y divide-dark-600">
            {apiKeys.map((k) => (
              <div key={k.id} className="px-5 py-2.5 flex items-center justify-between text-xs">
                <div>
                  <span className="text-dark-100">{k.name}</span>
                  <span className="text-dark-400 ml-2">Criada em {new Date(k.created_at).toLocaleDateString()}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={async () => {
                    try {
                      const r = await api.post<{ key: string }>(`/api-keys/${k.id}/rotate`);
                      setNewKeyResult(r.key);
                      api.get<ApiKey[]>("/api-keys").then(setApiKeys).catch(() => {});
                    } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Falha", type: "error" }); }
                  }} className="text-dark-300 hover:text-dark-100">Girar</button>
                  <button onClick={() => setPendingConfirm({
                    type: "revoke_key",
                    label: "Revogar esta API key?",
                    data: { id: k.id }
                  })} className="text-danger-400 hover:text-danger-300">Revogar</button>
                </div>
              </div>
            ))}
            {apiKeys.length === 0 && <p className="px-5 py-3 text-xs text-dark-300">Nenhuma API key criada</p>}
          </div>
        </div>

        {/* Security Hardening Settings (admin only) */}
        {user?.role === "admin" && (
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden mt-4">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Hardening de Segurança</h3>
            <p className="text-xs text-dark-200 mt-0.5">Recursos de segurança pós-incidente</p>
          </div>
          <div className="divide-y divide-dark-700">
            {/* Self-Registration */}
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-100">Auto-Registro</p>
                <p className="text-xs text-dark-400">Permitir que novos usuários se cadastrem</p>
              </div>
              <button onClick={async () => {
                const current = settings.self_registration_enabled === "true";
                const newVal = !current;
                try {
                  await api.put("/settings", { self_registration_enabled: newVal ? "true" : "false" });
                  setSettings(prev => ({ ...prev, self_registration_enabled: newVal ? "true" : "false" }));
                  setMessage({ text: `Cadastro ${newVal ? "habilitado" : "desabilitado"}`, type: "success" });
                } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Falha", type: "error" }); }
              }} className={`relative w-11 h-6 rounded-full transition-colors ${settings.self_registration_enabled === "true" ? "bg-rust-500" : "bg-dark-600"}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${settings.self_registration_enabled === "true" ? "translate-x-5.5 left-0.5" : "left-0.5"}`} />
              </button>
            </div>
            {/* Registration Approval */}
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-100">Exigir Aprovação para Novos Usuários</p>
                <p className="text-xs text-dark-400">Novos cadastros precisam de aprovação do admin antes do login</p>
              </div>
              <button onClick={async () => {
                const current = settings.security_approval_required === "true";
                const newVal = !current;
                try {
                  await api.put("/settings", { security_approval_required: newVal ? "true" : "false" });
                  setSettings(prev => ({ ...prev, security_approval_required: newVal ? "true" : "false" }));
                  setMessage({ text: `Modo aprovação ${newVal ? "habilitado" : "desabilitado"}`, type: "success" });
                } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Falha", type: "error" }); }
              }} className={`relative w-11 h-6 rounded-full transition-colors ${settings.security_approval_required === "true" ? "bg-rust-500" : "bg-dark-600"}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${settings.security_approval_required === "true" ? "translate-x-5.5 left-0.5" : "left-0.5"}`} />
              </button>
            </div>
            {/* Geo-IP Alerts */}
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-100">Alertas de Login por Geo-IP</p>
                <p className="text-xs text-dark-400">Alertar quando houver login de IPs novos, VPNs ou datacenters</p>
              </div>
              <button onClick={async () => {
                const current = settings.security_geo_alert_enabled !== "false";
                const newVal = !current;
                try {
                  await api.put("/settings", { security_geo_alert_enabled: newVal ? "true" : "false" });
                  setSettings(prev => ({ ...prev, security_geo_alert_enabled: newVal ? "true" : "false" }));
                  setMessage({ text: `Alertas Geo-IP ${newVal ? "habilitados" : "desabilitados"}`, type: "success" });
                } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Falha", type: "error" }); }
              }} className={`relative w-11 h-6 rounded-full transition-colors ${settings.security_geo_alert_enabled !== "false" ? "bg-rust-500" : "bg-dark-600"}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${settings.security_geo_alert_enabled !== "false" ? "translate-x-5.5 left-0.5" : "left-0.5"}`} />
              </button>
            </div>
            {/* Session Recording */}
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-100">Gravação de Sessões de Terminal</p>
                <p className="text-xs text-dark-400">Gravar todas as sessões de terminal para análise forense</p>
              </div>
              <button onClick={async () => {
                const current = settings.security_session_recording !== "false";
                const newVal = !current;
                try {
                  await api.put("/settings", { security_session_recording: newVal ? "true" : "false" });
                  setSettings(prev => ({ ...prev, security_session_recording: newVal ? "true" : "false" }));
                  setMessage({ text: `Gravação de sessões ${newVal ? "habilitada" : "desabilitada"}`, type: "success" });
                } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Falha", type: "error" }); }
              }} className={`relative w-11 h-6 rounded-full transition-colors ${settings.security_session_recording !== "false" ? "bg-rust-500" : "bg-dark-600"}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${settings.security_session_recording !== "false" ? "translate-x-5.5 left-0.5" : "left-0.5"}`} />
              </button>
            </div>
            {/* DB Auto-Backup */}
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-100">Backup Automático do Banco do Painel</p>
                <p className="text-xs text-dark-400">Backup diário do PostgreSQL com retenção de 7 dias</p>
              </div>
              <button onClick={async () => {
                const current = settings.security_db_backup_enabled !== "false";
                const newVal = !current;
                try {
                  await api.put("/settings", { security_db_backup_enabled: newVal ? "true" : "false" });
                  setSettings(prev => ({ ...prev, security_db_backup_enabled: newVal ? "true" : "false" }));
                  setMessage({ text: `Backup automático do DB ${newVal ? "habilitado" : "desabilitado"}`, type: "success" });
                } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Falha", type: "error" }); }
              }} className={`relative w-11 h-6 rounded-full transition-colors ${settings.security_db_backup_enabled !== "false" ? "bg-rust-500" : "bg-dark-600"}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${settings.security_db_backup_enabled !== "false" ? "translate-x-5.5 left-0.5" : "left-0.5"}`} />
              </button>
            </div>
            {/* Canary Files */}
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-100">Monitoramento de Arquivos Canário</p>
                <p className="text-xs text-dark-400">Detectar exploração não autorizada do sistema de arquivos</p>
              </div>
              <button onClick={async () => {
                const current = settings.security_canary_enabled !== "false";
                const newVal = !current;
                try {
                  await api.put("/settings", { security_canary_enabled: newVal ? "true" : "false" });
                  setSettings(prev => ({ ...prev, security_canary_enabled: newVal ? "true" : "false" }));
                  setMessage({ text: `Monitoramento canário ${newVal ? "habilitado" : "desabilitado"}`, type: "success" });
                } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Falha", type: "error" }); }
              }} className={`relative w-11 h-6 rounded-full transition-colors ${settings.security_canary_enabled !== "false" ? "bg-rust-500" : "bg-dark-600"}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${settings.security_canary_enabled !== "false" ? "translate-x-5.5 left-0.5" : "left-0.5"}`} />
              </button>
            </div>
            {/* Lockdown Threshold */}
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-100">Limite de Auto-Lockdown</p>
                <p className="text-xs text-dark-400">Eventos suspeitos antes do auto-lockdown disparar (padrão: 5 em 10 min)</p>
              </div>
              <input type="number" min="2" max="50" value={settings.security_lockdown_threshold || "5"}
                onChange={async (e) => {
                  try {
                    await api.put("/settings", { security_lockdown_threshold: e.target.value });
                    setSettings(prev => ({ ...prev, security_lockdown_threshold: e.target.value }));
                    setMessage({ text: "Limite atualizado", type: "success" });
                  } catch (err) { setMessage({ text: err instanceof Error ? err.message : "Falha ao salvar", type: "error" }); }
                }}
                className="w-16 px-2 py-1 border border-dark-500 rounded text-sm text-center focus:ring-2 focus:ring-accent-500 outline-none bg-dark-700"
              />
            </div>
          </div>
        </div>
        )}
        </>)}

        {/* Notification Channels */}
        {tab === "channels" && (<>
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Canais de Notificação</h3>
            <p className="text-xs text-dark-200 mt-0.5">Para onde enviar as notificações de alertas</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="notify-email"
                checked={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.checked)}
                className="rounded border-dark-500 text-rust-500 focus:ring-accent-500"
              />
              <label htmlFor="notify-email" className="text-sm text-dark-100">Notificações por email</label>
            </div>
            <div>
              <label htmlFor="notify-slack" className="block text-sm font-medium text-dark-100 mb-1">URL de Webhook do Slack</label>
              <div className="flex gap-2">
                <input
                  id="notify-slack"
                  type="url"
                  value={notifySlackUrl}
                  onChange={(e) => setNotifySlackUrl(e.target.value)}
                  className="flex-1 px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none font-mono"
                  placeholder="https://hooks.slack.com/services/..."
                />
                <button
                  disabled={!notifySlackUrl || testingWebhook === "slack"}
                  onClick={async () => {
                    setTestingWebhook("slack");
                    setWebhookResult({ type: "", msg: "" });
                    try {
                      await api.post("/settings/test-webhook", { url: notifySlackUrl, service: "slack" });
                      setWebhookResult({ type: "slack-ok", msg: "Enviado!" });
                    } catch (e) {
                      setWebhookResult({ type: "slack-err", msg: e instanceof Error ? e.message : "Falha" });
                    } finally {
                      setTestingWebhook(null);
                    }
                  }}
                  className="px-3 py-2 bg-dark-700 text-dark-100 rounded-lg text-xs font-medium hover:bg-dark-600 disabled:opacity-50 shrink-0"
                >
                  {testingWebhook === "slack" ? "Testando..." : "Testar"}
                </button>
              </div>
              {webhookResult.type === "slack-ok" && <p className="text-xs text-rust-400 mt-1">{webhookResult.msg}</p>}
              {webhookResult.type === "slack-err" && <p className="text-xs text-danger-400 mt-1">{webhookResult.msg}</p>}
            </div>
            <div>
              <label htmlFor="notify-discord" className="block text-sm font-medium text-dark-100 mb-1">URL de Webhook do Discord</label>
              <div className="flex gap-2">
                <input
                  id="notify-discord"
                  type="url"
                  value={notifyDiscordUrl}
                  onChange={(e) => setNotifyDiscordUrl(e.target.value)}
                  className="flex-1 px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none font-mono"
                  placeholder="https://discord.com/api/webhooks/..."
                />
                <button
                  disabled={!notifyDiscordUrl || testingWebhook === "discord"}
                  onClick={async () => {
                    setTestingWebhook("discord");
                    setWebhookResult({ type: "", msg: "" });
                    try {
                      await api.post("/settings/test-webhook", { url: notifyDiscordUrl, service: "discord" });
                      setWebhookResult({ type: "discord-ok", msg: "Enviado!" });
                    } catch (e) {
                      setWebhookResult({ type: "discord-err", msg: e instanceof Error ? e.message : "Falha" });
                    } finally {
                      setTestingWebhook(null);
                    }
                  }}
                  className="px-3 py-2 bg-dark-700 text-dark-100 rounded-lg text-xs font-medium hover:bg-dark-600 disabled:opacity-50 shrink-0"
                >
                  {testingWebhook === "discord" ? "Testando..." : "Testar"}
                </button>
              </div>
              {webhookResult.type === "discord-ok" && <p className="text-xs text-rust-400 mt-1">{webhookResult.msg}</p>}
              {webhookResult.type === "discord-err" && <p className="text-xs text-danger-400 mt-1">{webhookResult.msg}</p>}
            </div>
            <div>
              <label htmlFor="notify-pagerduty" className="block text-sm font-medium text-dark-100 mb-1">Chave de Integração PagerDuty</label>
              <input
                id="notify-pagerduty"
                type="text"
                value={notifyPagerdutyKey}
                onChange={(e) => setNotifyPagerdutyKey(e.target.value)}
                className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none font-mono"
                placeholder="Integration key from PagerDuty service"
              />
              <p className="text-xs text-dark-300 mt-1">Events API v2 integration key. Get it from PagerDuty &gt; Services &gt; Integrations.</p>
            </div>
            {/* Alert Type Muting */}
            <div className="bg-dark-800 rounded-lg border border-dark-600 p-5 space-y-3">
              <h3 className="text-sm font-medium text-dark-100 font-mono">Suppress External Notifications</h3>
              <p className="text-xs text-dark-400">Muted alert types still record in the panel but won't trigger Slack, Discord, PagerDuty, or webhook notifications.</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {[
                  { key: "cpu", label: "CPU" },
                  { key: "memory", label: "Memory" },
                  { key: "disk", label: "Disk" },
                  { key: "offline", label: "Offline" },
                  { key: "backup_failure", label: "Backup" },
                  { key: "ssl_expiry", label: "SSL" },
                  { key: "service_down", label: "Service" },
                  { key: "gpu_utilization", label: "GPU Util" },
                  { key: "gpu_temperature", label: "GPU Temp" },
                  { key: "gpu_vram", label: "GPU VRAM" },
                ].map(({ key, label }) => (
                  <label key={key} className="flex items-center gap-2 text-sm text-dark-200 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={mutedTypes.includes(key)}
                      onChange={e => setMutedTypes(
                        e.target.checked ? [...mutedTypes, key] : mutedTypes.filter(t => t !== key)
                      )}
                      className="rounded border-dark-500 bg-dark-900 text-rust-500 focus:ring-rust-500"
                    />
                    {label}
                  </label>
                ))}
              </div>
            </div>
            {/* GPU Alert Thresholds */}
            <div className="bg-dark-800 rounded-lg border border-dark-600 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-dark-100 font-mono">GPU Alert Thresholds</h3>
                  <p className="text-xs text-dark-400 mt-0.5">Configure when GPU alerts fire. Only applies to servers with NVIDIA GPUs.</p>
                </div>
                <label className="flex items-center gap-2 text-sm text-dark-200 cursor-pointer">
                  <input type="checkbox" checked={gpuAlertEnabled} onChange={e => setGpuAlertEnabled(e.target.checked)}
                    className="rounded border-dark-500 bg-dark-900 text-rust-500 focus:ring-rust-500" />
                  Enabled
                </label>
              </div>
              {gpuAlertEnabled && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-mono text-dark-300 uppercase tracking-widest mb-1">Utilization threshold</label>
                    <div className="flex items-center gap-2">
                      <input type="range" min="50" max="100" value={gpuUtilThreshold} onChange={e => setGpuUtilThreshold(Number(e.target.value))}
                        className="flex-1 accent-rust-500" />
                      <span className="text-sm text-dark-100 font-mono w-12 text-right">{gpuUtilThreshold}%</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-dark-300 uppercase tracking-widest mb-1">Utilization duration</label>
                    <div className="flex items-center gap-2">
                      <input type="range" min="1" max="30" value={gpuUtilDuration} onChange={e => setGpuUtilDuration(Number(e.target.value))}
                        className="flex-1 accent-rust-500" />
                      <span className="text-sm text-dark-100 font-mono w-16 text-right">{gpuUtilDuration} min</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-dark-300 uppercase tracking-widest mb-1">Temperature threshold</label>
                    <div className="flex items-center gap-2">
                      <input type="range" min="60" max="110" value={gpuTempThreshold} onChange={e => setGpuTempThreshold(Number(e.target.value))}
                        className="flex-1 accent-rust-500" />
                      <span className="text-sm text-dark-100 font-mono w-12 text-right">{gpuTempThreshold}°C</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-dark-300 uppercase tracking-widest mb-1">VRAM threshold</label>
                    <div className="flex items-center gap-2">
                      <input type="range" min="50" max="100" value={gpuVramThreshold} onChange={e => setGpuVramThreshold(Number(e.target.value))}
                        className="flex-1 accent-rust-500" />
                      <span className="text-sm text-dark-100 font-mono w-12 text-right">{gpuVramThreshold}%</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <button
                onClick={async () => {
                  setSaving("notify");
                  setMessage({ text: "", type: "" });
                  try {
                    await api.put("/alert-rules", {
                      notify_email: notifyEmail,
                      notify_slack_url: notifySlackUrl || null,
                      notify_discord_url: notifyDiscordUrl || null,
                      notify_pagerduty_key: notifyPagerdutyKey || null,
                      muted_types: mutedTypes.join(','),
                      alert_gpu: gpuAlertEnabled,
                      gpu_util_threshold: gpuUtilThreshold,
                      gpu_util_duration: gpuUtilDuration,
                      gpu_temp_threshold: gpuTempThreshold,
                      gpu_vram_threshold: gpuVramThreshold,
                    });
                    setMessage({ text: "Canais de notificação salvos", type: "success" });
                  } catch (e) {
                    setMessage({ text: e instanceof Error ? e.message : "Falha", type: "error" });
                  } finally {
                    setSaving(null);
                  }
                }}
                disabled={saving === "notify"}
                className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50"
              >
                {saving === "notify" ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>

        {/* Feature #8: Email Footer + Feature #13: Events Webhook */}
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden mt-4">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Configurações Adicionais</h3>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label className="block text-sm font-medium text-dark-100 mb-1">Texto de Rodapé do Email</label>
              <input type="text" value={settings.email_footer || ""} onChange={e => setSettings({ ...settings, email_footer: e.target.value })}
                placeholder="Enviado por AxiaPanel" className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none" />
              <p className="text-xs text-dark-300 mt-1">Texto personalizado adicionado ao final dos emails de notificação</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-100 mb-1">Webhook de Eventos do Painel</label>
              <input type="url" value={settings.events_webhook_url || ""} onChange={e => setSettings({ ...settings, events_webhook_url: e.target.value })}
                placeholder="https://example.com/webhook" className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 outline-none" />
              <p className="text-xs text-dark-300 mt-1">Recebe POST para eventos site.create, app.deploy, security.scan</p>
            </div>
            <div className="flex justify-end">
              <button onClick={async () => {
                setSaving("notifyExtra");
                setMessage({ text: "", type: "" });
                try {
                  await api.put("/settings", {
                    email_footer: settings.email_footer || "",
                    events_webhook_url: settings.events_webhook_url || "",
                  });
                  setMessage({ text: "Configurações salvas", type: "success" });
                } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Falha", type: "error" }); }
                finally { setSaving(null); }
              }} disabled={saving === "notifyExtra"} className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50">
                {saving === "notifyExtra" ? "Salvando..." : "Salvar"}
              </button>
            </div>
          </div>
        </div>
        </>)}

        {/* Services tab: Service Installers (incl. PowerDNS config), System Health */}
        {tab === "services" && (<>
        {/* Service Installers with integrated PowerDNS config */}
        <ServiceInstallers
          pdnsApiUrl={pdnsApiUrl}
          setPdnsApiUrl={setPdnsApiUrl}
          pdnsApiKey={pdnsApiKey}
          setPdnsApiKey={setPdnsApiKey}
          showPdnsGuide={showPdnsGuide}
          setShowPdnsGuide={setShowPdnsGuide}
          saving={saving}
          setSaving={setSaving}
          setMessage={setMessage}
        />

        {/* Image Vulnerability Scanning */}
        <ImageScanSettings setMessage={setMessage} />

        {/* SBOM (composition; companion to image scanning) */}
        <SbomSettings setMessage={setMessage} />

        {/* Prometheus metrics endpoint */}
        <PrometheusSettings setMessage={setMessage} />

        {/* ACME profile selection — 2026-ready Let's Encrypt */}
        <AcmeSettings setMessage={setMessage} />

        {/* System Health */}
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600 flex items-center justify-between">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Saúde do Sistema</h3>
            <button
              onClick={() => {
                setHealthLoading(true);
                loadHealth();
              }}
              className="px-3 py-1 bg-rust-500 text-white rounded-md text-xs font-medium hover:bg-rust-600"
            >
              Verificar Agora
            </button>
          </div>
          <div className="p-5">
            {healthLoading && !health ? (
              <div className="text-center text-sm text-dark-300 py-4">Verificando...</div>
            ) : !health ? (
              <div className="text-center text-sm text-danger-500 py-4">Não foi possível alcançar o endpoint de saúde</div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${health.database ? "bg-rust-500" : "bg-danger-500"}`} />
                    <span className="text-sm text-dark-50">Banco de Dados</span>
                  </div>
                  <span className={`text-sm font-medium ${health.database ? "text-rust-400" : "text-danger-400"}`}>
                    {health.database ? "Conectado" : "Erro"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${health.agentOk ? "bg-rust-500" : "bg-danger-500"}`} />
                    <span className="text-sm text-dark-50">Agent</span>
                  </div>
                  <span className={`text-sm font-medium ${health.agentOk ? "text-rust-400" : "text-danger-400"}`}>
                    {health.agentOk ? "Conectado" : "Erro"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-accent-500" />
                    <span className="text-sm text-dark-50">Uptime</span>
                  </div>
                  <span className="text-sm font-medium text-dark-200 font-mono">{health.uptime}</span>
                </div>
              </div>
            )}
          </div>
        </div>
        </>)}

      </div>
      </div>
    </div>
  );
}

// ── Service Installers Component ────────────────────────────────────────

function ServiceInstallers({ pdnsApiUrl, setPdnsApiUrl, pdnsApiKey, setPdnsApiKey, showPdnsGuide, setShowPdnsGuide, saving, setSaving, setMessage }: {
  pdnsApiUrl: string;
  setPdnsApiUrl: (v: string) => void;
  pdnsApiKey: string;
  setPdnsApiKey: (v: string) => void;
  showPdnsGuide: boolean;
  setShowPdnsGuide: (v: boolean) => void;
  saving: string | null;
  setSaving: (v: string | null) => void;
  setMessage: (v: { text: string; type: string }) => void;
}) {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [mailStatus, setMailStatus] = useState<{ installed: boolean; running: boolean } | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installId, setInstallId] = useState<string | null>(null);
  const [uninstalling, setUninstalling] = useState<string | null>(null);
  const [msg, setMsg] = useState({ text: "", type: "" });
  const [showGuide, setShowGuide] = useState(false);
  const [svcPendingConfirm, setSvcPendingConfirm] = useState<{ service: string; label: string } | null>(null);

  const refreshStatus = () => {
    api.get<ServiceStatus>("/services/install-status")
      .then((d) => setStatus(d))
      .catch(() => {});
    api.get<{ installed: boolean; running: boolean }>("/mail/status")
      .then((d) => setMailStatus(d))
      .catch(() => setMailStatus({ installed: false, running: false }));
  };

  useEffect(refreshStatus, []);

  const install = async (service: string, _label: string) => {
    setInstalling(service);
    setInstallId(null);
    setMsg({ text: "", type: "" });
    try {
      const endpoint = service === "mail" ? "/mail/install" : `/services/install/${service}`;
      const result = await api.post<{ install_id?: string }>(endpoint, {});
      if (result.install_id) {
        setInstallId(result.install_id);
      } else {
        setMsg({ text: `${_label} instalado com sucesso`, type: "success" });
        refreshStatus();
        setInstalling(null);
      }
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Falha na instalação", type: "error" });
      setInstalling(null);
    }
  };

  const uninstall = (service: string, label: string) => {
    setSvcPendingConfirm({ service, label });
  };

  const executeUninstall = async () => {
    if (!svcPendingConfirm) return;
    const { service, label } = svcPendingConfirm;
    setSvcPendingConfirm(null);
    setUninstalling(service);
    setMsg({ text: "", type: "" });
    try {
      const endpoint = service === "mail" ? "/mail/uninstall" : `/services/uninstall/${service}`;
      await api.post(endpoint, {});
      setMsg({ text: `${label} desinstalado com sucesso`, type: "success" });
      refreshStatus();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Falha ao desinstalar", type: "error" });
    } finally {
      setUninstalling(null);
    }
  };

  const services = [
    { id: "php", label: "PHP", desc: "PHP-FPM para sites dinâmicos (WordPress, Laravel, etc.)", field: "php", checkInstalled: (s: ServiceStatus) => s?.php?.installed, checkRunning: (s: ServiceStatus) => s?.php?.running, extra: (s: ServiceStatus) => s?.php?.version ? `v${s.php.version}` : null },
    { id: "certbot", label: "Certbot", desc: "Certificados SSL Let's Encrypt com renovação automática", field: "certbot", checkInstalled: (s: ServiceStatus) => s?.certbot?.installed, checkRunning: () => true, extra: () => null },
    { id: "ufw", label: "Firewall UFW", desc: "Firewall com regras padrão (SSH, HTTP, HTTPS, portas de mail)", field: "ufw", checkInstalled: (s: ServiceStatus) => s?.ufw?.installed, checkRunning: (s: ServiceStatus) => s?.ufw?.active, extra: () => null },
    { id: "fail2ban", label: "Fail2Ban", desc: "Prevenção de invasão com jails para SSH, Nginx e Postfix", field: "fail2ban", checkInstalled: (s: ServiceStatus) => s?.fail2ban?.installed, checkRunning: (s: ServiceStatus) => s?.fail2ban?.running, extra: () => null },
    { id: "powerdns", label: "PowerDNS", desc: "Servidor DNS autoritativo self-hosted com API HTTP", field: "powerdns", checkInstalled: (s: ServiceStatus) => s?.powerdns?.installed, checkRunning: (s: ServiceStatus) => s?.powerdns?.running, extra: () => null },
    { id: "mail", label: "Servidor de E-mail", desc: "Postfix + Dovecot + OpenDKIM para hospedagem de email", field: "mail", checkInstalled: () => mailStatus?.installed ?? null, checkRunning: () => mailStatus?.running ?? false, extra: () => null },
    { id: "redis", label: "Redis", desc: "Cache em memória e armazenamento para aplicações PHP", field: "redis", checkInstalled: (s: ServiceStatus) => s?.redis?.installed, checkRunning: (s: ServiceStatus) => s?.redis?.running, extra: () => null },
    { id: "nodejs", label: "Node.js", desc: "Runtime JavaScript para builds, SSR e pacotes npm", field: "nodejs", checkInstalled: (s: ServiceStatus) => s?.nodejs?.installed, checkRunning: () => null, extra: () => null },
    { id: "composer", label: "Composer", desc: "Gerenciador de dependências PHP para Laravel, Symfony, Drupal", field: "composer", checkInstalled: (s: ServiceStatus) => s?.composer?.installed, checkRunning: () => null, extra: () => null },
    { id: "waf", label: "WAF (ModSecurity)", desc: "Web Application Firewall com OWASP CRS — bloqueia SQL injection, XSS e OWASP Top 10", field: "waf", checkInstalled: (s: ServiceStatus) => s?.waf?.installed, checkRunning: () => null, extra: () => null },
    { id: "cloudflared", label: "Cloudflare Tunnel", desc: "Expõe sites sem port forwarding — acesso zero-trust via rede Cloudflare", field: "cloudflared", checkInstalled: (s: ServiceStatus) => s?.cloudflared?.installed, checkRunning: (s: ServiceStatus) => s?.cloudflared?.running, extra: () => null },
  ];

  return (
    <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
      <div className="px-5 py-3 border-b border-dark-600">
        <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Serviços</h3>
        <p className="text-xs text-dark-200 mt-0.5">Instalação em um clique de softwares comuns de servidor</p>
      </div>
      <div className="p-5 space-y-4">
        {installId && (
          <ProvisionLog
            sseUrl={`/api/services/install/${installId}/log`}
            onComplete={() => {
              setInstallId(null);
              setInstalling(null);
              refreshStatus();
            }}
          />
        )}

        {msg.text && (
          <div className={`px-4 py-2 rounded-lg text-sm border ${msg.type === "success" ? "bg-rust-500/10 text-rust-400 border-rust-500/20" : "bg-danger-500/10 text-danger-400 border-danger-500/20"}`}>
            {msg.text}
          </div>
        )}

        {/* Inline confirmation bar for service uninstall */}
        {svcPendingConfirm && (
          <div className="px-4 py-3 rounded-lg border flex items-center justify-between border-danger-500/30 bg-danger-500/5">
            <span className="text-xs font-mono text-danger-400">
              Desinstalar {svcPendingConfirm.label}?
            </span>
            <div className="flex items-center gap-2 shrink-0 ml-4">
              <button onClick={executeUninstall} className="px-3 py-1.5 bg-danger-500 text-white text-xs font-bold uppercase tracking-wider hover:bg-danger-400 transition-colors">
                Confirmar
              </button>
              <button onClick={() => setSvcPendingConfirm(null)} className="px-3 py-1.5 bg-dark-600 text-dark-200 text-xs font-bold uppercase tracking-wider hover:bg-dark-500 transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        )}

        <button
          onClick={() => setShowGuide(!showGuide)}
          className="flex items-center gap-2 text-sm text-accent-400 hover:text-accent-300 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          {showGuide ? "Ocultar detalhes" : "O que cada um instala?"}
          <svg className={`w-3 h-3 transition-transform ${showGuide ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>

        {showGuide && (
          <div className="bg-dark-900 border border-dark-500 p-4 text-xs text-dark-200 space-y-2">
            <p><span className="text-dark-100 font-medium">PHP</span> — Installs PHP-FPM + common extensions (mysql, curl, gd, mbstring, xml, zip, opcache). Required for WordPress and PHP sites.</p>
            <p><span className="text-dark-100 font-medium">Certbot</span> — Installs Let's Encrypt certbot with nginx plugin. Enables auto-renewal timer. Required for free SSL certificates.</p>
            <p><span className="text-dark-100 font-medium">UFW</span> — Installs firewall, opens SSH/HTTP/HTTPS/SMTP/IMAPS ports, enables with deny-by-default policy.</p>
            <p><span className="text-dark-100 font-medium">Fail2Ban</span> — Installs intrusion prevention. Creates jails for SSH brute-force, nginx auth failures, Postfix, and Dovecot.</p>
            <p><span className="text-dark-100 font-medium">PowerDNS</span> — Installs authoritative DNS server with PostgreSQL backend. Auto-configures HTTP API and saves credentials to Settings.</p>
            <p><span className="text-dark-100 font-medium">Mail Server</span> — Installs Postfix (SMTP), Dovecot (IMAP/POP3), and OpenDKIM (DKIM signing). Creates vmail user, configures virtual mailbox hosting with SASL auth and submission port (587). Manage domains and mailboxes from the Mail page.</p>
            <p><span className="text-dark-100 font-medium">Redis</span> — Installs Redis in-memory data store. Used as cache backend for PHP applications (WordPress object cache, Laravel, Drupal). Runs as a systemd service on port 6379.</p>
            <p><span className="text-dark-100 font-medium">Node.js</span> — Installs Node.js 22 LTS and npm via NodeSource. Used for build tools, SSR frameworks (Next.js, Nuxt), and running JavaScript/TypeScript applications.</p>
            <p><span className="text-dark-100 font-medium">Composer</span> — Installs Composer globally at /usr/local/bin. The standard PHP dependency manager used by Laravel, Symfony, Drupal, and most PHP frameworks.</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {services.map((svc) => {
            const installed = status ? svc.checkInstalled(status) : null;
            const running = status ? svc.checkRunning(status) : null;
            const extra = status ? svc.extra(status) : null;

            return (
              <div key={svc.id} className="border border-dark-500 bg-dark-900/50 p-4 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-dark-50">{svc.label}</span>
                    {extra && <span className="text-[10px] text-dark-300">{extra}</span>}
                    {installed === true && running !== null && (
                      <span className={`w-2 h-2 rounded-full ${running ? "bg-rust-400" : "bg-warn-400"}`} title={running ? "Running" : "Installed but not running"} />
                    )}
                  </div>
                  <p className="text-[10px] text-dark-300 mt-0.5">{svc.desc}</p>
                </div>
                {installed ? (
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className="text-[10px] text-dark-300 uppercase tracking-wider">Instalado</span>
                    {(
                      <button
                        onClick={() => uninstall(svc.id, svc.label)}
                        disabled={uninstalling !== null || installing !== null}
                        className="px-2.5 py-1 bg-danger-500/10 text-danger-400 border border-danger-500/20 rounded-lg text-[10px] font-medium hover:bg-danger-500/20 disabled:opacity-50"
                      >
                        {uninstalling === svc.id ? "Removendo..." : "Desinstalar"}
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => install(svc.id, svc.label)}
                    disabled={installing !== null}
                    className="px-3 py-1.5 bg-rust-500 text-white rounded-lg text-xs font-medium hover:bg-rust-600 disabled:opacity-50 shrink-0 ml-3"
                  >
                    {installing === svc.id ? "Instalando..." : "Instalar"}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* PowerDNS API Configuration */}
        <div className="border-t border-dark-600 pt-4 mt-2 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium text-dark-200 uppercase font-mono tracking-widest">Configuração da API do PowerDNS</h4>
            <button
              onClick={() => setShowPdnsGuide(!showPdnsGuide)}
              className="flex items-center gap-1.5 text-xs text-accent-400 hover:text-accent-300 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              {showPdnsGuide ? "Ocultar guia" : "Guia de configuração"}
            </button>
          </div>

          {showPdnsGuide && (
            <div className="bg-dark-900 border border-dark-500 p-4 space-y-3 text-sm">
              <p className="text-dark-200 font-medium">Instale o PowerDNS com backend PostgreSQL:</p>
              <pre className="bg-dark-950 border border-dark-600 p-3 text-xs text-dark-100 font-mono overflow-x-auto whitespace-pre">{`# Install PowerDNS
apt install pdns-server pdns-backend-pgsql

# Create a database for PowerDNS
sudo -u postgres createdb pdns
sudo -u postgres psql pdns < /usr/share/doc/pdns-backend-pgsql/schema.pgsql.sql`}</pre>
              <p className="text-dark-200 font-medium">Configure o <span className="text-dark-100 font-mono">/etc/powerdns/pdns.conf</span>:</p>
              <pre className="bg-dark-950 border border-dark-600 p-3 text-xs text-dark-100 font-mono overflow-x-auto whitespace-pre">{`launch=gpgsql
gpgsql-host=127.0.0.1
gpgsql-dbname=pdns
gpgsql-user=postgres

# Enable HTTP API
api=yes
api-key=your-secret-key-here
webserver=yes
webserver-address=127.0.0.1
webserver-port=8081
webserver-allow-from=127.0.0.1`}</pre>
              <p className="text-dark-200 font-medium">Depois reinicie e verifique:</p>
              <pre className="bg-dark-950 border border-dark-600 p-3 text-xs text-dark-100 font-mono overflow-x-auto whitespace-pre">{`systemctl restart pdns
curl -s -H "X-API-Key: your-secret-key-here" \\
  http://127.0.0.1:8081/api/v1/servers/localhost | jq .`}</pre>
              <p className="text-xs text-dark-300">Após a configuração, preencha a URL e a chave da API abaixo e crie zonas pela página DNS.</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label htmlFor="pdns-url" className="block text-xs font-medium text-dark-100 mb-1">API URL</label>
              <input
                id="pdns-url"
                type="url"
                value={pdnsApiUrl}
                onChange={(e) => setPdnsApiUrl(e.target.value)}
                className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none font-mono"
                placeholder="http://127.0.0.1:8081"
              />
            </div>
            <div>
              <label htmlFor="pdns-key" className="block text-xs font-medium text-dark-100 mb-1">Chave da API</label>
              <input
                id="pdns-key"
                type="password"
                value={pdnsApiKey}
                onChange={(e) => setPdnsApiKey(e.target.value)}
                className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none font-mono"
                placeholder="Chave da API do PowerDNS"
              />
              <p className="text-xs text-dark-300 mt-1">O valor de api-key em /etc/powerdns/pdns.conf</p>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={async () => {
                setSaving("pdns");
                setMessage({ text: "", type: "" });
                try {
                  const body: Record<string, string> = { pdns_api_url: pdnsApiUrl };
                  if (pdnsApiKey && pdnsApiKey !== "********") {
                    body.pdns_api_key = pdnsApiKey;
                  }
                  await api.put("/settings", body);
                  setMessage({ text: "Configurações do PowerDNS salvas", type: "success" });
                } catch (e) {
                  setMessage({ text: e instanceof Error ? e.message : "Falha", type: "error" });
                } finally {
                  setSaving(null);
                }
              }}
              disabled={saving === "pdns"}
              className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50"
            >
              {saving === "pdns" ? "Salvando..." : "Salvar Config do PowerDNS"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SSH Keys Component ──────────────────────────────────────────────────

function SSHKeys() {
  const [keys, setKeys] = useState<{ type: string; fingerprint: string; comment: string; key: string }[]>([]);
  const [newKey, setNewKey] = useState("");
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState({ text: "", type: "" });

  useEffect(() => {
    api.get<{ keys: typeof keys }>("/ssh-keys").then(d => setKeys(d.keys || [])).catch(() => {});
  }, []);

  return (
    <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
      <div className="px-5 py-3 border-b border-dark-600">
        <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Chaves SSH</h3>
        <p className="text-xs text-dark-200 mt-0.5">Gerencie chaves SSH autorizadas para acesso root</p>
      </div>
      <div className="p-5 space-y-3">
        {msg.text && <div className={`px-3 py-2 rounded text-xs ${msg.type === "success" ? "bg-rust-500/10 text-rust-400" : "bg-danger-500/10 text-danger-400"}`}>{msg.text}</div>}
        {keys.length === 0 && (
          <p className="text-xs text-dark-400 text-center py-2">Nenhuma chave SSH configurada</p>
        )}
        {keys.map((k) => (
          <div key={k.fingerprint} className="flex items-center justify-between bg-dark-900 border border-dark-500 px-4 py-2">
            <div className="min-w-0">
              <span className="text-xs text-dark-50 font-mono block truncate">{k.comment || k.key}</span>
              <span className="text-[10px] text-dark-300 font-mono">{k.fingerprint}</span>
            </div>
            <button onClick={async () => {
              try { await api.delete(`/ssh-keys/${encodeURIComponent(k.fingerprint)}`); setKeys(keys.filter(x => x.fingerprint !== k.fingerprint)); setMsg({ text: "Chave removida", type: "success" }); }
              catch (e) { setMsg({ text: e instanceof Error ? e.message : "Falha ao remover chave", type: "error" }); }
            }} className="p-1 text-dark-300 hover:text-danger-400 shrink-0 ml-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <input type="text" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="ssh-ed25519 AAAA... user@host" className="flex-1 px-3 py-2 border border-dark-500 rounded-lg text-xs font-mono focus:ring-2 focus:ring-accent-500 outline-none" />
          <button disabled={adding || !newKey.startsWith("ssh-")} onClick={async () => {
            setAdding(true); setMsg({ text: "", type: "" });
            try { await api.post("/ssh-keys", { key: newKey }); setNewKey(""); const d = await api.get<{ keys: typeof keys }>("/ssh-keys"); setKeys(d.keys || []); setMsg({ text: "Chave adicionada", type: "success" }); }
            catch (e) { setMsg({ text: e instanceof Error ? e.message : "Falha", type: "error" }); }
            finally { setAdding(false); }
          }} className="px-3 py-2 bg-rust-500 text-white rounded-lg text-xs font-medium hover:bg-rust-600 disabled:opacity-50 shrink-0">
            {adding ? "Adicionando..." : "Adicionar Chave"}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Auto-Updates Component ──────────────────────────────────────────────

function AutoUpdates() {
  const [status, setStatus] = useState<{ installed: boolean; enabled: boolean } | null>(null);
  const [toggling, setToggling] = useState(false);

  useEffect(() => {
    api.get<{ installed: boolean; enabled: boolean }>("/auto-updates/status").then(setStatus).catch(() => {});
  }, []);

  const toggle = async () => {
    if (!status) return;
    setToggling(true);
    try {
      await api.post(status.enabled ? "/auto-updates/disable" : "/auto-updates/enable", {});
      setStatus({ ...status, installed: true, enabled: !status.enabled });
    } catch { /* toggle failed — state not changed */ }
    finally { setToggling(false); }
  };

  return (
    <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
      <div className="px-5 py-3 border-b border-dark-600">
        <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Atualizações Automáticas</h3>
        <p className="text-xs text-dark-200 mt-0.5">Instala patches de segurança automaticamente</p>
      </div>
      <div className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-dark-100">Atualizações de segurança automáticas</p>
            <p className="text-xs text-dark-300 mt-0.5">Usa unattended-upgrades para aplicar patches de segurança automaticamente</p>
          </div>
          <button onClick={toggle} disabled={toggling} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${status?.enabled ? "bg-rust-500" : "bg-dark-600"}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${status?.enabled ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── IP Whitelist Component ──────────────────────────────────────────────

function IPWhitelist() {
  const [ips, setIps] = useState<string[]>([]);
  const [newIp, setNewIp] = useState("");
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState({ text: "", type: "" });

  useEffect(() => {
    api.get<{ ips: string[] }>("/panel-whitelist").then(d => setIps(d.ips || [])).catch(() => {});
  }, []);

  const save = async (list: string[]) => {
    setSaving(true); setMsg({ text: "", type: "" });
    try {
      await api.post("/panel-whitelist", { ips: list });
      setIps(list);
      setMsg({ text: list.length > 0 ? `Whitelist salva (${list.length} IPs)` : "Whitelist limpa", type: "success" });
    } catch (e) { setMsg({ text: e instanceof Error ? e.message : "Falha", type: "error" }); }
    finally { setSaving(false); }
  };

  return (
    <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
      <div className="px-5 py-3 border-b border-dark-600">
        <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Whitelist de IPs do Painel</h3>
        <p className="text-xs text-dark-200 mt-0.5">Restringir o acesso ao painel a IPs específicos</p>
      </div>
      <div className="p-5 space-y-3">
        {msg.text && <div className={`px-3 py-2 rounded text-xs ${msg.type === "success" ? "bg-rust-500/10 text-rust-400" : "bg-danger-500/10 text-danger-400"}`}>{msg.text}</div>}
        {ips.length === 0 && (
          <p className="text-xs text-dark-400 text-center py-2">Sem whitelist — todos os IPs podem acessar o painel</p>
        )}
        {ips.map((ip, i) => (
          <div key={i} className="flex items-center justify-between bg-dark-900 border border-dark-500 px-3 py-1.5">
            <span className="text-xs text-dark-50 font-mono">{ip}</span>
            <button onClick={() => save(ips.filter((_, j) => j !== i))} className="text-dark-300 hover:text-danger-400">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <input type="text" value={newIp} onChange={(e) => setNewIp(e.target.value)} placeholder="ex. 203.0.113.50" className="flex-1 px-3 py-2 border border-dark-500 rounded-lg text-xs font-mono focus:ring-2 focus:ring-accent-500 outline-none" />
          <button disabled={!newIp || saving} onClick={() => { save([...ips, newIp.trim()]); setNewIp(""); }} className="px-3 py-2 bg-rust-500 text-white rounded-lg text-xs font-medium hover:bg-rust-600 disabled:opacity-50 shrink-0">Adicionar IP</button>
        </div>
        {ips.length > 0 && <button onClick={() => save([])} className="text-xs text-dark-300 hover:text-dark-100">Limpar whitelist (permitir todos)</button>}
      </div>
    </div>
  );
}

// ── Image Vulnerability Scanning ────────────────────────────────────────

interface ImageScanSettingsState {
  enabled: boolean;
  on_deploy: boolean;
  deploy_gate: string;
  interval_hours: number;
  installed: boolean;
}

function ImageScanSettings({ setMessage }: { setMessage: (m: { text: string; type: string }) => void }) {
  const [s, setS] = useState<ImageScanSettingsState | null>(null);
  const [saving, setSaving] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [uninstallConfirm, setUninstallConfirm] = useState(false);

  const load = () => {
    api.get<ImageScanSettingsState>("/image-scan/settings")
      .then(setS)
      .catch(() => setS(null));
  };

  useEffect(() => { load(); }, []);

  const update = async (patch: Partial<ImageScanSettingsState>) => {
    if (!s) return;
    const next = { ...s, ...patch };
    setS(next);
    setSaving(true);
    try {
      await api.put("/image-scan/settings", {
        enabled: next.enabled,
        on_deploy: next.on_deploy,
        deploy_gate: next.deploy_gate,
        interval_hours: next.interval_hours,
      });
      setMessage({ text: "Configurações de scan salvas", type: "success" });
    } catch (e) {
      setMessage({ text: `Falha ao salvar: ${(e as Error).message || "desconhecido"}`, type: "error" });
      load();
    } finally {
      setSaving(false);
    }
  };

  const install = async () => {
    setInstalling(true);
    try {
      await api.post("/image-scan/install", {});
      setMessage({ text: "Scanner instalado (grype)", type: "success" });
      load();
    } catch (e) {
      setMessage({ text: `Falha na instalação: ${(e as Error).message || "desconhecido"}`, type: "error" });
    } finally {
      setInstalling(false);
    }
  };

  const uninstall = async () => {
    setInstalling(true);
    try {
      await api.post("/image-scan/uninstall", {});
      setMessage({ text: "Scanner removido", type: "success" });
      load();
    } catch (e) {
      setMessage({ text: `Falha ao desinstalar: ${(e as Error).message || "desconhecido"}`, type: "error" });
    } finally {
      setInstalling(false);
      setUninstallConfirm(false);
    }
  };

  if (!s) {
    return (
      <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
        <div className="px-5 py-3 border-b border-dark-600">
          <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Scan de Vulnerabilidades de Imagem</h3>
        </div>
        <div className="p-5 text-sm text-dark-300">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
      <div className="px-5 py-3 border-b border-dark-600">
        <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Scan de Vulnerabilidades de Imagem</h3>
        <p className="text-xs text-dark-200 mt-0.5">Verifica imagens Docker em produção contra CVEs conhecidos (grype). Os badges por app aparecem na página Apps.</p>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between border border-dark-600 bg-dark-900/50 rounded p-4">
          <div>
            <div className="text-sm font-medium text-dark-50 flex items-center gap-2">
              Scanner (grype)
              <span className={`w-2 h-2 rounded-full ${s.installed ? "bg-rust-400" : "bg-dark-500"}`} title={s.installed ? "Instalado" : "Não instalado"} />
            </div>
            <p className="text-[10px] text-dark-300 mt-0.5">Binário de ~70MB + base de vulnerabilidades. Necessário para qualquer scan.</p>
          </div>
          {s.installed ? (
            uninstallConfirm ? (
              <div className="flex gap-2">
                <button onClick={uninstall} disabled={installing} className="px-3 py-1.5 bg-danger-500 text-white text-xs font-bold uppercase tracking-wider hover:bg-danger-400 disabled:opacity-50">
                  {installing ? "..." : "Confirmar"}
                </button>
                <button onClick={() => setUninstallConfirm(false)} className="px-3 py-1.5 bg-dark-600 text-dark-200 text-xs font-bold uppercase tracking-wider hover:bg-dark-500">
                  Cancelar
                </button>
              </div>
            ) : (
              <button onClick={() => setUninstallConfirm(true)} className="px-2.5 py-1 bg-danger-500/10 text-danger-400 border border-danger-500/20 rounded-lg text-[10px] font-medium hover:bg-danger-500/20">
                Desinstalar
              </button>
            )
          ) : (
            <button onClick={install} disabled={installing} className="px-3 py-1.5 bg-rust-500 text-white rounded-md text-xs font-medium hover:bg-rust-600 disabled:opacity-50">
              {installing ? "Instalando..." : "Instalar Scanner"}
            </button>
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-start gap-3 border border-dark-600 bg-dark-900/50 rounded p-4 cursor-pointer hover:bg-dark-900">
            <input
              type="checkbox"
              checked={s.enabled}
              disabled={!s.installed || saving}
              onChange={e => update({ enabled: e.target.checked })}
              className="mt-1"
            />
            <div>
              <div className="text-sm font-medium text-dark-50">Habilitar scans agendados</div>
              <p className="text-[10px] text-dark-300 mt-0.5">Varredura em segundo plano refaz scan da imagem de cada app em execução no intervalo abaixo.</p>
            </div>
          </label>

          <label className="flex items-start gap-3 border border-dark-600 bg-dark-900/50 rounded p-4 cursor-pointer hover:bg-dark-900">
            <input
              type="checkbox"
              checked={s.on_deploy}
              disabled={!s.installed || saving}
              onChange={e => update({ on_deploy: e.target.checked })}
              className="mt-1"
            />
            <div>
              <div className="text-sm font-medium text-dark-50">Bloquear deploys conforme resultado do scan</div>
              <p className="text-[10px] text-dark-300 mt-0.5">Bloqueia novos deploys quando o último scan da imagem ultrapassar o limite abaixo.</p>
            </div>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="border border-dark-600 bg-dark-900/50 rounded p-4">
            <label className="block text-xs font-mono text-dark-300 uppercase tracking-widest mb-2">Limite para bloqueio de deploy</label>
            <select
              value={s.deploy_gate}
              disabled={saving}
              onChange={e => update({ deploy_gate: e.target.value })}
              className="w-full px-3 py-2 bg-dark-800 border border-dark-500 rounded text-sm text-dark-50"
            >
              <option value="none">Nenhum — nunca bloquear</option>
              <option value="critical">Apenas Críticos</option>
              <option value="high">Altos ou Críticos</option>
              <option value="medium">Médios, Altos ou Críticos</option>
            </select>
            <p className="text-[10px] text-dark-300 mt-2">Só é aplicado quando "Bloquear deploys" está ativo.</p>
          </div>

          <div className="border border-dark-600 bg-dark-900/50 rounded p-4">
            <label className="block text-xs font-mono text-dark-300 uppercase tracking-widest mb-2">Intervalo de re-scan (horas)</label>
            <input
              type="number"
              min={1}
              max={720}
              value={s.interval_hours}
              disabled={saving}
              onChange={e => {
                const v = parseInt(e.target.value, 10);
                if (!Number.isNaN(v)) update({ interval_hours: v });
              }}
              className="w-full px-3 py-2 bg-dark-800 border border-dark-500 rounded text-sm text-dark-50 font-mono"
            />
            <p className="text-[10px] text-dark-300 mt-2">A varredura em segundo plano ignora imagens já scaneadas dentro desta janela.</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── SBOM (syft) ─────────────────────────────────────────────────────────

interface SbomSettingsState {
  installed: boolean;
}

function SbomSettings({ setMessage }: { setMessage: (m: { text: string; type: string }) => void }) {
  const [s, setS] = useState<SbomSettingsState | null>(null);
  const [installing, setInstalling] = useState(false);
  const [uninstallConfirm, setUninstallConfirm] = useState(false);

  const load = () => {
    api.get<SbomSettingsState>("/sbom/settings")
      .then(setS)
      .catch(() => setS(null));
  };

  useEffect(() => { load(); }, []);

  const install = async () => {
    setInstalling(true);
    try {
      await api.post("/sbom/install", {});
      setMessage({ text: "Gerador SBOM instalado (syft)", type: "success" });
      load();
    } catch (e) {
      setMessage({ text: `Falha na instalação: ${(e as Error).message || "desconhecido"}`, type: "error" });
    } finally {
      setInstalling(false);
    }
  };

  const uninstall = async () => {
    setInstalling(true);
    try {
      await api.post("/sbom/uninstall", {});
      setMessage({ text: "Gerador SBOM removido", type: "success" });
      load();
    } catch (e) {
      setMessage({ text: `Falha ao desinstalar: ${(e as Error).message || "desconhecido"}`, type: "error" });
    } finally {
      setInstalling(false);
      setUninstallConfirm(false);
    }
  };

  if (!s) {
    return (
      <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
        <div className="px-5 py-3 border-b border-dark-600">
          <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Geração de SBOM</h3>
        </div>
        <div className="p-5 text-sm text-dark-300">Carregando...</div>
      </div>
    );
  }

  return (
    <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
      <div className="px-5 py-3 border-b border-dark-600">
        <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Geração de SBOM</h3>
        <p className="text-xs text-dark-200 mt-0.5">Gera SBOMs SPDX 2.3 sob demanda das imagens em produção (syft). Use o botão "Baixar SBOM" no painel de scan de cada app.</p>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between border border-dark-600 bg-dark-900/50 rounded p-4">
          <div>
            <div className="text-sm font-medium text-dark-50 flex items-center gap-2">
              Gerador (syft)
              <span className={`w-2 h-2 rounded-full ${s.installed ? "bg-rust-400" : "bg-dark-500"}`} title={s.installed ? "Instalado" : "Não instalado"} />
            </div>
            <p className="text-[10px] text-dark-300 mt-0.5">Binário de ~80MB. Necessário para gerar SBOMs a partir de imagens de container.</p>
          </div>
          {s.installed ? (
            uninstallConfirm ? (
              <div className="flex gap-2">
                <button onClick={uninstall} disabled={installing} className="px-3 py-1.5 bg-danger-500 text-white text-xs font-bold uppercase tracking-wider hover:bg-danger-400 disabled:opacity-50">
                  {installing ? "..." : "Confirmar"}
                </button>
                <button onClick={() => setUninstallConfirm(false)} className="px-3 py-1.5 bg-dark-600 text-dark-200 text-xs font-bold uppercase tracking-wider hover:bg-dark-500">
                  Cancelar
                </button>
              </div>
            ) : (
              <button onClick={() => setUninstallConfirm(true)} className="px-2.5 py-1 bg-danger-500/10 text-danger-400 border border-danger-500/20 rounded-lg text-[10px] font-medium hover:bg-danger-500/20">
                Desinstalar
              </button>
            )
          ) : (
            <button onClick={install} disabled={installing} className="px-3 py-1.5 bg-rust-500 text-white rounded-md text-xs font-medium hover:bg-rust-600 disabled:opacity-50">
              {installing ? "Instalando..." : "Instalar Gerador"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Prometheus scrape endpoint ──────────────────────────────────────────

interface PromSettingsState {
  enabled: boolean;
  token_configured: boolean;
  token_prefix: string | null;
}

function PrometheusSettings({ setMessage }: { setMessage: (m: { text: string; type: string }) => void }) {
  const [s, setS] = useState<PromSettingsState | null>(null);
  const [saving, setSaving] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [rotateConfirm, setRotateConfirm] = useState(false);

  const load = () => {
    api.get<PromSettingsState>("/prometheus/settings")
      .then(setS)
      .catch(() => setS(null));
  };

  useEffect(() => { load(); }, []);

  const save = async (enabled: boolean, rotate: boolean) => {
    setSaving(true);
    try {
      const res = await api.post<{ token: string | null; message: string }>("/prometheus/settings", {
        enabled,
        rotate_token: rotate,
      });
      if (res.token) setNewToken(res.token);
      setMessage({ text: res.message, type: "success" });
      load();
    } catch (e) {
      setMessage({ text: `Falha: ${(e as Error).message || "desconhecido"}`, type: "error" });
    } finally {
      setSaving(false);
      setRotateConfirm(false);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => setMessage({ text: "Copiado para a área de transferência", type: "success" }),
      () => setMessage({ text: "Falha ao copiar", type: "error" }),
    );
  };

  if (!s) {
    return (
      <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
        <div className="px-5 py-3 border-b border-dark-600">
          <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Métricas Prometheus</h3>
        </div>
        <div className="p-5 text-sm text-dark-300">Carregando...</div>
      </div>
    );
  }

  const scrapeUrl = `${window.location.origin}/api/metrics`;
  const scrapeConfig = `scrape_configs:
  - job_name: 'axiapanel'
    metrics_path: /api/metrics
    scheme: ${window.location.protocol.replace(":", "")}
    bearer_token: ${newToken ?? "<your-scrape-token>"}
    static_configs:
      - targets: ['${window.location.host}']`;

  return (
    <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
      <div className="px-5 py-3 border-b border-dark-600">
        <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Métricas Prometheus</h3>
        <p className="text-xs text-dark-200 mt-0.5">
          Expõe CPU, memória, disco, GPU, sites e alertas no formato de exposição Prometheus em <span className="font-mono text-dark-50">/api/metrics</span> para que stacks de monitoramento externos façam scrape.
        </p>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between border border-dark-600 bg-dark-900/50 rounded p-4">
          <div>
            <div className="text-sm font-medium text-dark-50 flex items-center gap-2">
              Endpoint de scrape
              <span className={`w-2 h-2 rounded-full ${s.enabled ? "bg-rust-400" : "bg-dark-500"}`} title={s.enabled ? "Habilitado" : "Desabilitado"} />
            </div>
            <p className="text-[10px] text-dark-300 mt-0.5">
              {s.enabled
                ? "Ativo. Os scrapers precisam do bearer token abaixo."
                : "Desabilitado. Quando desabilitado, /api/metrics retorna 404 (oculta o endpoint)."}
            </p>
          </div>
          <button
            onClick={() => save(!s.enabled, false)}
            disabled={saving}
            className={`px-3 py-1.5 text-xs font-medium rounded-md disabled:opacity-50 ${
              s.enabled
                ? "bg-danger-500/10 text-danger-400 border border-danger-500/20 hover:bg-danger-500/20"
                : "bg-rust-500 text-white hover:bg-rust-600"
            }`}
          >
            {saving ? "..." : s.enabled ? "Desabilitar" : "Habilitar"}
          </button>
        </div>

        {s.enabled && (
          <>
            <div className="border border-dark-600 bg-dark-900/50 rounded p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-dark-50">Token de scrape</div>
                  <p className="text-[10px] text-dark-300 mt-0.5">
                    {s.token_configured
                      ? <>Token ativo começa com <span className="font-mono text-dark-50">{s.token_prefix ?? "dpms_…"}</span>. Girar invalida o antigo imediatamente.</>
                      : "Nenhum token configurado."}
                  </p>
                </div>
                {rotateConfirm ? (
                  <div className="flex gap-2">
                    <button onClick={() => save(s.enabled, true)} disabled={saving} className="px-3 py-1.5 bg-danger-500 text-white text-xs font-bold uppercase tracking-wider hover:bg-danger-400 disabled:opacity-50">
                      {saving ? "..." : "Confirmar Rotação"}
                    </button>
                    <button onClick={() => setRotateConfirm(false)} className="px-3 py-1.5 bg-dark-600 text-dark-200 text-xs font-bold uppercase tracking-wider hover:bg-dark-500">
                      Cancelar
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setRotateConfirm(true)} className="px-2.5 py-1 bg-dark-600 text-dark-100 border border-dark-500 rounded-lg text-[10px] font-medium hover:bg-dark-500">
                    Girar
                  </button>
                )}
              </div>

              {newToken && (
                <div className="border border-warning-500/30 bg-warning-500/5 rounded p-3">
                  <div className="text-[10px] font-medium text-warning-400 uppercase tracking-wider mb-1">Salve este token — ele não será mostrado novamente</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs font-mono text-dark-50 break-all">{newToken}</code>
                    <button
                      onClick={() => copy(newToken)}
                      className="px-2 py-1 bg-dark-700 border border-dark-500 text-dark-100 rounded text-[10px] hover:bg-dark-600 shrink-0"
                    >
                      Copiar
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="border border-dark-600 bg-dark-900/50 rounded p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-dark-50">URL do Endpoint</div>
                <button
                  onClick={() => copy(scrapeUrl)}
                  className="px-2 py-1 bg-dark-700 border border-dark-500 text-dark-100 rounded text-[10px] hover:bg-dark-600"
                >
                  Copiar URL
                </button>
              </div>
              <code className="block text-xs font-mono text-dark-100 break-all">{scrapeUrl}</code>
            </div>

            <div className="border border-dark-600 bg-dark-900/50 rounded p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-dark-50">Config de scrape do Prometheus</div>
                <button
                  onClick={() => copy(scrapeConfig)}
                  className="px-2 py-1 bg-dark-700 border border-dark-500 text-dark-100 rounded text-[10px] hover:bg-dark-600"
                >
                  Copiar YAML
                </button>
              </div>
              <pre className="text-[11px] font-mono text-dark-100 whitespace-pre-wrap break-all">{scrapeConfig}</pre>
              <p className="text-[10px] text-dark-300">
                Cole este bloco abaixo de <span className="font-mono">scrape_configs:</span> no seu <span className="font-mono">prometheus.yml</span>.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── ACME profile selection ────────────────────────────────────────────
//
// Lets the admin pick the default Let's Encrypt profile new certs use.
// Maps to RFC 8555 + RFC 9773 "profiles" extension. LE currently exposes:
//   classic     — 90-day certs, default
//   tlsserver   — 90-day today; flips to 45-day on 2026-05-13 (opt-in)
//   shortlived  — ~6-day certs, for the highest-automation subscribers
//
// When the CA doesn't advertise profiles, the card hides itself.

interface ProfileMeta { name: string; description: string }
interface AcmeProfilesResp { profiles: ProfileMeta[]; default: string | null }

function AcmeSettings({ setMessage }: { setMessage: (m: { text: string; type: string }) => void }) {
  const [s, setS] = useState<AcmeProfilesResp | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api.get<AcmeProfilesResp>("/ssl/profiles")
      .then((r) => { setS(r); setLoadError(null); })
      .catch((e) => setLoadError((e as Error).message || "failed to load"));
  }, []);

  const setProfile = async (profile: string | null) => {
    setSaving(true);
    try {
      await api.post("/ssl/default-profile", { profile });
      setS((prev) => prev ? { ...prev, default: profile } : prev);
      setMessage({ text: profile ? `Profile ACME padrão: ${profile}` : "Profile ACME padrão removido", type: "success" });
    } catch (e) {
      setMessage({ text: `Falha: ${(e as Error).message || "desconhecido"}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
        <div className="px-5 py-3 border-b border-dark-600">
          <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Profile ACME</h3>
        </div>
        <div className="p-5 text-sm text-dark-300">
          Não foi possível alcançar o diretório ACME ({loadError}). A lista de profiles da CA só fica disponível depois que um admin tem conta ACME — carrega após a primeira emissão SSL.
        </div>
      </div>
    );
  }

  if (!s) {
    return (
      <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
        <div className="px-5 py-3 border-b border-dark-600">
          <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Profile ACME</h3>
        </div>
        <div className="p-5 text-sm text-dark-300">Carregando...</div>
      </div>
    );
  }

  if (s.profiles.length === 0) {
    return (
      <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
        <div className="px-5 py-3 border-b border-dark-600">
          <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Profile ACME</h3>
        </div>
        <div className="p-5 text-sm text-dark-300">
          A CA configurada não anuncia a extensão de profiles ACME — o AxiaPanel vai solicitar o profile padrão da CA.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
      <div className="px-5 py-3 border-b border-dark-600">
        <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Profile ACME</h3>
        <p className="text-xs text-dark-200 mt-0.5">
          Profile padrão para novos certificados Let's Encrypt. A renovação usa as dicas ARI (RFC 9773) da CA, caindo para um limite específico do profile.
        </p>
      </div>
      <div className="p-5 space-y-3">
        <div className="border border-dark-600 bg-dark-900/50 rounded p-4">
          <div className="text-sm font-medium text-dark-50 mb-2">Padrão para novos certificados</div>
          <div className="flex items-center gap-2">
            <select
              value={s.default ?? ""}
              onChange={(e) => setProfile(e.target.value || null)}
              disabled={saving}
              className="flex-1 bg-dark-900 border border-dark-500 text-dark-50 rounded px-3 py-1.5 text-sm disabled:opacity-50"
            >
              <option value="">Padrão da CA</option>
              {s.profiles.map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>
          <p className="text-[10px] text-dark-300 mt-2">
            "Padrão da CA" deixa o Let's Encrypt escolher — hoje é <span className="font-mono">classic</span> (90 dias).
            Certificados existentes mantêm o profile atual até a renovação.
          </p>
        </div>
        <div className="border border-dark-600 bg-dark-900/50 rounded p-4">
          <div className="text-sm font-medium text-dark-50 mb-2">Profiles disponíveis</div>
          <div className="space-y-2">
            {s.profiles.map((p) => (
              <div key={p.name} className="flex items-start gap-2 text-xs">
                <span className="font-mono text-rust-400 min-w-20 shrink-0">{p.name}</span>
                <span className="text-dark-200">{p.description}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

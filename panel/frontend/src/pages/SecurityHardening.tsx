import { useState, useEffect } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";

interface AuditEntry {
  id: string;
  event_type: string;
  actor_email: string | null;
  actor_ip: string | null;
  target_type: string | null;
  target_name: string | null;
  details: string | null;
  geo_country: string | null;
  geo_city: string | null;
  severity: string;
  created_at: string;
}

interface LockdownState {
  active: boolean;
  triggered_by: string | null;
  triggered_at: string | null;
  reason: string | null;
}

interface Recording {
  filename: string;
  size_bytes: number;
  created: string | null;
}

interface PendingUser {
  id: string;
  email: string;
  created_at: string;
}

type Tab = "overview" | "audit" | "lockdown" | "recordings" | "approvals";

export default function SecurityHardening() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("overview");
  const [lockdown, setLockdown] = useState<LockdownState | null>(null);
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([]);
  const [recordings, setRecordings] = useState<Recording[]>([]);
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState({ type: "", text: "" });
  const [pendingConfirm, setPendingConfirm] = useState<{ type: string; label: string } | null>(null);

  if (!user || user.role !== "admin") return <Navigate to="/" replace />;

  const showMsg = (type: string, text: string) => {
    setMessage({ type, text });
    setTimeout(() => setMessage({ type: "", text: "" }), 5000);
  };

  const loadData = async () => {
    try {
      const [lock, audit, recs, pending] = await Promise.all([
        api.get<LockdownState>("/security/lockdown"),
        api.get<AuditEntry[]>("/security/audit-log?limit=50"),
        api.get<{ recordings: Recording[] }>("/security/recordings"),
        api.get<PendingUser[]>("/security/pending-users"),
      ]);
      setLockdown(lock);
      setAuditLog(audit);
      setRecordings(recs.recordings || []);
      setPendingUsers(pending);
    } catch (e) {
      showMsg("error", e instanceof Error ? e.message : "Falha ao carregar dados de segurança");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadData(); }, []);

  const activateLockdown = () => {
    setPendingConfirm({ type: "lockdown", label: "Ativar lockdown do sistema? Isso bloqueará todo acesso não-admin." });
  };

  const deactivateLockdown = async () => {
    try {
      await api.post("/security/lockdown/deactivate", {});
      showMsg("success", "Lockdown desativado");
      loadData();
    } catch (e) { showMsg("error", e instanceof Error ? e.message : "Falha"); }
  };

  const triggerPanic = () => {
    setPendingConfirm({ type: "panic", label: "EMERGÊNCIA: Isso vai encerrar todos os terminais, bloquear não-admins e desabilitar cadastro. Continuar?" });
  };

  const executeConfirm = async () => {
    if (!pendingConfirm) return;
    const { type } = pendingConfirm;
    setPendingConfirm(null);
    try {
      if (type === "lockdown") {
        await api.post("/security/lockdown/activate", { reason: "Lockdown manual do admin" });
        showMsg("success", "Lockdown ativado");
      } else if (type === "panic") {
        await api.post("/security/panic", {});
        showMsg("success", "Modo pânico ativado — todos os terminais encerrados, sistema bloqueado");
      }
      loadData();
    } catch (e) { showMsg("error", e instanceof Error ? e.message : "Falha"); }
  };

  const triggerSnapshot = async () => {
    try {
      const result = await api.post<{ snapshot_dir: string }>("/security/forensic-snapshot", {});
      showMsg("success", `Snapshot forense salvo em ${result.snapshot_dir}`);
    } catch (e) { showMsg("error", e instanceof Error ? e.message : "Falha"); }
  };

  const approveUser = async (id: string) => {
    try {
      await api.post(`/security/users/${id}/approve`, {});
      showMsg("success", "Usuário aprovado");
      loadData();
    } catch (e) { showMsg("error", e instanceof Error ? e.message : "Falha"); }
  };

  const severityColor = (s: string) => {
    if (s === "critical") return "text-danger-400 bg-danger-500/10";
    if (s === "warning") return "text-warn-400 bg-warn-500/10";
    return "text-accent-400 bg-accent-500/10";
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: "overview", label: "Visão Geral" },
    { key: "lockdown", label: "Lockdown" },
    { key: "audit", label: "Log de Auditoria" },
    { key: "recordings", label: "Gravações" },
    { key: "approvals", label: "Aprovações" },
  ];

  if (loading) return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-dark-600 border-t-rust-500 rounded-full animate-spin" /></div>;

  return (
    <div className="p-6 lg:p-8">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-6 pb-4 border-b border-dark-600">
        <h1 className="text-sm font-medium text-dark-300 uppercase font-mono tracking-widest">Hardening de Segurança</h1>
        <div className="flex gap-2">
          <button onClick={triggerSnapshot} className="px-3 py-1.5 text-xs font-mono bg-dark-700 hover:bg-dark-600 text-dark-200 rounded-lg border border-dark-500">
            Snapshot Forense
          </button>
          <button onClick={triggerPanic} className="px-3 py-1.5 text-xs font-mono bg-danger-500 hover:bg-danger-600 text-white rounded-lg">
            Botão de Pânico
          </button>
        </div>
      </div>

      {message.text && (
        <div className={`mb-4 px-4 py-3 rounded-lg text-sm border ${message.type === "success" ? "bg-rust-500/10 text-rust-400 border-rust-500/20" : "bg-danger-500/10 text-danger-400 border-danger-500/20"}`}>
          {message.text}
        </div>
      )}

      {/* Inline confirmation bar */}
      {pendingConfirm && (
        <div className="mb-4 px-4 py-3 rounded-lg border flex items-center justify-between border-danger-500/30 bg-danger-500/5">
          <span className="text-xs font-mono text-danger-400">
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

      {/* Tabs */}
      <div className="flex gap-6 mb-6 text-sm font-mono border-b border-dark-700 overflow-x-auto">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)}
            className={`pb-2 whitespace-nowrap ${tab === t.key ? "border-b-2 border-rust-500 text-dark-50" : "text-dark-400 hover:text-dark-200"}`}>
            {t.label}
            {t.key === "approvals" && pendingUsers.length > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 text-[10px] bg-rust-500 text-white rounded-full">{pendingUsers.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* Overview Tab */}
      {tab === "overview" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="bg-dark-800 rounded-lg border border-dark-500 p-5">
            <p className="text-xs font-mono text-dark-400 mb-2">Status do Lockdown</p>
            <div className={`text-lg font-bold ${lockdown?.active ? "text-danger-400" : "text-rust-400"}`}>
              {lockdown?.active ? "ATIVO" : "Inativo"}
            </div>
            {lockdown?.active && <p className="text-xs text-dark-400 mt-1">{lockdown.reason}</p>}
          </div>
          <div className="bg-dark-800 rounded-lg border border-dark-500 p-5">
            <p className="text-xs font-mono text-dark-400 mb-2">Eventos de Auditoria (24h)</p>
            <div className="text-lg font-bold text-dark-50">{auditLog.length}</div>
          </div>
          <div className="bg-dark-800 rounded-lg border border-dark-500 p-5">
            <p className="text-xs font-mono text-dark-400 mb-2">Gravações de Terminal</p>
            <div className="text-lg font-bold text-dark-50">{recordings.length}</div>
          </div>
          <div className="bg-dark-800 rounded-lg border border-dark-500 p-5">
            <p className="text-xs font-mono text-dark-400 mb-2">Aprovações Pendentes</p>
            <div className={`text-lg font-bold ${pendingUsers.length > 0 ? "text-warn-400" : "text-dark-50"}`}>
              {pendingUsers.length}
            </div>
          </div>

          {/* Recent critical events */}
          <div className="col-span-full bg-dark-800 rounded-lg border border-dark-500 p-5">
            <p className="text-xs font-mono text-dark-400 mb-3 uppercase">Eventos Críticos Recentes</p>
            {auditLog.filter(e => e.severity === "critical" || e.severity === "warning").length === 0 ? (
              <p className="text-sm text-dark-500">Nenhum evento crítico</p>
            ) : (
              <div className="space-y-2">
                {auditLog.filter(e => e.severity === "critical" || e.severity === "warning").slice(0, 10).map(e => (
                  <div key={e.id} className="flex items-center gap-3 text-sm">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${severityColor(e.severity)}`}>{e.severity}</span>
                    <span className="text-dark-200 font-mono">{e.event_type}</span>
                    <span className="text-dark-400">{e.actor_email || "-"}</span>
                    <span className="text-dark-500 ml-auto text-xs">{new Date(e.created_at).toLocaleString()}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Lockdown Tab */}
      {tab === "lockdown" && (
        <div className="space-y-4">
          <div className={`bg-dark-800 rounded-lg border p-6 ${lockdown?.active ? "border-danger-500/50" : "border-dark-500"}`}>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="text-dark-50 font-medium">Lockdown do Sistema</h3>
                <p className="text-sm text-dark-400 mt-1">
                  {lockdown?.active
                    ? `Lockdown ativo desde ${lockdown.triggered_at ? new Date(lockdown.triggered_at).toLocaleString() : "desconhecido"}`
                    : "Sistema operando normalmente"}
                </p>
                {lockdown?.reason && <p className="text-sm text-warn-400 mt-1">{lockdown.reason}</p>}
              </div>
              {lockdown?.active ? (
                <button onClick={deactivateLockdown} className="px-4 py-2 text-sm font-mono bg-rust-500 hover:bg-rust-600 text-white rounded-lg">
                  Desbloquear Sistema
                </button>
              ) : (
                <button onClick={activateLockdown} className="px-4 py-2 text-sm font-mono bg-warn-500 hover:bg-warn-600 text-white rounded-lg">
                  Ativar Lockdown
                </button>
              )}
            </div>
            <div className="text-xs text-dark-500 space-y-1">
              <p>Quando bloqueado: terminais desabilitados, cadastro bloqueado, logins não-admin bloqueados</p>
              <p>Expira automaticamente após 24 horas. O botão de pânico também ativa o lockdown.</p>
            </div>
          </div>
        </div>
      )}

      {/* Audit Log Tab */}
      {tab === "audit" && (
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-600 text-left text-xs font-mono text-dark-400 uppercase">
                <th className="px-4 py-3">Severidade</th>
                <th className="px-4 py-3">Evento</th>
                <th className="px-4 py-3">Ator</th>
                <th className="px-4 py-3">IP</th>
                <th className="px-4 py-3">Localização</th>
                <th className="px-4 py-3">Detalhes</th>
                <th className="px-4 py-3">Quando</th>
              </tr>
            </thead>
            <tbody>
              {auditLog.map(e => (
                <tr key={e.id} className="border-b border-dark-700 hover:bg-dark-750">
                  <td className="px-4 py-2.5">
                    <span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${severityColor(e.severity)}`}>{e.severity}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-dark-200">{e.event_type}</td>
                  <td className="px-4 py-2.5 text-dark-300">{e.actor_email || "-"}</td>
                  <td className="px-4 py-2.5 text-dark-400 font-mono text-xs">{e.actor_ip || "-"}</td>
                  <td className="px-4 py-2.5 text-dark-400 text-xs">
                    {e.geo_country ? `${e.geo_country}${e.geo_city ? `, ${e.geo_city}` : ""}` : "-"}
                  </td>
                  <td className="px-4 py-2.5 text-dark-400 text-xs max-w-[200px] truncate">{e.details || "-"}</td>
                  <td className="px-4 py-2.5 text-dark-500 text-xs whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                </tr>
              ))}
              {auditLog.length === 0 && (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-dark-500">Nenhum evento de auditoria ainda</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Recordings Tab */}
      {tab === "recordings" && (
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-dark-600 text-left text-xs font-mono text-dark-400 uppercase">
                <th className="px-4 py-3">Arquivo</th>
                <th className="px-4 py-3">Tamanho</th>
                <th className="px-4 py-3">Criado</th>
              </tr>
            </thead>
            <tbody>
              {recordings.map((r, i) => (
                <tr key={i} className="border-b border-dark-700 hover:bg-dark-750">
                  <td className="px-4 py-2.5 font-mono text-dark-200">{r.filename}</td>
                  <td className="px-4 py-2.5 text-dark-400">{(r.size_bytes / 1024).toFixed(1)} KB</td>
                  <td className="px-4 py-2.5 text-dark-500 text-xs">{r.created || "-"}</td>
                </tr>
              ))}
              {recordings.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-dark-500">Nenhuma gravação ainda. Gravações são criadas quando sessões de terminal iniciam.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Approvals Tab */}
      {tab === "approvals" && (
        <div className="space-y-4">
          <p className="text-sm text-dark-400">
            Usuários aguardando aprovação do admin. Habilite o modo de aprovação em Configurações &gt; Segurança.
          </p>
          <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-dark-600 text-left text-xs font-mono text-dark-400 uppercase">
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">Cadastrado em</th>
                  <th className="px-4 py-3">Ações</th>
                </tr>
              </thead>
              <tbody>
                {pendingUsers.map(u => (
                  <tr key={u.id} className="border-b border-dark-700">
                    <td className="px-4 py-2.5 text-dark-200">{u.email}</td>
                    <td className="px-4 py-2.5 text-dark-400 text-xs">{new Date(u.created_at).toLocaleString()}</td>
                    <td className="px-4 py-2.5">
                      <button onClick={() => approveUser(u.id)}
                        className="px-3 py-1 text-xs font-mono bg-rust-500 hover:bg-rust-600 text-white rounded">
                        Aprovar
                      </button>
                    </td>
                  </tr>
                ))}
                {pendingUsers.length === 0 && (
                  <tr><td colSpan={3} className="px-4 py-8 text-center text-dark-500">Nenhuma aprovação pendente</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

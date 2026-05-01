import { useAuth } from "../context/AuthContext";
import { Navigate } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { api, ApiError } from "../api";
import { useServer, type Server } from "../context/ServerContext";

interface CreateForm {
  name: string;
  ip_address: string;
}

interface SshForm {
  name: string;
  host: string;
  port: string;
  user: string;
  private_key: string;
  passphrase: string;
}

export default function Servers() {
  const { user } = useAuth();
  if (!user || user.role !== "admin") return <Navigate to="/" replace />;
  const { servers, refreshServers } = useServer();
  const [creating, setCreating] = useState(false);
  const [createMode, setCreateMode] = useState<"manual" | "ssh">("ssh");
  const [form, setForm] = useState<CreateForm>({ name: "", ip_address: "" });
  const [sshForm, setSshForm] = useState<SshForm>({
    name: "",
    host: "",
    port: "22",
    user: "root",
    private_key: "",
    passphrase: "",
  });
  const [bootstrapping, setBootstrapping] = useState(false);
  const [bootstrapStatus, setBootstrapStatus] = useState<string>("");
  const [installScript, setInstallScript] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: "", ip_address: "", agent_url: "" });
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [pendingRotate, setPendingRotate] = useState<{ id: string; name: string } | null>(null);
  const [rotateResult, setRotateResult] = useState<Record<string, string>>({});

  const handleCreate = useCallback(async () => {
    if (!form.name.trim()) return;
    setError("");
    try {
      const res = await api.post<{ install_script: string; id: string }>("/servers", {
        name: form.name.trim(),
        ip_address: form.ip_address.trim() || undefined,
      });
      setInstallScript(res.install_script);
      setForm({ name: "", ip_address: "" });
      await refreshServers();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao criar servidor");
    }
  }, [form, refreshServers]);

  const handleBootstrapSsh = useCallback(async () => {
    if (!sshForm.name.trim() || !sshForm.host.trim() || !sshForm.private_key.trim()) {
      setError("Preencha nome, host e chave privada SSH");
      return;
    }
    setError("");
    setBootstrapping(true);
    setBootstrapStatus("Conectando via SSH e instalando o agent (isso leva 1-3 min)...");
    try {
      const res = await api.post<{ id: string; name: string; cert_fingerprint: string; message: string }>(
        "/servers/bootstrap-ssh",
        {
          name: sshForm.name.trim(),
          host: sshForm.host.trim(),
          port: parseInt(sshForm.port) || 22,
          user: sshForm.user.trim() || "root",
          private_key: sshForm.private_key,
          passphrase: sshForm.passphrase || undefined,
        },
      );
      setBootstrapStatus(`✓ ${res.message} — fingerprint: ${res.cert_fingerprint.slice(0, 16)}...`);
      setSshForm({ name: "", host: "", port: "22", user: "root", private_key: "", passphrase: "" });
      await refreshServers();
      setTimeout(() => {
        setCreating(false);
        setBootstrapStatus("");
      }, 2500);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha no bootstrap SSH");
      setBootstrapStatus("");
    } finally {
      setBootstrapping(false);
    }
  }, [sshForm, refreshServers]);

  const handleDelete = useCallback((id: string, name: string) => {
    setPendingDelete({ id, name });
  }, []);

  const executeDelete = useCallback(async () => {
    if (!pendingDelete) return;
    setPendingDelete(null);
    try {
      await api.delete(`/servers/${pendingDelete.id}`);
      await refreshServers();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao excluir servidor");
    }
  }, [refreshServers]);

  const executeRotate = useCallback(async () => {
    if (!pendingRotate) return;
    const { id } = pendingRotate;
    setPendingRotate(null);
    try {
      await api.post(`/servers/${id}/rotate-cert-pin`);
      setRotateResult((prev) => ({ ...prev, [id]: "Pin limpo — o próximo checkin do agent vai recapturar." }));
      await refreshServers();
    } catch (e) {
      setRotateResult((prev) => ({ ...prev, [id]: e instanceof ApiError ? e.message : "Falha na rotação" }));
    }
  }, [pendingRotate, refreshServers]);

  const handleTest = useCallback(async (id: string) => {
    setTesting(id);
    setTestResult((prev) => ({ ...prev, [id]: "testando" }));
    try {
      const res = await api.post<{ status: string; version: string }>(`/servers/${id}/test`);
      setTestResult((prev) => ({ ...prev, [id]: `Online (v${res.version})` }));
      await refreshServers();
    } catch (e) {
      setTestResult((prev) => ({ ...prev, [id]: e instanceof ApiError ? e.message : "Falha na conexão" }));
    } finally {
      setTesting(null);
    }
  }, [refreshServers]);

  const startEdit = (s: Server) => {
    setEditing(s.id);
    setEditForm({ name: s.name, ip_address: s.ip_address || "", agent_url: s.agent_url || "" });
  };

  const handleEdit = useCallback(async (id: string) => {
    setError("");
    try {
      await api.put(`/servers/${id}`, {
        name: editForm.name.trim() || undefined,
        ip_address: editForm.ip_address.trim() || undefined,
        agent_url: editForm.agent_url.trim() || undefined,
      });
      setEditing(null);
      await refreshServers();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao atualizar servidor");
    }
  }, [editForm, refreshServers]);

  const formatUptime = (secs: number | null) => {
    if (!secs) return "-";
    const days = Math.floor(secs / 86400);
    const hours = Math.floor((secs % 86400) / 3600);
    return days > 0 ? `${days}d ${hours}h` : `${hours}h`;
  };

  const relTime = (iso: string | null): string => {
    if (!iso) return "nunca";
    const secs = (Date.now() - new Date(iso).getTime()) / 1000;
    if (secs < 0) return "agora";
    if (secs < 60) return `há ${Math.round(secs)}s`;
    if (secs < 3600) return `há ${Math.round(secs / 60)}m`;
    if (secs < 86400) return `há ${(secs / 3600).toFixed(1)}h`;
    return `há ${(secs / 86400).toFixed(1)}d`;
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Servidores</h1>
          <p className="page-header-subtitle">Gerencie servidores locais e remotos</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setCreating(!creating); setInstallScript(null); setError(""); }}
            className="px-4 py-2 bg-rust-500 text-dark-950 rounded-lg text-sm font-bold hover:bg-rust-400 transition-colors"
          >
            + Adicionar Servidor
          </button>
        </div>
      </div>

      <div className="p-6 space-y-6">

      {error && (
        <div className="px-4 py-3 bg-danger-500/10 border border-danger-500/30 rounded-lg text-sm text-danger-400">{error}</div>
      )}

      {pendingDelete && (
        <div className="border border-danger-500/30 bg-danger-500/5 rounded-lg px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-danger-400 font-mono">Excluir servidor "{pendingDelete.name}"? Todos os sites, bancos de dados e apps serão removidos.</span>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button onClick={executeDelete} className="px-3 py-1.5 bg-danger-500 text-white text-xs font-bold uppercase tracking-wider hover:bg-danger-400 transition-colors">Confirmar</button>
            <button onClick={() => setPendingDelete(null)} className="px-3 py-1.5 bg-dark-600 text-dark-200 text-xs font-bold uppercase tracking-wider hover:bg-dark-500 transition-colors">Cancelar</button>
          </div>
        </div>
      )}

      {pendingRotate && (
        <div className="border border-warn-500/30 bg-warn-500/5 rounded-lg px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-warn-400 font-mono">Girar TLS pin para "{pendingRotate.name}"? Isso limpa o fingerprint armazenado; o próximo checkin recaptura (janela TOFU). Faça isso apenas após uma rotação legítima do cert do agent.</span>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button onClick={executeRotate} className="px-3 py-1.5 bg-warn-500 text-dark-950 text-xs font-bold uppercase tracking-wider hover:bg-warn-400 transition-colors">Girar</button>
            <button onClick={() => setPendingRotate(null)} className="px-3 py-1.5 bg-dark-600 text-dark-200 text-xs font-bold uppercase tracking-wider hover:bg-dark-500 transition-colors">Cancelar</button>
          </div>
        </div>
      )}

      {creating && (
        <div className="bg-dark-800 border border-dark-600 rounded-lg p-5 space-y-4">
          <h2 className="text-lg font-bold text-dark-50 font-mono">Adicionar Servidor Remoto</h2>

          {/* Mode toggle */}
          <div className="flex gap-2 border-b border-dark-600 pb-3">
            <button
              onClick={() => { setCreateMode("ssh"); setError(""); setInstallScript(null); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                createMode === "ssh" ? "bg-rust-500 text-dark-950" : "bg-dark-700 text-dark-200 hover:bg-dark-600"
              }`}
            >
              Auto-instalar via SSH
            </button>
            <button
              onClick={() => { setCreateMode("manual"); setError(""); setBootstrapStatus(""); }}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                createMode === "manual" ? "bg-rust-500 text-dark-950" : "bg-dark-700 text-dark-200 hover:bg-dark-600"
              }`}
            >
              Manual (gerar comando)
            </button>
          </div>

          {createMode === "ssh" ? (
            <>
              <p className="text-xs text-dark-300">
                O painel conecta via SSH ao servidor com a chave privada fornecida, instala o Docker, baixa o agent
                e configura o systemd automaticamente. A chave NÃO é armazenada — usada apenas durante o bootstrap.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-dark-200 mb-1">Nome do Servidor</label>
                  <input
                    value={sshForm.name}
                    onChange={(e) => setSshForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="prod-web-1"
                    disabled={bootstrapping}
                    className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-dark-50 text-sm focus:border-rust-500 focus:outline-none disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-dark-200 mb-1">Host / IP</label>
                  <input
                    value={sshForm.host}
                    onChange={(e) => setSshForm((f) => ({ ...f, host: e.target.value }))}
                    placeholder="203.0.113.42 ou srv.exemplo.com"
                    disabled={bootstrapping}
                    className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-dark-50 text-sm focus:border-rust-500 focus:outline-none disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-dark-200 mb-1">Porta SSH</label>
                  <input
                    value={sshForm.port}
                    onChange={(e) => setSshForm((f) => ({ ...f, port: e.target.value }))}
                    placeholder="22"
                    disabled={bootstrapping}
                    className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-dark-50 text-sm focus:border-rust-500 focus:outline-none disabled:opacity-50"
                  />
                </div>
                <div>
                  <label className="block text-sm text-dark-200 mb-1">Usuário SSH</label>
                  <input
                    value={sshForm.user}
                    onChange={(e) => setSshForm((f) => ({ ...f, user: e.target.value }))}
                    placeholder="root"
                    disabled={bootstrapping}
                    className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-dark-50 text-sm focus:border-rust-500 focus:outline-none disabled:opacity-50"
                  />
                  <p className="text-[10px] text-dark-400 mt-1">Precisa ser root ou ter sudo NOPASSWD</p>
                </div>
              </div>
              <div>
                <label className="block text-sm text-dark-200 mb-1">Chave Privada SSH (PEM)</label>
                <textarea
                  value={sshForm.private_key}
                  onChange={(e) => setSshForm((f) => ({ ...f, private_key: e.target.value }))}
                  placeholder={"-----BEGIN OPENSSH PRIVATE KEY-----\n...\n-----END OPENSSH PRIVATE KEY-----"}
                  rows={6}
                  disabled={bootstrapping}
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-dark-50 text-xs font-mono focus:border-rust-500 focus:outline-none disabled:opacity-50"
                />
              </div>
              <div>
                <label className="block text-sm text-dark-200 mb-1">Passphrase da chave (opcional)</label>
                <input
                  type="password"
                  value={sshForm.passphrase}
                  onChange={(e) => setSshForm((f) => ({ ...f, passphrase: e.target.value }))}
                  disabled={bootstrapping}
                  className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-dark-50 text-sm focus:border-rust-500 focus:outline-none disabled:opacity-50"
                />
              </div>
              {bootstrapStatus && (
                <div className="px-4 py-3 bg-accent-500/10 border border-accent-500/30 rounded-lg text-sm text-accent-300">
                  {bootstrapping && <span className="inline-block w-3 h-3 mr-2 border-2 border-accent-400 border-t-transparent rounded-full animate-spin" />}
                  {bootstrapStatus}
                </div>
              )}
              <div className="flex gap-3">
                <button
                  onClick={handleBootstrapSsh}
                  disabled={bootstrapping}
                  className="px-4 py-2 bg-rust-500 text-dark-950 rounded-lg text-sm font-bold hover:bg-rust-400 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {bootstrapping ? "Instalando..." : "Adicionar e Instalar Agent"}
                </button>
                <button
                  onClick={() => setCreating(false)}
                  disabled={bootstrapping}
                  className="px-4 py-2 bg-dark-700 text-dark-200 rounded-lg text-sm hover:bg-dark-600 transition-colors disabled:opacity-50"
                >
                  Cancelar
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-dark-200 mb-1">Nome do Servidor</label>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="Servidor de Produção"
                    className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-dark-50 text-sm focus:border-rust-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm text-dark-200 mb-1">Endereço IP</label>
                  <input
                    value={form.ip_address}
                    onChange={(e) => setForm((f) => ({ ...f, ip_address: e.target.value }))}
                    placeholder="192.168.1.100"
                    className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-dark-50 text-sm focus:border-rust-500 focus:outline-none"
                  />
                </div>
              </div>
              <div className="flex gap-3">
                <button onClick={handleCreate} className="px-4 py-2 bg-rust-500 text-dark-950 rounded-lg text-sm font-bold hover:bg-rust-400 transition-colors">
                  Criar Servidor
                </button>
                <button onClick={() => setCreating(false)} className="px-4 py-2 bg-dark-700 text-dark-200 rounded-lg text-sm hover:bg-dark-600 transition-colors">
                  Cancelar
                </button>
              </div>

              {installScript && (
                <div className="mt-4 space-y-2">
                  <p className="text-sm text-dark-200">Execute este comando no servidor remoto para instalar o agent AxiaPanel:</p>
                  <div className="relative">
                    <pre className="bg-dark-950 border border-dark-600 rounded-lg p-4 text-sm text-rust-400 font-mono overflow-x-auto whitespace-pre-wrap">{installScript}</pre>
                    <button
                      onClick={() => navigator.clipboard.writeText(installScript)}
                      className="absolute top-2 right-2 px-2 py-1 bg-dark-700 text-dark-200 rounded text-xs hover:bg-dark-600 transition-colors"
                    >
                      Copiar
                    </button>
                  </div>
                  <p className="text-xs text-dark-400">Após a instalação, clique em "Testar" para verificar se o agent está rodando.</p>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Server list */}
      <div className="space-y-3">
        {servers.map((s) => (
          <div key={s.id} className="bg-dark-800 border border-dark-600 rounded-lg p-5 card-interactive">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={`w-3 h-3 rounded-full ${s.status === "online" ? "bg-rust-500" : s.status === "offline" ? "bg-danger-500 animate-pulse" : "bg-dark-400"}`} />
                <div>
                  <h3 className="text-base font-bold text-dark-50 font-mono flex items-center gap-2">
                    {s.name}
                    {s.is_local && <span className="text-[10px] px-2 py-0.5 bg-rust-500/20 text-rust-400 rounded-full uppercase font-bold">Local</span>}
                  </h3>
                  <p className="text-sm text-dark-300 mt-0.5">
                    {s.ip_address || "127.0.0.1"} &middot; {s.status}
                    {s.agent_version && ` &middot; v${s.agent_version}`}
                  </p>
                  <p className="text-[11px] text-dark-400 mt-0.5 font-mono">
                    Visto {relTime(s.last_seen_at)}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!s.is_local && (
                  <>
                    <button
                      onClick={() => startEdit(s)}
                      className="px-3 py-1.5 bg-dark-700 text-dark-200 rounded text-xs font-medium hover:bg-dark-600 transition-colors"
                    >
                      Editar
                    </button>
                    <button
                      onClick={() => handleTest(s.id)}
                      disabled={testing === s.id}
                      className="px-3 py-1.5 bg-dark-700 text-dark-200 rounded text-xs font-medium hover:bg-dark-600 transition-colors disabled:opacity-50"
                    >
                      {testing === s.id ? "Testando..." : "Testar"}
                    </button>
                    <button
                      onClick={() => handleDelete(s.id, s.name)}
                      className="px-3 py-1.5 bg-danger-500/10 text-danger-400 rounded text-xs font-medium hover:bg-danger-500/20 transition-colors"
                    >
                      Excluir
                    </button>
                  </>
                )}
              </div>
            </div>

            {testResult[s.id] && (
              <div className={`mt-3 px-3 py-2 rounded text-sm ${testResult[s.id].startsWith("Online") ? "bg-rust-500/10 text-rust-400" : testResult[s.id] === "testing" ? "bg-dark-700 text-dark-300" : "bg-danger-500/10 text-danger-400"}`}>
                {testResult[s.id]}
              </div>
            )}

            {editing === s.id && (
              <div className="mt-3 p-3 bg-dark-900/50 rounded-lg space-y-3">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs text-dark-300 mb-1">Nome</label>
                    <input value={editForm.name} onChange={(e) => setEditForm((f) => ({ ...f, name: e.target.value }))} className="w-full px-2 py-1.5 bg-dark-900 border border-dark-600 rounded text-dark-50 text-sm focus:border-rust-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-dark-300 mb-1">Endereço IP</label>
                    <input value={editForm.ip_address} onChange={(e) => setEditForm((f) => ({ ...f, ip_address: e.target.value }))} className="w-full px-2 py-1.5 bg-dark-900 border border-dark-600 rounded text-dark-50 text-sm focus:border-rust-500 focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-xs text-dark-300 mb-1">URL do Agent</label>
                    <input value={editForm.agent_url} onChange={(e) => setEditForm((f) => ({ ...f, agent_url: e.target.value }))} placeholder="https://ip:9443" className="w-full px-2 py-1.5 bg-dark-900 border border-dark-600 rounded text-dark-50 text-sm focus:border-rust-500 focus:outline-none" />
                  </div>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleEdit(s.id)} className="px-3 py-1.5 bg-rust-500 text-dark-950 rounded text-xs font-bold hover:bg-rust-400 transition-colors">Salvar</button>
                  <button onClick={() => setEditing(null)} className="px-3 py-1.5 bg-dark-700 text-dark-200 rounded text-xs hover:bg-dark-600 transition-colors">Cancelar</button>
                </div>
              </div>
            )}

            {/* Metrics row */}
            {s.status === "online" && (s.cpu_cores || s.ram_mb) && (
              <div className="mt-3 flex gap-6 text-xs text-dark-300 font-mono">
                {s.cpu_cores && <span>CPU: {s.cpu_cores} núcleos{s.cpu_usage != null ? ` (${s.cpu_usage.toFixed(0)}%)` : ""}</span>}
                {s.ram_mb && <span>RAM: {(s.ram_mb / 1024).toFixed(1)} GB{s.mem_used_mb != null ? ` (${((s.mem_used_mb / s.ram_mb) * 100).toFixed(0)}%)` : ""}</span>}
                {s.disk_gb && <span>Disco: {s.disk_gb} GB</span>}
                {s.uptime_secs && <span>Uptime: {formatUptime(s.uptime_secs)}</span>}
              </div>
            )}

            <UptimeStrip serverId={s.id} />


            {/* TLS cert pin (remote servers only) */}
            {!s.is_local && (
              <div className="mt-3 pt-3 border-t border-dark-700 flex items-center justify-between gap-3 text-xs font-mono">
                <div className="min-w-0 flex-1">
                  <span className="text-dark-300 uppercase tracking-widest text-[10px]">TLS pin</span>
                  {s.cert_fingerprint ? (
                    <span className="ml-2 text-dark-100 break-all" title={`SHA-256 do cert TLS de entrada do agent — capturado no primeiro checkin (TOFU). Completo: ${s.cert_fingerprint}`}>
                      {s.cert_fingerprint.slice(0, 16)}…{s.cert_fingerprint.slice(-16)}
                    </span>
                  ) : (
                    <span className="ml-2 text-warn-400">ainda não capturado</span>
                  )}
                </div>
                <button
                  onClick={() => setPendingRotate({ id: s.id, name: s.name })}
                  className="px-3 py-1 bg-dark-700 text-dark-200 rounded text-[11px] hover:bg-dark-600 transition-colors whitespace-nowrap"
                  title="Limpa o pin para que o próximo checkin do agent o recapture. Use após girar legitimamente o cert do agent."
                >
                  Girar pin
                </button>
              </div>
            )}
            {rotateResult[s.id] && (
              <div className="mt-2 px-3 py-2 rounded text-xs bg-rust-500/10 text-rust-400 font-mono">
                {rotateResult[s.id]}
              </div>
            )}
          </div>
        ))}

        {servers.length === 0 && (
          <div className="text-center py-12 text-dark-300 text-sm">
            Nenhum servidor encontrado. O servidor local deve aparecer automaticamente.
          </div>
        )}
      </div>
      </div>
    </div>
  );
}

interface UptimeData {
  buckets: boolean[];
  window_hours: number;
  bucket_minutes: number;
}

function UptimeStrip({ serverId }: { serverId: string }) {
  const [data, setData] = useState<UptimeData | null>(null);

  useEffect(() => {
    let cancelled = false;
    api.get<UptimeData>(`/servers/${serverId}/uptime`)
      .then((d) => { if (!cancelled) setData(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [serverId]);

  if (!data) return null;

  const total = data.buckets.length;
  const onlineCount = data.buckets.filter(Boolean).length;
  const onlinePct = total > 0 ? (onlineCount / total) * 100 : 0;

  return (
    <div className="mt-3 pt-3 border-t border-dark-700">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[10px] uppercase tracking-widest text-dark-300">
          Uptime · últimas {data.window_hours}h
        </span>
        <span className="text-xs font-mono text-dark-100">
          {onlinePct.toFixed(1)}%
        </span>
      </div>
      <div className="flex gap-px h-3">
        {data.buckets.map((up, i) => {
          const minutesAgoEnd = (total - 1 - i) * data.bucket_minutes;
          const minutesAgoStart = minutesAgoEnd + data.bucket_minutes;
          const label = minutesAgoEnd === 0
            ? `agora: ${up ? "online" : "sem dados"}`
            : `há ${minutesAgoStart}–${minutesAgoEnd} min: ${up ? "online" : "sem dados"}`;
          return (
            <div
              key={i}
              className={`flex-1 rounded-sm ${up ? "bg-rust-500/70" : "bg-dark-600"}`}
              title={label}
            />
          );
        })}
      </div>
    </div>
  );
}

import { useAuth } from "../context/AuthContext";
import { Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { api } from "../api";
import ProvisionLog from "../components/ProvisionLog";

interface GitDeploy {
  id: string;
  name: string;
  repo_url: string;
  branch: string;
  dockerfile: string;
  container_port: number;
  host_port: number;
  domain: string | null;
  env_vars: Record<string, string>;
  auto_deploy: boolean;
  webhook_secret: string;
  deploy_key_public: string | null;
  deploy_key_path: string | null;
  container_id: string | null;
  image_tag: string | null;
  status: string;
  memory_mb: number | null;
  cpu_percent: number | null;
  ssl_email: string | null;
  pre_build_cmd: string | null;
  post_deploy_cmd: string | null;
  build_args: Record<string, string>;
  build_context: string;
  last_deploy: string | null;
  last_commit: string | null;
  created_at: string;
  github_token: string | null;
  deploy_cron: string | null;
  deploy_protected: boolean;
  build_method: string;
  preview_ttl_hours: number;
}

interface GitPreview {
  id: string;
  git_deploy_id: string;
  branch: string;
  container_name: string;
  container_id: string | null;
  host_port: number;
  domain: string | null;
  status: string;
  commit_hash: string | null;
  created_at: string;
}

interface DeployHistory {
  id: string;
  git_deploy_id: string;
  commit_hash: string;
  commit_message: string | null;
  image_tag: string;
  status: string;
  output: string | null;
  triggered_by: string;
  duration_ms: number | null;
  created_at: string;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    pending: "bg-dark-700 text-dark-200",
    deploying: "bg-warn-500/15 text-warn-400 animate-pulse",
    running: "bg-rust-500/15 text-rust-400",
    failed: "bg-danger-500/15 text-danger-400",
    stopped: "bg-dark-700 text-dark-300",
  };
  return map[status] || "bg-dark-700 text-dark-200";
}

export default function GitDeploys() {
  const { user } = useAuth();
  if (!user || user.role !== "admin") return <Navigate to="/" replace />;
  const [deploys, setDeploys] = useState<GitDeploy[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<GitDeploy | null>(null);
  const [history, setHistory] = useState<DeployHistory[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });
  const [deployId, setDeployId] = useState<string | null>(null);
  const [deploying, setDeploying] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [showDeployKey, setShowDeployKey] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showEnvPaste, setShowEnvPaste] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [containerLogs, setContainerLogs] = useState("");
  const [previews, setPreviews] = useState<GitPreview[]>([]);
  const [pendingConfirm, setPendingConfirm] = useState<{ type: string; id: string; label: string } | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formRepo, setFormRepo] = useState("");
  const [formBranch, setFormBranch] = useState("main");
  const [formDockerfile, setFormDockerfile] = useState("Dockerfile");
  const [formPort, setFormPort] = useState(3000);
  const [formDomain, setFormDomain] = useState("");
  const [formEnvVars, setFormEnvVars] = useState<{ key: string; value: string }[]>([]);
  const [formAutoDeploy, setFormAutoDeploy] = useState(false);
  const [formSslEmail, setFormSslEmail] = useState("");
  const [formPreBuild, setFormPreBuild] = useState("");
  const [formPostDeploy, setFormPostDeploy] = useState("");
  const [formBuildArgs, setFormBuildArgs] = useState<{ key: string; value: string }[]>([]);
  const [formBuildContext, setFormBuildContext] = useState(".");
  const [formGithubToken, setFormGithubToken] = useState("");
  const [formCron, setFormCron] = useState("");
  const [formProtected, setFormProtected] = useState(false);
  const [formPreviewTtl, setFormPreviewTtl] = useState(24);

  const loadDeploys = async () => {
    try {
      const data = await api.get<GitDeploy[]>("/git-deploys");
      setDeploys(data);
      // Refresh selected if still exists
      if (selected) {
        const updated = data.find((d) => d.id === selected.id);
        if (updated) setSelected(updated);
        else setSelected(null);
      }
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Falha ao carregar deploys", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (id: string) => {
    try {
      const data = await api.get<DeployHistory[]>(`/git-deploys/${id}/history`);
      setHistory(data);
    } catch {
      setHistory([]);
    }
  };

  useEffect(() => {
    loadDeploys();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selected) { loadHistory(selected.id); loadPreviews(selected.id); }
    else { setHistory([]); setPreviews([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const resetForm = () => {
    setFormName("");
    setFormRepo("");
    setFormBranch("main");
    setFormDockerfile("Dockerfile");
    setFormPort(3000);
    setFormDomain("");
    setFormEnvVars([]);
    setFormAutoDeploy(false);
    setFormSslEmail("");
    setFormPreBuild("");
    setFormPostDeploy("");
    setFormBuildArgs([]);
    setFormBuildContext(".");
    setFormGithubToken("");
    setFormCron("");
    setFormProtected(false);
  };

  const openCreate = () => {
    resetForm();
    setEditing(false);
    setShowModal(true);
  };

  const openEdit = () => {
    if (!selected) return;
    setFormName(selected.name);
    setFormRepo(selected.repo_url);
    setFormBranch(selected.branch);
    setFormDockerfile(selected.dockerfile);
    setFormPort(selected.container_port);
    setFormDomain(selected.domain || "");
    setFormEnvVars(
      Object.entries(selected.env_vars).map(([key, value]) => ({ key, value }))
    );
    setFormAutoDeploy(selected.auto_deploy);
    setFormSslEmail(selected.ssl_email || "");
    setFormPreBuild(selected.pre_build_cmd || "");
    setFormPostDeploy(selected.post_deploy_cmd || "");
    setFormBuildArgs(
      Object.entries(selected.build_args || {}).map(([key, value]) => ({ key, value }))
    );
    setFormBuildContext(selected.build_context || ".");
    setFormGithubToken(selected.github_token && selected.github_token !== "\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF" ? selected.github_token : "");
    setFormCron(selected.deploy_cron || "");
    setFormProtected(selected.deploy_protected || false);
    setFormPreviewTtl(selected.preview_ttl_hours ?? 24);
    setEditing(true);
    setShowModal(true);
  };

  const handleSave = async () => {
    setSubmitting(true);
    setMessage({ text: "", type: "" });
    const envVars: Record<string, string> = {};
    formEnvVars.forEach((ev) => {
      if (ev.key.trim()) envVars[ev.key.trim()] = ev.value;
    });
    const buildArgs: Record<string, string> = {};
    formBuildArgs.forEach((arg) => {
      if (arg.key.trim()) buildArgs[arg.key.trim()] = arg.value;
    });
    const payload = {
      name: formName,
      repo_url: formRepo,
      branch: formBranch || "main",
      dockerfile: formDockerfile || "Dockerfile",
      container_port: formPort || 3000,
      domain: formDomain.trim() || null,
      env_vars: envVars,
      auto_deploy: formAutoDeploy,
      ssl_email: formSslEmail.trim() || null,
      pre_build_cmd: formPreBuild.trim() || null,
      post_deploy_cmd: formPostDeploy.trim() || null,
      build_args: buildArgs,
      build_context: formBuildContext.trim() || ".",
      github_token: formGithubToken.trim() || null,
      deploy_cron: formCron.trim() || null,
      deploy_protected: formProtected,
      preview_ttl_hours: formPreviewTtl,
    };
    try {
      if (editing && selected) {
        const updated = await api.put<GitDeploy>(`/git-deploys/${selected.id}`, payload);
        setSelected(updated);
        setMessage({ text: "Configuração de deploy atualizada.", type: "success" });
      } else {
        await api.post<GitDeploy>("/git-deploys", payload);
        setMessage({ text: "Deploy criado.", type: "success" });
      }
      setShowModal(false);
      resetForm();
      loadDeploys();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Falha ao salvar", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeploy = async (id: string) => {
    const deploy = deploys.find(d => d.id === id);
    if (deploy?.deploy_protected) {
      setPendingConfirm({ type: "deploy", id, label: `Deploy protegido: "${deploy.name}" para produção` });
      return;
    }
    setDeploying(id);
    setMessage({ text: "", type: "" });
    try {
      const result = await api.post<{ deploy_id: string }>(`/git-deploys/${id}/deploy`);
      if (result.deploy_id) {
        setDeployId(result.deploy_id);
      }
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Falha no deploy", type: "error" });
      setDeploying(null);
    }
  };

  const handleDelete = async (id: string) => {
    setPendingConfirm({ type: "delete", id, label: "Excluir este deploy? O container será removido." });
  };

  const executeDelete = async (id: string) => {
    setMessage({ text: "", type: "" });
    try {
      await api.delete(`/git-deploys/${id}`);
      if (selected?.id === id) setSelected(null);
      setMessage({ text: "Deploy excluído.", type: "success" });
      loadDeploys();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Falha ao excluir", type: "error" });
    }
  };

  const handleRollback = async (historyId: string) => {
    if (!selected) return;
    setPendingConfirm({ type: "rollback", id: historyId, label: "Reverter para este deploy? O container atual será substituído." });
  };

  const executeRollback = async (historyId: string) => {
    if (!selected) return;
    setMessage({ text: "", type: "" });
    try {
      const result = await api.post<{ deploy_id: string }>(`/git-deploys/${selected.id}/rollback/${historyId}`);
      if (result.deploy_id) {
        setDeployId(result.deploy_id);
        setDeploying(selected.id);
      }
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Falha ao reverter", type: "error" });
    }
  };

  const handleKeygen = async () => {
    if (!selected) return;
    setGeneratingKey(true);
    setMessage({ text: "", type: "" });
    try {
      const result = await api.post<{ public_key: string }>(`/git-deploys/${selected.id}/keygen`);
      setMessage({ text: "Deploy key gerada. Adicione-a às deploy keys do seu repositório.", type: "success" });
      setSelected((prev) => prev ? { ...prev, deploy_key_public: result.public_key } : prev);
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Falha ao gerar chave", type: "error" });
    } finally {
      setGeneratingKey(false);
    }
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setMessage({ text: "Copiado para a área de transferência.", type: "success" });
    setTimeout(() => setMessage({ text: "", type: "" }), 2000);
  };

  const loadContainerLogs = async () => {
    if (!selected) return;
    try {
      const data = await api.get<{ logs: string }>(`/git-deploys/${selected.id}/logs`);
      setContainerLogs(data.logs);
    } catch { setContainerLogs("Falha ao carregar logs"); }
  };

  const loadPreviews = async (id: string) => {
    try { const data = await api.get<GitPreview[]>(`/git-deploys/${id}/previews`); setPreviews(data); }
    catch { setPreviews([]); }
  };

  const deletePreview = async (previewId: string) => {
    if (!selected) return;
    setPendingConfirm({ type: "delete-preview", id: previewId, label: "Excluir este deploy de preview?" });
  };

  const executeConfirm = async () => {
    if (!pendingConfirm) return;
    const { type, id } = pendingConfirm;
    setPendingConfirm(null);
    if (type === "deploy") {
      setDeploying(id);
      setMessage({ text: "", type: "" });
      try {
        const result = await api.post<{ deploy_id: string }>(`/git-deploys/${id}/deploy`);
        if (result.deploy_id) setDeployId(result.deploy_id);
      } catch (err) {
        setMessage({ text: err instanceof Error ? err.message : "Falha no deploy", type: "error" });
        setDeploying(null);
      }
    } else if (type === "delete") {
      await executeDelete(id);
    } else if (type === "rollback") {
      await executeRollback(id);
    } else if (type === "delete-preview") {
      if (!selected) return;
      try { await api.delete(`/git-deploys/${selected.id}/previews/${id}`); loadPreviews(selected.id); }
      catch (e) { setMessage({ text: e instanceof Error ? e.message : "Falha ao excluir", type: "error" }); }
    }
  };

  return (
    <div className="animate-fade-up">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Deploy Git</h1>
          <p className="page-header-subtitle">Deploy a partir de repositórios Git</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 transition-colors"
          >
            Novo Deploy
          </button>
        </div>
      </div>

      <div className="p-6 lg:p-8">

      {/* Message */}
      {message.text && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm border ${
            message.type === "success"
              ? "bg-rust-500/10 text-rust-400 border-rust-500/20"
              : "bg-danger-500/10 text-danger-400 border-danger-500/20"
          }`}
          role="alert"
        >
          {message.text}
          <button onClick={() => setMessage({ text: "", type: "" })} className="float-right font-bold" aria-label="Fechar">&times;</button>
        </div>
      )}

      {/* Inline confirmation bar */}
      {pendingConfirm && (
        <div className={`mb-4 px-4 py-3 rounded-lg border flex items-center justify-between ${
          pendingConfirm.type === "deploy" ? "border-warn-500/30 bg-warn-500/5" : "border-danger-500/30 bg-danger-500/5"
        }`}>
          <span className={`text-xs font-mono ${pendingConfirm.type === "deploy" ? "text-warn-400" : "text-danger-400"}`}>
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

      {/* Deploy provisioning log */}
      {deployId && (
        <ProvisionLog
          sseUrl={`/api/git-deploys/deploy/${deployId}/log`}
          onComplete={() => {
            setDeployId(null);
            setDeploying(null);
            loadDeploys();
            if (selected) loadHistory(selected.id);
          }}
        />
      )}

      {/* Deploy list */}
      <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-dark-600 border-t-rust-500 rounded-full animate-spin" />
          </div>
        ) : deploys.length === 0 ? (
          <div className="p-12 text-center">
            <svg className="w-12 h-12 mx-auto text-dark-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
            </svg>
            <p className="text-dark-200 font-medium">Nenhum deploy Git ainda</p>
            <p className="text-dark-300 text-sm mt-2 max-w-md mx-auto">Conecte um repositório Git para builds automáticos e deploys sem downtime com gatilhos por webhook, ambientes de preview e suporte a rollback.</p>
            <button onClick={openCreate} className="mt-3 px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 transition-colors">
              Criar seu primeiro deploy
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-500 bg-dark-900">
                <th scope="col" className="text-left text-xs font-medium text-dark-200 uppercase tracking-widest font-mono px-5 py-3">Nome</th>
                <th scope="col" className="text-left text-xs font-medium text-dark-200 uppercase tracking-widest font-mono px-5 py-3 hidden md:table-cell">Repositório</th>
                <th scope="col" className="text-left text-xs font-medium text-dark-200 uppercase tracking-widest font-mono px-5 py-3 hidden sm:table-cell">Branch</th>
                <th scope="col" className="text-left text-xs font-medium text-dark-200 uppercase tracking-widest font-mono px-5 py-3 hidden lg:table-cell">Domínio</th>
                <th scope="col" className="text-left text-xs font-medium text-dark-200 uppercase tracking-widest font-mono px-5 py-3">Status</th>
                <th scope="col" className="text-left text-xs font-medium text-dark-200 uppercase tracking-widest font-mono px-5 py-3 hidden lg:table-cell">Último Deploy</th>
                <th scope="col" className="text-right text-xs font-medium text-dark-200 uppercase tracking-widest font-mono px-5 py-3">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-600">
              {deploys.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => setSelected(selected?.id === d.id ? null : d)}
                  className={`cursor-pointer transition-colors ${
                    selected?.id === d.id ? "bg-dark-700/50" : "hover:bg-dark-700/30"
                  }`}
                >
                  <td className="px-5 py-4 text-sm font-medium text-dark-50 font-mono">
                    {d.name}
                    {d.deploy_protected && (
                      <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-warn-500/15 text-warn-400" title="Proteção de deploy habilitada">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" /></svg>
                        Protegido
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-sm text-dark-200 font-mono truncate max-w-xs hidden md:table-cell">
                    {d.repo_url.replace(/^https?:\/\//, "").replace(/\.git$/, "")}
                  </td>
                  <td className="px-5 py-4 text-sm text-dark-200 font-mono hidden sm:table-cell">{d.branch}</td>
                  <td className="px-5 py-4 text-sm text-dark-200 font-mono hidden lg:table-cell">{d.domain || "\u2014"}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadge(d.status)}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-dark-200 hidden lg:table-cell">
                    {d.last_deploy ? new Date(d.last_deploy).toLocaleString() : "\u2014"}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleDeploy(d.id)}
                        disabled={deploying === d.id}
                        className="px-3 py-1 bg-rust-500/15 text-rust-400 rounded-md text-xs font-medium hover:bg-rust-500/25 disabled:opacity-50 transition-colors"
                      >
                        {deploying === d.id ? "Deployando..." : "Deploy"}
                      </button>
                      <button
                        onClick={() => handleDelete(d.id)}
                        className="px-3 py-1 bg-danger-500/10 text-danger-400 rounded-md text-xs font-medium hover:bg-danger-500/20 transition-colors"
                      >
                        Excluir
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail panel */}
      {selected && (
        <div className="mt-6 space-y-6 animate-fade-up">
          {/* Config section */}
          <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
            <div className="px-5 py-4 border-b border-dark-600 flex items-center justify-between">
              <h2 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Configuração</h2>
              <button
                onClick={openEdit}
                className="px-3 py-1 bg-dark-700 text-dark-100 rounded-md text-xs font-medium hover:bg-dark-600 transition-colors"
              >
                Editar
              </button>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { label: "Nome", value: selected.name },
                  { label: "Reposit\u00f3rio", value: selected.repo_url },
                  { label: "Branch", value: selected.branch },
                  { label: "Dockerfile", value: selected.dockerfile },
                  { label: "Porta do Container", value: String(selected.container_port) },
                  { label: "Porta do Host", value: String(selected.host_port) },
                  { label: "Dom\u00ednio", value: selected.domain || "\u2014" },
                  { label: "Auto-deploy", value: selected.auto_deploy ? "Habilitado" : "Desabilitado" },
                  { label: "Status", value: selected.status },
                  { label: "\u00daltimo Commit", value: selected.last_commit ? selected.last_commit.substring(0, 8) : "\u2014" },
                  { label: "Limite de Mem\u00f3ria", value: selected.memory_mb ? `${selected.memory_mb} MB` : "Nenhum" },
                  { label: "Limite de CPU", value: selected.cpu_percent ? `${selected.cpu_percent}%` : "Nenhum" },
                  { label: "E-mail SSL", value: selected.ssl_email || "\u2014" },
                  { label: "Comando Pr\u00e9-build", value: selected.pre_build_cmd || "\u2014" },
                  { label: "Comando P\u00f3s-deploy", value: selected.post_deploy_cmd || "\u2014" },
                  { label: "M\u00e9todo de Build", value: selected.build_method === "nixpacks" ? "Nixpacks" : selected.build_method === "auto-detect" ? "Auto-detectar" : selected.build_method === "compose" ? "Docker Compose" : "Dockerfile" },
                  { label: "TTL de Preview", value: selected.preview_ttl_hours > 0 ? `${selected.preview_ttl_hours}h` : "Sem limpeza autom\u00e1tica" },
                  { label: "Build Context", value: selected.build_context || "." },
                  { label: "GitHub", value: selected.github_token ? "Conectado" : "N\u00e3o configurado" },
                  { label: "Agendamento de Deploy", value: selected.deploy_cron || "\u2014" },
                  { label: "Prote\u00e7\u00e3o de Deploy", value: selected.deploy_protected ? "Habilitado" : "Desabilitado" },
                ].map((field) => (
                  <div key={field.label}>
                    <span className="block text-xs font-medium text-dark-300 mb-0.5">{field.label}</span>
                    <span className="text-sm text-dark-50 font-mono break-all">{field.value}</span>
                  </div>
                ))}
              </div>
              {Object.keys(selected.env_vars).length > 0 && (
                <div className="mt-4">
                  <span className="block text-xs font-medium text-dark-300 mb-1">Variáveis de Ambiente</span>
                  <div className="bg-dark-900 border border-dark-500 rounded-lg p-3 space-y-1">
                    {Object.entries(selected.env_vars).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2 text-xs font-mono">
                        <span className="text-dark-100">{k}</span>
                        <span className="text-dark-300">=</span>
                        <span className="text-dark-200">{"*".repeat(Math.min(v.length, 12))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {Object.keys(selected.build_args || {}).length > 0 && (
                <div className="mt-4">
                  <span className="block text-xs font-medium text-dark-300 mb-1">Argumentos de Build</span>
                  <div className="bg-dark-900 border border-dark-500 rounded-lg p-3 space-y-1">
                    {Object.entries(selected.build_args).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2 text-xs font-mono">
                        <span className="text-dark-100">{k}</span>
                        <span className="text-dark-300">=</span>
                        <span className="text-dark-200">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Actions bar */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleDeploy(selected.id)}
              disabled={deploying === selected.id}
              className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {deploying === selected.id && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {deploying === selected.id ? "Deployando..." : "Deploy Agora"}
            </button>
            {selected.status === "running" && (
              <>
                <button onClick={async () => { await api.post(`/git-deploys/${selected.id}/stop`); loadDeploys(); }} className="px-3 py-2 bg-dark-700 text-dark-100 rounded-lg text-sm font-medium hover:bg-dark-600 transition-colors">Parar</button>
                <button onClick={async () => { await api.post(`/git-deploys/${selected.id}/restart`); loadDeploys(); }} className="px-3 py-2 bg-dark-700 text-dark-100 rounded-lg text-sm font-medium hover:bg-dark-600 transition-colors">Reiniciar</button>
              </>
            )}
            {selected.status === "stopped" && (
              <button onClick={async () => { await api.post(`/git-deploys/${selected.id}/start`); loadDeploys(); setMessage({ text: "Container iniciado", type: "success" }); }} className="px-3 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 transition-colors">Iniciar</button>
            )}
            <button
              onClick={() => handleDelete(selected.id)}
              className="px-4 py-2 bg-danger-500/10 text-danger-400 rounded-lg text-sm font-medium hover:bg-danger-500/20 transition-colors"
            >
              Excluir
            </button>
          </div>

          {/* Deploy Key */}
          <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
            <button
              onClick={() => setShowDeployKey(!showDeployKey)}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-dark-700/30 transition-colors"
            >
              <h2 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Deploy Key</h2>
              <svg className={`w-4 h-4 text-dark-300 transition-transform ${showDeployKey ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            {showDeployKey && (
              <div className="px-5 pb-5 border-t border-dark-600 pt-4">
                <p className="text-xs text-dark-200 mb-3">Adicione esta chave ao seu provedor Git para repositórios privados.</p>
                {selected.deploy_key_public ? (
                  <div className="space-y-3">
                    <div className="relative">
                      <pre className="bg-dark-900 border border-dark-500 rounded-lg p-3 text-xs font-mono text-dark-100 overflow-x-auto whitespace-pre-wrap break-all">
                        {selected.deploy_key_public}
                      </pre>
                      <button
                        onClick={() => copyText(selected.deploy_key_public!)}
                        className="absolute top-2 right-2 px-2 py-1 bg-dark-800 border border-dark-500 rounded text-xs text-dark-200 hover:text-dark-50 transition-colors"
                      >
                        Copiar
                      </button>
                    </div>
                    <button
                      onClick={handleKeygen}
                      disabled={generatingKey}
                      className="text-sm text-dark-200 hover:text-dark-50 transition-colors"
                    >
                      {generatingKey ? "Regenerando..." : "Regenerar chave"}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleKeygen}
                    disabled={generatingKey}
                    className="px-4 py-2 bg-dark-700 text-dark-100 rounded-lg text-sm font-medium hover:bg-dark-600 disabled:opacity-50 transition-colors"
                  >
                    {generatingKey ? "Gerando..." : "Gerar Deploy Key"}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Container Logs */}
          {selected.container_id && (
            <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
              <button onClick={() => { setShowLogs(!showLogs); if (!showLogs) loadContainerLogs(); }} className="w-full px-5 py-4 flex items-center justify-between hover:bg-dark-700/30 transition-colors">
                <h2 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Logs do Container</h2>
                <svg className={`w-4 h-4 text-dark-300 transition-transform ${showLogs ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              {showLogs && (
                <div className="border-t border-dark-600">
                  <div className="flex items-center justify-between px-5 py-2 bg-dark-900">
                    <span className="text-xs text-dark-300 font-mono">stdout + stderr</span>
                    <button onClick={loadContainerLogs} className="text-xs text-rust-400 hover:text-rust-300 transition-colors">Atualizar</button>
                  </div>
                  <pre className="p-4 text-[11px] font-mono text-dark-200 bg-dark-950 max-h-80 overflow-y-auto overflow-x-auto whitespace-pre-wrap">
                    {containerLogs || "Nenhum log disponível"}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Webhook URL */}
          {selected.auto_deploy && (
            <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
              <div className="px-5 py-4 border-b border-dark-600">
                <h2 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">URL do Webhook</h2>
                <p className="text-xs text-dark-200 mt-1">Adicione esta URL nas configurações de webhook do seu provedor Git (eventos de push).</p>
              </div>
              <div className="p-5">
                <div className="relative">
                  <pre className="bg-dark-900 border border-dark-500 rounded-lg p-3 text-xs font-mono text-dark-100 overflow-x-auto pr-24">
                    {showSecret
                      ? `${window.location.origin}/api/webhooks/git/${selected.id}/${selected.webhook_secret}`
                      : `${window.location.origin}/api/webhooks/git/${selected.id}/${"●".repeat(8)}`}
                  </pre>
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    <button
                      onClick={() => setShowSecret(!showSecret)}
                      className="px-2 py-1 bg-dark-800 border border-dark-500 rounded text-xs text-dark-200 hover:text-dark-50 transition-colors"
                      title={showSecret ? "Ocultar segredo" : "Mostrar segredo"}
                    >
                      {showSecret ? (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={() => copyText(`${window.location.origin}/api/webhooks/git/${selected.id}/${selected.webhook_secret}`)}
                      className="px-2 py-1 bg-dark-800 border border-dark-500 rounded text-xs text-dark-200 hover:text-dark-50 transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Deploy History */}
          {history.length > 0 && (
            <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
              <div className="px-5 py-4 border-b border-dark-600">
                <h2 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Histórico de Deploys</h2>
              </div>
              <div className="divide-y divide-dark-600">
                {history.map((entry, idx) => (
                  <div key={entry.id}>
                    <button
                      onClick={() => setExpandedLog(expandedLog === entry.id ? null : entry.id)}
                      className="w-full px-5 py-3 flex items-center justify-between hover:bg-dark-700/30 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${statusBadge(entry.status)}`}>
                          {entry.status}
                        </span>
                        <code className="text-xs text-dark-200 bg-dark-700 px-1.5 py-0.5 rounded font-mono shrink-0">
                          {entry.commit_hash.substring(0, 8)}
                        </code>
                        {entry.commit_message && (
                          <span className="text-sm text-dark-100 truncate">{entry.commit_message}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-3">
                        <span className="text-xs text-dark-300 bg-dark-700 px-1.5 py-0.5 rounded">{entry.triggered_by}</span>
                        {entry.duration_ms != null && (
                          <span className="text-xs text-dark-200 font-mono">{(entry.duration_ms / 1000).toFixed(1)}s</span>
                        )}
                        <span className="text-xs text-dark-300">{new Date(entry.created_at).toLocaleString()}</span>
                        {/* Rollback button — not on the first (latest) entry if it's running */}
                        {!(idx === 0 && (entry.status === "deploying" || entry.status === "running")) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRollback(entry.id); }}
                            className="px-2 py-0.5 bg-warn-500/10 text-warn-400 rounded text-xs font-medium hover:bg-warn-500/20 transition-colors"
                          >
                            Reverter
                          </button>
                        )}
                        <svg className={`w-4 h-4 text-dark-300 transition-transform ${expandedLog === entry.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                        </svg>
                      </div>
                    </button>
                    {expandedLog === entry.id && entry.output && (
                      <div className="px-5 pb-4">
                        <pre className="bg-dark-900 text-dark-100 rounded-lg p-4 text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap border border-dark-500">
                          {entry.output}
                        </pre>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview Deployments */}
          {previews.length > 0 && (
            <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
              <div className="px-5 py-4 border-b border-dark-600">
                <h2 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Deploys de Preview</h2>
              </div>
              <div className="divide-y divide-dark-600">
                {previews.map(p => (
                  <div key={p.id} className="px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(p.status)}`}>{p.status}</span>
                      <code className="text-sm text-dark-50 font-mono">{p.branch}</code>
                      {p.commit_hash && <code className="text-xs text-dark-300 font-mono">{p.commit_hash.substring(0, 8)}</code>}
                    </div>
                    <div className="flex items-center gap-2">
                      {p.domain && <a href={`http://${p.domain}`} target="_blank" rel="noreferrer" className="text-xs text-rust-400 hover:text-rust-300">Abrir</a>}
                      <span className="text-xs text-dark-300 font-mono">:{p.host_port}</span>
                      <button onClick={() => deletePreview(p.id)} className="text-xs text-danger-400 hover:text-danger-300">Excluir</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      </div>

      {/* Create / Edit Modal */}
      {showModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/60 dp-modal-overlay" onClick={() => { setShowModal(false); resetForm(); }} />

          {/* Modal card */}
          <div className="relative bg-dark-800 rounded-lg border border-dark-500 w-full max-w-lg max-h-[90vh] overflow-y-auto animate-fade-up dp-modal">
            <div className="px-5 py-4 border-b border-dark-600 flex items-center justify-between">
              <h2 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">
                {editing ? "Editar Deploy" : "Novo Deploy"}
              </h2>
              <button
                onClick={() => { setShowModal(false); resetForm(); }}
                className="text-dark-300 hover:text-dark-50 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-dark-100 mb-1">Nome</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value.replace(/[^a-zA-Z0-9-]/g, ""))}
                  placeholder="my-app"
                  className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none"
                />
                <p className="text-xs text-dark-300 mt-1">Apenas letras, números e hífens</p>
              </div>

              {/* Repository URL */}
              <div>
                <label className="block text-sm font-medium text-dark-100 mb-1">URL do Repositório</label>
                <input
                  type="text"
                  value={formRepo}
                  onChange={(e) => setFormRepo(e.target.value)}
                  placeholder="https://github.com/user/repo.git"
                  className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none"
                />
              </div>

              {/* Branch + Dockerfile */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-dark-100 mb-1">Branch</label>
                  <input
                    type="text"
                    value={formBranch}
                    onChange={(e) => setFormBranch(e.target.value)}
                    placeholder="main"
                    className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-100 mb-1">Caminho do Dockerfile</label>
                  <input
                    type="text"
                    value={formDockerfile}
                    onChange={(e) => setFormDockerfile(e.target.value)}
                    placeholder="Dockerfile"
                    className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none"
                  />
                </div>
              </div>

              {/* Port + Domain */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-dark-100 mb-1">Porta do Container</label>
                  <input
                    type="number"
                    value={formPort}
                    onChange={(e) => setFormPort(parseInt(e.target.value) || 3000)}
                    min={1}
                    max={65535}
                    className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-100 mb-1">Domínio (opcional)</label>
                  <input
                    type="text"
                    value={formDomain}
                    onChange={(e) => setFormDomain(e.target.value)}
                    placeholder="app.example.com"
                    className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none"
                  />
                </div>
              </div>

              {/* SSL Email */}
              {formDomain && (
                <div>
                  <label className="block text-sm font-medium text-dark-100 mb-1">E-mail SSL (Let's Encrypt)</label>
                  <input type="email" value={formSslEmail} onChange={(e) => setFormSslEmail(e.target.value)}
                    placeholder="admin@example.com" className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none" />
                  <p className="text-xs text-dark-300 mt-1">Provisiona automaticamente o certificado HTTPS no primeiro deploy</p>
                </div>
              )}

              {/* Environment Variables */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-dark-100">Variáveis de Ambiente</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowEnvPaste(!showEnvPaste)}
                      className="text-xs text-rust-400 hover:text-rust-300 transition-colors"
                    >
                      {showEnvPaste ? "Inserção manual" : "Colar .env"}
                    </button>
                    {!showEnvPaste && (
                      <button
                        type="button"
                        onClick={() => setFormEnvVars([...formEnvVars, { key: "", value: "" }])}
                        className="px-2 py-0.5 text-xs text-rust-400 hover:text-rust-300 font-medium transition-colors"
                      >
                        + Adicionar
                      </button>
                    )}
                  </div>
                </div>
                {showEnvPaste ? (
                  <textarea
                    placeholder={"KEY=value\nDATABASE_URL=postgres://...\nSECRET_KEY=abc123"}
                    rows={6}
                    className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 outline-none"
                    onBlur={(e) => {
                      const lines = e.target.value.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
                      const parsed = lines.map((l) => {
                        const eq = l.indexOf("=");
                        if (eq === -1) return { key: l.trim(), value: "" };
                        return { key: l.substring(0, eq).trim(), value: l.substring(eq + 1).trim().replace(/^["']|["']$/g, "") };
                      }).filter((p) => p.key);
                      if (parsed.length > 0) {
                        setFormEnvVars(parsed);
                        setShowEnvPaste(false);
                      }
                    }}
                  />
                ) : (
                  <>
                    {formEnvVars.length === 0 && (
                      <p className="text-xs text-dark-300">Nenhuma variável de ambiente definida</p>
                    )}
                    <div className="space-y-2">
                      {formEnvVars.map((ev, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={ev.key}
                            onChange={(e) => {
                              const next = [...formEnvVars];
                              next[i] = { ...next[i], key: e.target.value };
                              setFormEnvVars(next);
                            }}
                            placeholder="KEY"
                            className="flex-1 px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 outline-none"
                          />
                          <span className="text-dark-300">=</span>
                          <input
                            type="text"
                            value={ev.value}
                            onChange={(e) => {
                              const next = [...formEnvVars];
                              next[i] = { ...next[i], value: e.target.value };
                              setFormEnvVars(next);
                            }}
                            placeholder="valor"
                            className="flex-1 px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setFormEnvVars(formEnvVars.filter((_, j) => j !== i))}
                            className="p-1.5 text-danger-400 hover:text-danger-300 transition-colors"
                            title="Remover variável"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Auto-deploy toggle */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formAutoDeploy}
                    onChange={(e) => setFormAutoDeploy(e.target.checked)}
                    className="w-4 h-4 text-rust-500 border-dark-500 rounded focus:ring-accent-500"
                  />
                  <span className="text-sm text-dark-100">Auto-deploy ao receber push</span>
                </label>
                <p className="text-xs text-dark-300 mt-1 ml-6">Faz deploy automático quando commits são enviados via webhook</p>
              </div>

              {/* Deploy Protection */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formProtected}
                    onChange={(e) => setFormProtected(e.target.checked)}
                    className="w-4 h-4 text-warn-500 border-dark-500 rounded focus:ring-accent-500"
                  />
                  <span className="text-sm text-dark-100">Exigir confirmação antes do deploy</span>
                </label>
                <p className="text-xs text-dark-300 mt-1 ml-6">Mostra um prompt de confirmação antes do deploy para evitar deploys acidentais</p>
              </div>

              {/* Preview TTL */}
              <div>
                <label className="block text-sm font-medium text-dark-100 mb-1">TTL de Preview (horas)</label>
                <input
                  type="number"
                  min={0}
                  value={formPreviewTtl}
                  onChange={(e) => setFormPreviewTtl(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-dark-100 text-sm focus:border-accent-500 focus:outline-none"
                />
                <p className="text-xs text-dark-300 mt-1">Remove ambientes de preview automaticamente após esta quantidade de horas (0 = sem limpeza)</p>
              </div>

              {/* Pre-build Command */}
              <div>
                <label className="block text-sm font-medium text-dark-100 mb-1">Comando Pré-build</label>
                <input type="text" value={formPreBuild} onChange={(e) => setFormPreBuild(e.target.value)}
                  placeholder="npm install, composer install, etc." className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 outline-none" />
                <p className="text-xs text-dark-300 mt-1">Executado no diretório do repo git antes do docker build</p>
              </div>

              {/* Post-deploy Command */}
              <div>
                <label className="block text-sm font-medium text-dark-100 mb-1">Comando Pós-deploy</label>
                <input type="text" value={formPostDeploy} onChange={(e) => setFormPostDeploy(e.target.value)}
                  placeholder="php artisan migrate, npx prisma migrate deploy, etc." className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 outline-none" />
                <p className="text-xs text-dark-300 mt-1">Executado dentro do container após o deploy (docker exec)</p>
              </div>

              {/* Build Arguments */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-dark-100">Argumentos de Build</label>
                  <button
                    type="button"
                    onClick={() => setFormBuildArgs([...formBuildArgs, { key: "", value: "" }])}
                    className="px-2 py-0.5 text-xs text-rust-400 hover:text-rust-300 font-medium transition-colors"
                  >
                    + Adicionar build arg
                  </button>
                </div>
                <p className="text-xs text-dark-300 mb-2">Passado como --build-arg para o Docker build</p>
                {formBuildArgs.length === 0 && (
                  <p className="text-xs text-dark-300">Nenhum argumento de build definido</p>
                )}
                <div className="space-y-2">
                  {formBuildArgs.map((arg, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={arg.key}
                        onChange={(e) => {
                          const next = [...formBuildArgs];
                          next[i] = { ...next[i], key: e.target.value };
                          setFormBuildArgs(next);
                        }}
                        placeholder="KEY"
                        className="w-1/3 px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 outline-none"
                      />
                      <span className="text-dark-300">=</span>
                      <input
                        type="text"
                        value={arg.value}
                        onChange={(e) => {
                          const next = [...formBuildArgs];
                          next[i] = { ...next[i], value: e.target.value };
                          setFormBuildArgs(next);
                        }}
                        placeholder="valor"
                        className="flex-1 px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setFormBuildArgs(formBuildArgs.filter((_, j) => j !== i))}
                        className="p-1.5 text-danger-400 hover:text-danger-300 transition-colors"
                        title="Remover build arg"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Build Context */}
              <div>
                <label className="block text-sm font-medium text-dark-100 mb-1">Build Context</label>
                <input
                  type="text"
                  value={formBuildContext}
                  onChange={(e) => setFormBuildContext(e.target.value)}
                  placeholder="."
                  className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 outline-none"
                />
                <p className="text-xs text-dark-300 mt-1">Subdiretório para o contexto de build do Docker (padrão: raiz do repo)</p>
              </div>

              {/* GitHub Token */}
              <div>
                <label className="block text-sm font-medium text-dark-100 mb-1">Token do GitHub</label>
                <input type="password" value={formGithubToken} onChange={(e) => setFormGithubToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 outline-none" />
                <p className="text-xs text-dark-300 mt-1">Define o status do commit no GitHub após o deploy (opcional)</p>
              </div>

              {/* Deploy Schedule */}
              <div>
                <label className="block text-sm font-medium text-dark-100 mb-1">Agendamento de Deploy (cron)</label>
                <input type="text" value={formCron} onChange={(e) => setFormCron(e.target.value)}
                  placeholder="0 3 * * * (diariamente às 3h UTC)" className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 outline-none" />
                <p className="text-xs text-dark-300 mt-1">Auto-deploy programado (formato cron: minuto hora dia mês dia-da-semana)</p>
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-5 py-4 border-t border-dark-600 flex justify-end gap-3">
              <button
                onClick={() => { setShowModal(false); resetForm(); }}
                className="px-4 py-2 text-sm text-dark-300 border border-dark-600 rounded-lg hover:text-dark-100 hover:border-dark-400 transition-colors"
              >
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={submitting || !formName.trim() || !formRepo.trim()}
                className="flex items-center gap-2 px-6 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50 transition-colors"
              >
                {submitting && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {submitting ? "Salvando..." : editing ? "Atualizar" : "Criar"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}

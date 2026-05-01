import { useAuth } from "../context/AuthContext";
import { Navigate } from "react-router-dom";
import { useState, useEffect, useCallback } from "react";
import { api, ApiError } from "../api";

interface Extension {
  id: string;
  name: string;
  description: string;
  author: string;
  version: string;
  webhook_url: string;
  api_key_prefix: string | null;
  enabled: boolean;
  event_subscriptions: string; // JSON array string
  api_scopes: string; // JSON array string
  last_webhook_at: string | null;
  last_webhook_status: number | null;
  created_at: string;
}

interface ExtEvent {
  id: string;
  extension_id: string;
  event_type: string;
  response_status: number | null;
  duration_ms: number | null;
  delivered_at: string;
}

const EVENT_TYPES = [
  "site.created", "site.deleted",
  "backup.created", "backup.restored",
  "deploy.started", "deploy.completed", "deploy.failed",
  "app.deployed", "app.removed",
  "auth.login_failed",
  "ssl.provisioned",
];

const API_SCOPES = ["sites:read", "metrics:read", "monitors:read"];

export default function Extensions() {
  const { user } = useAuth();
  if (!user || user.role !== "admin") return <Navigate to="/" replace />;
  const [extensions, setExtensions] = useState<Extension[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [testResult, setTestResult] = useState("");
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [newKey, setNewKey] = useState<{ api_key: string; webhook_secret: string } | null>(null);

  // Create form
  const [formName, setFormName] = useState("");
  const [formDesc, setFormDesc] = useState("");
  const [formAuthor, setFormAuthor] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formEvents, setFormEvents] = useState<Set<string>>(new Set());
  const [formScopes, setFormScopes] = useState<Set<string>>(new Set());

  // Event log
  const [viewingEvents, setViewingEvents] = useState<string | null>(null);
  const [events, setEvents] = useState<ExtEvent[]>([]);
  const [testing, setTesting] = useState<string | null>(null);

  const fetchExtensions = useCallback(async () => {
    try {
      const data = await api.get<Extension[]>("/extensions");
      setExtensions(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao carregar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchExtensions(); }, [fetchExtensions]);

  const handleCreate = async () => {
    if (!formName.trim() || !formUrl.trim()) return;
    setError("");
    try {
      const res = await api.post<{ id: string; api_key: string; webhook_secret: string }>("/extensions", {
        name: formName.trim(),
        description: formDesc.trim(),
        author: formAuthor.trim(),
        webhook_url: formUrl.trim(),
        event_subscriptions: JSON.stringify(Array.from(formEvents)),
        api_scopes: JSON.stringify(Array.from(formScopes)),
      });
      setNewKey({ api_key: res.api_key, webhook_secret: res.webhook_secret });
      setFormName(""); setFormDesc(""); setFormAuthor(""); setFormUrl("");
      setFormEvents(new Set()); setFormScopes(new Set());
      await fetchExtensions();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao criar");
    }
  };

  const handleDelete = (id: string, name: string) => {
    setPendingDelete({ id, name });
  };

  const executeDelete = async () => {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    setPendingDelete(null);
    try {
      await api.delete(`/extensions/${id}`);
      await fetchExtensions();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao excluir");
    }
  };

  const handleToggle = async (id: string, enabled: boolean) => {
    try {
      await api.put(`/extensions/${id}`, { enabled: !enabled });
      await fetchExtensions();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao alternar");
    }
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const res = await api.post<{ status: number }>(`/extensions/${id}/test`);
      setTestResult(`Teste de webhook: HTTP ${res.status}`);
    } catch (e) {
      setTestResult(e instanceof ApiError ? e.message : "Falha no teste");
    } finally {
      setTesting(null);
      await fetchExtensions();
    }
  };

  const handleViewEvents = async (id: string) => {
    setViewingEvents(viewingEvents === id ? null : id);
    if (viewingEvents !== id) {
      try {
        const data = await api.get<ExtEvent[]>(`/extensions/${id}/events`);
        setEvents(data);
      } catch { setEvents([]); }
    }
  };

  if (loading) return <div className="p-6"><div className="w-6 h-6 border-2 border-dark-600 border-t-rust-500 rounded-full animate-spin" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-50 font-mono">Extensions</h1>
          <p className="text-sm text-dark-300 mt-1">Integrações via webhook que recebem eventos do AxiaPanel</p>
        </div>
        <button onClick={() => { setCreating(!creating); setNewKey(null); setError(""); }} className="px-4 py-2 bg-rust-500 text-dark-950 rounded-lg text-sm font-bold hover:bg-rust-400 transition-colors">
          + Adicionar Extension
        </button>
      </div>

      {error && <div className="px-4 py-3 bg-danger-500/10 border border-danger-500/30 rounded-lg text-sm text-danger-400">{error}</div>}
      {pendingDelete && (
        <div className="border border-danger-500/30 bg-danger-500/5 rounded-lg px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-danger-400 font-mono">Excluir extension "{pendingDelete.name}"?</span>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button onClick={executeDelete} className="px-3 py-1.5 bg-danger-500 text-white text-xs font-bold uppercase tracking-wider hover:bg-danger-400 transition-colors">Confirmar</button>
            <button onClick={() => setPendingDelete(null)} className="px-3 py-1.5 bg-dark-600 text-dark-200 text-xs font-bold uppercase tracking-wider hover:bg-dark-500 transition-colors">Cancelar</button>
          </div>
        </div>
      )}
      {testResult && <div className="px-4 py-3 bg-dark-700 border border-dark-500 rounded-lg text-sm text-dark-100">{testResult}</div>}

      {/* New key display */}
      {newKey && (
        <div className="bg-rust-500/10 border border-rust-500/30 rounded-lg p-5 space-y-3">
          <h3 className="text-sm font-bold text-rust-400">Extension Criada — Salve Estas Credenciais</h3>
          <div>
            <label className="text-xs text-dark-300">API Key (mostrada apenas uma vez)</label>
            <div className="flex gap-2 mt-1">
              <code className="flex-1 px-3 py-2 bg-dark-900 rounded text-sm text-dark-50 font-mono">{newKey.api_key}</code>
              <button onClick={() => navigator.clipboard.writeText(newKey.api_key)} className="px-3 py-2 bg-dark-700 text-dark-200 rounded text-xs hover:bg-dark-600">Copiar</button>
            </div>
          </div>
          <div>
            <label className="text-xs text-dark-300">Webhook Secret (para verificar assinaturas)</label>
            <div className="flex gap-2 mt-1">
              <code className="flex-1 px-3 py-2 bg-dark-900 rounded text-sm text-dark-50 font-mono">{newKey.webhook_secret}</code>
              <button onClick={() => navigator.clipboard.writeText(newKey.webhook_secret)} className="px-3 py-2 bg-dark-700 text-dark-200 rounded text-xs hover:bg-dark-600">Copiar</button>
            </div>
          </div>
          <button onClick={() => setNewKey(null)} className="text-xs text-dark-400 hover:text-dark-200">Fechar</button>
        </div>
      )}

      {/* Create form */}
      {creating && !newKey && (
        <div className="bg-dark-800 border border-dark-600 rounded-lg p-5 space-y-4">
          <h2 className="text-lg font-bold text-dark-50 font-mono">Adicionar Extension</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-dark-200 mb-1">Nome</label>
              <input value={formName} onChange={(e) => setFormName(e.target.value)} placeholder="Minha Integração" className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-dark-50 text-sm focus:border-rust-500 focus:outline-none" />
            </div>
            <div>
              <label className="block text-sm text-dark-200 mb-1">Autor</label>
              <input value={formAuthor} onChange={(e) => setFormAuthor(e.target.value)} placeholder="Seu Nome" className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-dark-50 text-sm focus:border-rust-500 focus:outline-none" />
            </div>
          </div>
          <div>
            <label className="block text-sm text-dark-200 mb-1">Webhook URL</label>
            <input value={formUrl} onChange={(e) => setFormUrl(e.target.value)} placeholder="https://seu-servidor.com/webhook" className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-dark-50 text-sm focus:border-rust-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm text-dark-200 mb-1">Descrição</label>
            <input value={formDesc} onChange={(e) => setFormDesc(e.target.value)} placeholder="O que esta extension faz" className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-dark-50 text-sm focus:border-rust-500 focus:outline-none" />
          </div>
          <div>
            <label className="block text-sm text-dark-200 mb-2">Inscrições de Eventos</label>
            <div className="flex flex-wrap gap-2">
              {EVENT_TYPES.map((et) => (
                <label key={et} className="flex items-center gap-1.5 px-2 py-1 bg-dark-900 rounded text-xs cursor-pointer">
                  <input type="checkbox" checked={formEvents.has(et)} onChange={(e) => { const next = new Set(formEvents); e.target.checked ? next.add(et) : next.delete(et); setFormEvents(next); }} className="w-3 h-3" />
                  <span className="text-dark-200 font-mono">{et}</span>
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm text-dark-200 mb-2">Escopos da API</label>
            <div className="flex flex-wrap gap-2">
              {API_SCOPES.map((s) => (
                <label key={s} className="flex items-center gap-1.5 px-2 py-1 bg-dark-900 rounded text-xs cursor-pointer">
                  <input type="checkbox" checked={formScopes.has(s)} onChange={(e) => { const next = new Set(formScopes); e.target.checked ? next.add(s) : next.delete(s); setFormScopes(next); }} className="w-3 h-3" />
                  <span className="text-dark-200 font-mono">{s}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleCreate} className="px-4 py-2 bg-rust-500 text-dark-950 rounded-lg text-sm font-bold hover:bg-rust-400 transition-colors">Criar Extension</button>
            <button onClick={() => setCreating(false)} className="px-4 py-2 bg-dark-700 text-dark-200 rounded-lg text-sm hover:bg-dark-600 transition-colors">Cancelar</button>
          </div>
        </div>
      )}

      {/* Extension list */}
      <div className="space-y-3">
        {extensions.map((ext) => (
          <div key={ext.id} className="bg-dark-800 border border-dark-600 rounded-lg p-5">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-base font-bold text-dark-50 font-mono flex items-center gap-2">
                  {ext.name}
                  <span className={`text-[10px] px-2 py-0.5 rounded-full uppercase font-bold ${ext.enabled ? "bg-rust-500/20 text-rust-400" : "bg-dark-600 text-dark-400"}`}>
                    {ext.enabled ? "Ativo" : "Desabilitado"}
                  </span>
                  {ext.last_webhook_status && (
                    <span className={`text-[10px] px-2 py-0.5 rounded-full ${ext.last_webhook_status < 400 ? "bg-rust-500/10 text-rust-400" : "bg-danger-500/10 text-danger-400"}`}>
                      HTTP {ext.last_webhook_status}
                    </span>
                  )}
                </h3>
                <p className="text-sm text-dark-300 mt-0.5">{ext.description || ext.webhook_url}</p>
                <p className="text-xs text-dark-400 mt-1">
                  {ext.author && `por ${ext.author} · `}v{ext.version}
                  {ext.api_key_prefix && ` · Chave: ${ext.api_key_prefix}...`}
                  {ext.last_webhook_at && ` · Última entrega: ${new Date(ext.last_webhook_at).toLocaleString()}`}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button onClick={() => handleToggle(ext.id, ext.enabled)} className="px-3 py-1.5 bg-dark-700 text-dark-200 rounded text-xs font-medium hover:bg-dark-600 transition-colors">
                  {ext.enabled ? "Desabilitar" : "Habilitar"}
                </button>
                <button onClick={() => handleTest(ext.id)} disabled={testing === ext.id} className="px-3 py-1.5 bg-dark-700 text-dark-200 rounded text-xs font-medium hover:bg-dark-600 transition-colors disabled:opacity-50">
                  {testing === ext.id ? "Testando..." : "Testar"}
                </button>
                <button onClick={() => handleViewEvents(ext.id)} className="px-3 py-1.5 bg-dark-700 text-dark-200 rounded text-xs font-medium hover:bg-dark-600 transition-colors">
                  Eventos
                </button>
                <button onClick={() => handleDelete(ext.id, ext.name)} className="px-3 py-1.5 bg-danger-500/10 text-danger-400 rounded text-xs font-medium hover:bg-danger-500/20 transition-colors">
                  Excluir
                </button>
              </div>
            </div>

            {/* Event log */}
            {viewingEvents === ext.id && (
              <div className="mt-3 bg-dark-900/50 rounded-lg p-3">
                <h4 className="text-xs font-bold text-dark-300 uppercase mb-2">Entregas Recentes</h4>
                {events.length === 0 ? (
                  <p className="text-xs text-dark-400">Nenhuma entrega ainda</p>
                ) : (
                  <div className="space-y-1">
                    {events.map((ev) => (
                      <div key={ev.id} className="flex items-center gap-3 text-xs font-mono">
                        <span className={`w-8 text-right ${ev.response_status && ev.response_status < 400 ? "text-rust-400" : "text-danger-400"}`}>
                          {ev.response_status || "ERR"}
                        </span>
                        <span className="text-dark-300">{ev.event_type}</span>
                        <span className="text-dark-400 ml-auto">{ev.duration_ms}ms</span>
                        <span className="text-dark-400">{new Date(ev.delivered_at).toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))}

        {extensions.length === 0 && !creating && (
          <div className="text-center py-12 text-dark-300 text-sm">
            Nenhuma extension instalada. Clique em "Adicionar Extension" para criar sua primeira integração via webhook.
          </div>
        )}
      </div>
    </div>
  );
}

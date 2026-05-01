import { useState, useEffect, useCallback } from "react";
import { api, ApiError } from "../api";

interface UserItem {
  id: string;
  email: string;
  role: string;
  created_at: string;
  site_count: number;
}

export default function ResellerUsers() {
  const [users, setUsers] = useState<UserItem[]>([]);
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [loading, setLoading] = useState(true);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; email: string } | null>(null);
  const [resetTarget, setResetTarget] = useState<{ id: string; email: string } | null>(null);
  const [resetPassword, setResetPassword] = useState("");

  const fetchUsers = useCallback(async () => {
    try {
      const data = await api.get<UserItem[]>("/reseller/users");
      setUsers(data);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao carregar usuários");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleCreate = async () => {
    if (!email.trim() || !password) return;
    setError("");
    try {
      await api.post("/reseller/users", { email: email.trim(), password });
      setEmail("");
      setPassword("");
      setCreating(false);
      await fetchUsers();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao criar usuário");
    }
  };

  const handleDelete = (id: string, userEmail: string) => {
    setPendingDelete({ id, email: userEmail });
  };

  const executeDelete = async () => {
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    setPendingDelete(null);
    setError("");
    try {
      await api.delete(`/reseller/users/${id}`);
      await fetchUsers();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao excluir usuário");
    }
  };

  const handleResetPassword = async () => {
    if (!resetTarget || resetPassword.length < 8) {
      if (resetPassword) setError("A senha deve ter no mínimo 8 caracteres");
      return;
    }
    setError("");
    try {
      await api.put(`/reseller/users/${resetTarget.id}`, { password: resetPassword });
      setSuccess("Senha atualizada com sucesso");
      setResetTarget(null);
      setResetPassword("");
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "Falha ao atualizar senha");
    }
  };

  if (loading) return <div className="p-6"><div className="w-6 h-6 border-2 border-dark-600 border-t-rust-500 rounded-full animate-spin" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-dark-50 font-mono">Meus Usuários</h1>
          <p className="text-sm text-dark-300 mt-1">{users.length} {users.length !== 1 ? "usuários" : "usuário"} sob sua conta de revenda</p>
        </div>
        <button
          onClick={() => { setCreating(!creating); setError(""); }}
          className="px-4 py-2 bg-rust-500 text-dark-950 rounded-lg text-sm font-bold hover:bg-rust-400 transition-colors"
        >
          + Criar Usuário
        </button>
      </div>

      {error && (
        <div className="px-4 py-3 bg-danger-500/10 border border-danger-500/30 rounded-lg text-sm text-danger-400">{error}</div>
      )}
      {success && (
        <div className="px-4 py-3 bg-rust-500/10 border border-rust-500/30 rounded-lg text-sm text-rust-400">{success}</div>
      )}

      {pendingDelete && (
        <div className="border border-danger-500/30 bg-danger-500/5 rounded-lg px-4 py-3 flex items-center justify-between">
          <span className="text-xs text-danger-400 font-mono">Excluir usuário "{pendingDelete.email}"? Os sites e bancos de dados também serão excluídos.</span>
          <div className="flex items-center gap-2 shrink-0 ml-4">
            <button onClick={executeDelete} className="px-3 py-1.5 bg-danger-500 text-white text-xs font-bold uppercase tracking-wider hover:bg-danger-400 transition-colors">Confirmar</button>
            <button onClick={() => setPendingDelete(null)} className="px-3 py-1.5 bg-dark-600 text-dark-200 text-xs font-bold uppercase tracking-wider hover:bg-dark-500 transition-colors">Cancelar</button>
          </div>
        </div>
      )}

      {creating && (
        <div className="bg-dark-800 border border-dark-600 rounded-lg p-5 space-y-4">
          <h2 className="text-lg font-bold text-dark-50 font-mono">Criar Usuário</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-dark-200 mb-1">Email</label>
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="user@example.com"
                type="email"
                className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-dark-50 text-sm focus:border-rust-500 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-sm text-dark-200 mb-1">Senha</label>
              <input
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                type="password"
                className="w-full px-3 py-2 bg-dark-900 border border-dark-600 rounded-lg text-dark-50 text-sm focus:border-rust-500 focus:outline-none"
              />
            </div>
          </div>
          <div className="flex gap-3">
            <button onClick={handleCreate} className="px-4 py-2 bg-rust-500 text-dark-950 rounded-lg text-sm font-bold hover:bg-rust-400 transition-colors">
              Criar
            </button>
            <button onClick={() => setCreating(false)} className="px-4 py-2 bg-dark-700 text-dark-200 rounded-lg text-sm hover:bg-dark-600 transition-colors">
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* User table */}
      <div className="bg-dark-800 border border-dark-600 rounded-lg overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-dark-600 text-dark-300 text-left">
              <th className="px-4 py-3 font-medium">Email</th>
              <th className="px-4 py-3 font-medium">Sites</th>
              <th className="px-4 py-3 font-medium">Criado em</th>
              <th className="px-4 py-3 font-medium text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-b border-dark-700/50 hover:bg-dark-700/30">
                <td className="px-4 py-3 text-dark-50 font-mono">{u.email}</td>
                <td className="px-4 py-3 text-dark-300">{u.site_count}</td>
                <td className="px-4 py-3 text-dark-300">{new Date(u.created_at).toLocaleDateString()}</td>
                <td className="px-4 py-3 text-right space-x-2">
                  {resetTarget?.id === u.id ? (
                    <span className="inline-flex items-center gap-1.5">
                      <input
                        type="password"
                        value={resetPassword}
                        onChange={(e) => setResetPassword(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleResetPassword(); if (e.key === "Escape") { setResetTarget(null); setResetPassword(""); } }}
                        autoFocus
                        className="w-28 px-2 py-1 bg-dark-900 border border-dark-500 rounded text-xs text-dark-100"
                        placeholder="Nova senha"
                      />
                      <button onClick={handleResetPassword} disabled={resetPassword.length < 8} className="px-2 py-1 bg-rust-500 text-white rounded text-xs font-medium disabled:opacity-50">Salvar</button>
                      <button onClick={() => { setResetTarget(null); setResetPassword(""); }} className="px-2 py-1 bg-dark-600 text-dark-200 rounded text-xs">Cancelar</button>
                    </span>
                  ) : (
                    <button
                      onClick={() => { setResetTarget({ id: u.id, email: u.email }); setResetPassword(""); }}
                      className="px-2 py-1 text-xs text-dark-300 hover:text-dark-50 bg-dark-700 rounded hover:bg-dark-600 transition-colors"
                    >
                      Redefinir Senha
                    </button>
                  )}
                  <button
                    onClick={() => handleDelete(u.id, u.email)}
                    className="px-2 py-1 text-xs text-danger-400 bg-danger-500/10 rounded hover:bg-danger-500/20 transition-colors"
                  >
                    Excluir
                  </button>
                </td>
              </tr>
            ))}
            {users.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-dark-400">
                  Nenhum usuário ainda. Clique em "Criar Usuário" para adicionar seu primeiro cliente.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

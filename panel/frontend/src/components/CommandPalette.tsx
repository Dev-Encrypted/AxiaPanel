import { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";

interface Command {
  id: string;
  label: string;
  description?: string;
  icon: string;
  action: () => void;
  category: string;
  keywords?: string;
}

export default function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const go = useCallback((path: string) => {
    navigate(path);
    setOpen(false);
  }, [navigate]);

  const icon = "M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"; // generic nav icon

  const commands: Command[] = [
    // Hospedagem
    { id: "dashboard", label: "Dashboard", icon: "M2.25 12l8.954-8.955c.44-.439 1.152-.439 1.591 0L21.75 12M4.5 9.75v10.125c0 .621.504 1.125 1.125 1.125H9.75v-4.875c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125V21h4.125c.621 0 1.125-.504 1.125-1.125V9.75M8.25 21h8.25", action: () => go("/"), category: "Hospedagem", keywords: "home início visão geral saúde métricas overview health metrics" },
    { id: "sites", label: "Sites", icon: "M12 21a9.004 9.004 0 008.716-6.747M12 21a9.004 9.004 0 01-8.716-6.747M12 21c2.485 0 4.5-4.03 4.5-9S14.485 3 12 3m0 18c-2.485 0-4.5-4.03-4.5-9S9.515 3 12 3", action: () => go("/sites"), category: "Hospedagem", keywords: "websites sites domínios domains nginx php laravel wordpress static reverse proxy" },
    { id: "databases", label: "Bancos de Dados", icon: "M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375", action: () => go("/databases"), category: "Hospedagem", keywords: "bancos databases mysql postgres sql schema browser query consulta" },
    { id: "wp-toolkit", label: "Ferramentas WP", icon, action: () => go("/wordpress-toolkit"), category: "Hospedagem", keywords: "wordpress wp bulk updates atualizações vulnerabilidades hardening" },
    { id: "apps", label: "Apps Docker", icon: "M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15", action: () => go("/apps"), category: "Hospedagem", keywords: "containers docker deploy template compose images registries" },
    { id: "git-deploys", label: "Git Deploy", icon, action: () => go("/git-deploys"), category: "Hospedagem", keywords: "git webhook preview deploy rollback zero-downtime" },
    { id: "migration", label: "Migração", icon, action: () => go("/migration"), category: "Hospedagem", keywords: "migração migration cpanel hestia importar import migrate backup" },

    // Operações
    { id: "dns", label: "DNS", icon: "M5.25 14.25h13.5m-13.5 0a3 3 0 01-3-3m3 3a3 3 0 100 6h13.5a3 3 0 100-6m-16.5-3a3 3 0 013-3h13.5a3 3 0 013 3", action: () => go("/dns"), category: "Operações", keywords: "registros records a cname mx cloudflare powerdns zones zonas" },
    { id: "cdn", label: "CDN", icon, action: () => go("/cdn"), category: "Operações", keywords: "bunnycdn cloudflare cache purge bandwidth banda" },
    { id: "mail", label: "E-mail", icon, action: () => go("/mail"), category: "Operações", keywords: "email e-mail postfix dovecot smtp mailbox caixa alias domínio domain" },
    { id: "backup-orchestrator", label: "Gerenciador de Backups", icon, action: () => go("/backup-orchestrator"), category: "Operações", keywords: "backup restore restaurar schedule agendar retention retenção restic s3 encryption criptografia" },
    { id: "monitoring", label: "Monitoramento", icon: "M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5", action: () => go("/monitoring"), category: "Operações", keywords: "monitoramento uptime ping http alerts alertas certificates certificados maintenance manutenção status page incidents incidentes" },
    { id: "notifications", label: "Notificações", icon, action: () => go("/notifications"), category: "Operações", keywords: "notificações alerts alertas email slack webhook telegram discord pagerduty" },
    { id: "logs", label: "Logs", icon: "M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z", action: () => go("/logs"), category: "Operações", keywords: "logs sistema system access acesso error erro nginx audit auditoria activity atividade events eventos" },
    { id: "terminal", label: "Terminal", icon: "M6.75 7.5l3 2.25-3 2.25m4.5 0h3m-9 8.25h13.5A2.25 2.25 0 0021 18V6a2.25 2.25 0 00-2.25-2.25H5.25A2.25 2.25 0 003 6v12a2.25 2.25 0 002.25 2.25z", action: () => go("/terminal"), category: "Operações", keywords: "ssh console shell bash command comando" },

    // Administração
    { id: "servers", label: "Servidores", icon, action: () => go("/servers"), category: "Administração", keywords: "servidores servers multi-server agent fleet remote remoto" },
    { id: "users", label: "Usuários", icon, action: () => go("/users"), category: "Administração", keywords: "usuários users contas accounts roles papéis permissions permissões suspend suspender reset redefinir password senha" },
    { id: "container-policies", label: "Políticas de Container", icon, action: () => go("/container-policies"), category: "Administração", keywords: "políticas policies container isolation isolamento limits limites quotas docker user usuário policy network rede" },
    { id: "integrations", label: "Integrações", icon, action: () => go("/integrations"), category: "Administração", keywords: "integrações integrations webhooks extensions whmcs terraform stripe billing cobrança api" },
    { id: "secrets", label: "Secrets", icon, action: () => go("/secrets"), category: "Administração", keywords: "secrets segredos vault cofre encrypted criptografado credentials credenciais aes keys chaves" },
    { id: "security", label: "Segurança", icon: "M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z", action: () => go("/security"), category: "Administração", keywords: "segurança security firewall fail2ban ssh hardening diagnostics diagnóstico scan lockdown recordings gravações audit auditoria" },
    { id: "system", label: "Sistema", icon, action: () => go("/system"), category: "Administração", keywords: "sistema system health saúde updates atualizações services serviços processes processos network rede info" },
    { id: "telemetry", label: "Telemetria", icon, action: () => go("/telemetry"), category: "Administração", keywords: "telemetria telemetry events eventos diagnostics diagnóstico update checker reports relatórios" },
    { id: "settings", label: "Configurações", icon: "M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.325.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.241-.438.613-.43.992a7.723 7.723 0 010 .255c-.008.378.137.75.43.991l1.004.827c.424.35.534.955.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.47 6.47 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.281c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.019-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.991a6.932 6.932 0 010-.255c.007-.38-.138-.751-.43-.992l-1.004-.827a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.28z M15 12a3 3 0 11-6 0 3 3 0 016 0z", action: () => go("/settings"), category: "Administração", keywords: "configurações settings config smtp 2fa totp branding marca theme tema layout auto-heal reverse proxy" },

    // Revenda
    { id: "reseller", label: "Painel de Revenda", icon, action: () => go("/reseller"), category: "Revenda", keywords: "revenda reseller white-label" },
    { id: "reseller-users", label: "Meus Usuários", icon, action: () => go("/reseller/users"), category: "Revenda", keywords: "revenda reseller clientes clients usuários users" },
  ];

  const filtered = query
    ? commands.filter((c) => {
        const q = query.toLowerCase();
        return (
          c.label.toLowerCase().includes(q) ||
          c.category.toLowerCase().includes(q) ||
          (c.keywords && c.keywords.includes(q)) ||
          (c.description && c.description.toLowerCase().includes(q))
        );
      })
    : commands;

  // Reset selected index when results change
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Scroll selected item into view
  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.children[selectedIndex] as HTMLElement;
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  // Keyboard shortcut to open
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
        setQuery("");
        setSelectedIndex(0);
      }
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open]);

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && filtered[selectedIndex]) {
      filtered[selectedIndex].action();
    }
  };

  if (!open) return null;

  // Group by category
  const grouped = filtered.reduce<Record<string, Command[]>>((acc, cmd) => {
    (acc[cmd.category] ??= []).push(cmd);
    return acc;
  }, {});

  let globalIdx = -1;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh]"
      onClick={() => setOpen(false)}
    >
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Paleta de comandos"
        className="relative w-full max-w-lg mx-4 bg-dark-800 rounded-lg shadow-xl border border-dark-600 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 border-b border-dark-600">
          <svg className="w-5 h-5 text-dark-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <circle cx="11" cy="11" r="8" />
            <path d="M21 21l-4.35-4.35" />
          </svg>
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Buscar páginas, ações..."
            aria-label="Buscar comandos"
            className="w-full py-3.5 bg-transparent text-sm text-dark-50 placeholder-dark-300 outline-none ring-0 focus:outline-none focus:ring-0"
          />
          <kbd className="hidden sm:inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] text-dark-300 border border-dark-500 rounded bg-dark-700/50 shrink-0">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-80 overflow-y-auto py-2">
          {filtered.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-dark-300">
              Nenhum resultado para &ldquo;{query}&rdquo;
            </div>
          ) : (
            Object.entries(grouped).map(([category, cmds]) => (
              <div key={category}>
                <div className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-dark-300">
                  {category}
                </div>
                {cmds.map((cmd) => {
                  globalIdx++;
                  const idx = globalIdx;
                  return (
                    <button
                      key={cmd.id}
                      onClick={cmd.action}
                      onMouseEnter={() => setSelectedIndex(idx)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors ${
                        selectedIndex === idx
                          ? "bg-rust-500/10 text-dark-50"
                          : "text-dark-200 hover:bg-dark-700/50"
                      }`}
                    >
                      <svg className="w-4 h-4 shrink-0 text-dark-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d={cmd.icon} />
                      </svg>
                      <span className="flex-1">{cmd.label}</span>
                      {selectedIndex === idx && (
                        <kbd className="text-[10px] text-dark-300">
                          Enter
                        </kbd>
                      )}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 border-t border-dark-600 text-[10px] text-dark-300">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 border border-dark-500 rounded bg-dark-700/50">&uarr;&darr;</kbd>
            Navegar
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 border border-dark-500 rounded bg-dark-700/50">Enter</kbd>
            Abrir
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 border border-dark-500 rounded bg-dark-700/50">Esc</kbd>
            Fechar
          </span>
        </div>
      </div>
    </div>
  );
}

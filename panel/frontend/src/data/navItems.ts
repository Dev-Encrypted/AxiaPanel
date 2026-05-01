export interface NavItem {
  to: string;
  label: string;
  iconName: string;
  adminOnly?: boolean;
  /** Visible to reseller role (and admin, which sees everything) */
  resellerVisible?: boolean;
}

export interface NavGroup {
  key: string;
  label: string;
  items: NavItem[];
}

export const navGroups: NavGroup[] = [
  {
    key: "hosting",
    label: "Hospedagem",
    items: [
      { to: "/", label: "Dashboard", iconName: "dashboard" },
      { to: "/sites", label: "Sites", iconName: "sites" },
      { to: "/databases", label: "Bancos de Dados", iconName: "databases" },
      { to: "/wordpress-toolkit", label: "Ferramentas WP", iconName: "wordpress", adminOnly: true },
      { to: "/apps", label: "Apps Docker", iconName: "apps", adminOnly: true },
      { to: "/git-deploys", label: "Git Deploy", iconName: "gitDeploys", adminOnly: true },
      { to: "/migration", label: "Migração", iconName: "migration", adminOnly: true },
    ],
  },
  {
    key: "reseller",
    label: "Revenda",
    items: [
      { to: "/reseller", label: "Painel de Revenda", iconName: "reseller", resellerVisible: true },
      { to: "/reseller/users", label: "Meus Usuários", iconName: "users", resellerVisible: true },
    ],
  },
  {
    key: "operations",
    label: "Operações",
    items: [
      { to: "/dns", label: "DNS", iconName: "dns" },
      { to: "/cdn", label: "CDN", iconName: "cdn", adminOnly: true },
      { to: "/mail", label: "E-mail", iconName: "mail", adminOnly: true },
      { to: "/backup-orchestrator", label: "Gerenciador de Backups", iconName: "backups", adminOnly: true },
      { to: "/monitoring", label: "Monitoramento", iconName: "monitoring" },
      { to: "/notifications", label: "Notificações", iconName: "incidents" },
      { to: "/logs", label: "Logs", iconName: "logs", adminOnly: true },
      { to: "/terminal", label: "Terminal", iconName: "terminal" },
    ],
  },
  {
    key: "admin",
    label: "Administração",
    items: [
      { to: "/servers", label: "Servidores", iconName: "servers", adminOnly: true },
      { to: "/users", label: "Usuários", iconName: "users", adminOnly: true },
      { to: "/container-policies", label: "Políticas de Container", iconName: "extensions", adminOnly: true },
      { to: "/integrations", label: "Integrações", iconName: "webhooks", adminOnly: true },
      { to: "/secrets", label: "Secrets", iconName: "secrets", adminOnly: true },
      { to: "/security", label: "Segurança", iconName: "security", adminOnly: true },
      { to: "/system", label: "Sistema", iconName: "system", adminOnly: true },
      { to: "/telemetry", label: "Telemetria", iconName: "telemetry", adminOnly: true },
      { to: "/settings", label: "Configurações", iconName: "settings", adminOnly: true },
    ],
  },
];

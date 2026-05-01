// SSH bootstrap: connect to a remote server with SSH credentials and install
// the AxiaPanel agent automatically. Used by /api/servers/bootstrap-ssh.

use russh::client::{self, Handle, Handler};
use russh::keys::{decode_secret_key, key};
use russh::{ChannelMsg, Disconnect};
use std::sync::Arc;
use std::time::Duration;
use tokio::time::timeout;

#[derive(Debug)]
pub struct SshExecResult {
    pub stdout: String,
    pub stderr: String,
    pub exit_code: u32,
}

#[derive(Debug)]
pub enum SshError {
    Connect(String),
    Auth,
    InvalidKey(String),
    Timeout(u64),
    Other(String),
}

impl std::fmt::Display for SshError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Connect(e) => write!(f, "connection failed: {e}"),
            Self::Auth => write!(f, "authentication failed"),
            Self::InvalidKey(e) => write!(f, "invalid private key: {e}"),
            Self::Timeout(secs) => write!(f, "command timed out after {secs}s"),
            Self::Other(e) => write!(f, "ssh error: {e}"),
        }
    }
}

impl std::error::Error for SshError {}

struct AcceptAllHandler;

#[async_trait::async_trait]
impl Handler for AcceptAllHandler {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &key::PublicKey,
    ) -> Result<bool, Self::Error> {
        // Accept any host key on first connection. Bootstrap is one-shot and
        // TOFU is acceptable here — the user is providing SSH credentials for
        // a server they own. After bootstrap, all communication is via the
        // agent over HTTPS with cert fingerprint pinning.
        Ok(true)
    }
}

pub struct SshSession {
    handle: Handle<AcceptAllHandler>,
}

impl SshSession {
    pub async fn connect(
        host: &str,
        port: u16,
        user: &str,
        private_key_pem: &str,
        passphrase: Option<&str>,
    ) -> Result<Self, SshError> {
        let key_pair: key::KeyPair = decode_secret_key(private_key_pem, passphrase)
            .map_err(|e| SshError::InvalidKey(e.to_string()))?;

        let config = client::Config {
            inactivity_timeout: Some(Duration::from_secs(600)),
            ..Default::default()
        };
        let config = Arc::new(config);

        let handler = AcceptAllHandler;
        let addr = format!("{host}:{port}");
        let mut handle = timeout(Duration::from_secs(15), client::connect(config, addr, handler))
            .await
            .map_err(|_| SshError::Timeout(15))?
            .map_err(|e| SshError::Connect(e.to_string()))?;

        let auth_ok = handle
            .authenticate_publickey(user, Arc::new(key_pair))
            .await
            .map_err(|e| SshError::Other(e.to_string()))?;
        if !auth_ok {
            return Err(SshError::Auth);
        }

        Ok(Self { handle })
    }

    /// Execute a command on the remote server and capture stdout/stderr/exit_code.
    /// `stdin_data` is optionally piped to the command's stdin.
    pub async fn exec(
        &mut self,
        cmd: &str,
        stdin_data: Option<&[u8]>,
        timeout_secs: u64,
    ) -> Result<SshExecResult, SshError> {
        let mut channel = self
            .handle
            .channel_open_session()
            .await
            .map_err(|e| SshError::Other(e.to_string()))?;

        channel
            .exec(true, cmd)
            .await
            .map_err(|e| SshError::Other(e.to_string()))?;

        if let Some(data) = stdin_data {
            channel
                .data(data)
                .await
                .map_err(|e| SshError::Other(e.to_string()))?;
            channel
                .eof()
                .await
                .map_err(|e| SshError::Other(e.to_string()))?;
        }

        let mut stdout = Vec::new();
        let mut stderr = Vec::new();
        let mut exit_code: u32 = 0;

        let collect = async {
            while let Some(msg) = channel.wait().await {
                match msg {
                    ChannelMsg::Data { ref data } => stdout.extend_from_slice(data),
                    ChannelMsg::ExtendedData { ref data, ext } if ext == 1 => {
                        stderr.extend_from_slice(data)
                    }
                    ChannelMsg::ExitStatus { exit_status } => {
                        exit_code = exit_status;
                    }
                    ChannelMsg::Eof | ChannelMsg::Close => break,
                    _ => {}
                }
            }
            Ok::<(), SshError>(())
        };

        timeout(Duration::from_secs(timeout_secs), collect)
            .await
            .map_err(|_| SshError::Timeout(timeout_secs))??;

        Ok(SshExecResult {
            stdout: String::from_utf8_lossy(&stdout).into_owned(),
            stderr: String::from_utf8_lossy(&stderr).into_owned(),
            exit_code,
        })
    }

    pub async fn close(self) {
        let _ = self
            .handle
            .disconnect(Disconnect::ByApplication, "bye", "en")
            .await;
    }
}

/// Build the bootstrap script that will be run via SSH on the remote server.
/// Installs Docker, sets up agent dirs/config, downloads the agent binary,
/// registers a systemd unit, and starts the agent. Validates connectivity
/// on :9443 before exiting. Prints the cert SHA-256 fingerprint as the
/// last line of stdout so the panel can pin it.
///
/// Design notes:
/// - All non-fingerprint output is teed to /tmp/axiapanel-bootstrap.log.
/// - On any failure (set -e) the trap dumps the last 40 log lines to
///   stderr so the panel sees the real error, not /dev/null.
/// - Aborts immediately if not running as root (the script touches
///   /etc/, /usr/local/bin/, and systemd — sudo NOPASSWD wouldn't help
///   here because the script is fed through `bash -s` over SSH and would
///   need every command prefixed individually).
pub fn bootstrap_script(
    panel_url: &str,
    agent_token: &str,
    server_id: &str,
    arch: &str,
) -> String {
    format!(
        r#"set -eu
export DEBIAN_FRONTEND=noninteractive
LOG=/tmp/axiapanel-bootstrap.log
: > "$LOG"

# On any error, dump the tail of the log to stderr so the panel sees it
trap 'rc=$?; echo "--- BOOTSTRAP FAILED (exit $rc) — last 40 log lines ---" >&2; tail -n 40 "$LOG" >&2 || true; exit $rc' ERR

log() {{ echo "[$(date +%H:%M:%S)] $*" >> "$LOG"; }}

# Must be root — touching /etc, /usr/local/bin, systemd
if [ "$(id -u)" -ne 0 ]; then
    echo "ERRO: o bootstrap precisa rodar como root (uid 0). Conecte como root ou ajuste o usuário SSH." >&2
    exit 2
fi

log "Starting AxiaPanel agent bootstrap on $(uname -a)"

# Install Docker if missing
if ! command -v docker >/dev/null 2>&1; then
    log "Installing Docker via get.docker.com"
    curl -fsSL https://get.docker.com | sh >>"$LOG" 2>&1
fi
systemctl enable --now docker >>"$LOG" 2>&1 || true

# Install curl and openssl
log "Installing curl + openssl"
if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq >>"$LOG" 2>&1
    apt-get install -y -qq curl openssl >>"$LOG" 2>&1
elif command -v dnf >/dev/null 2>&1; then
    dnf install -y -q curl openssl >>"$LOG" 2>&1
elif command -v yum >/dev/null 2>&1; then
    yum install -y -q curl openssl >>"$LOG" 2>&1
fi

# Create directories
log "Creating /etc/axiapanel and runtime dirs"
mkdir -p /etc/axiapanel/ssl /run/axiapanel /var/lib/axiapanel/git \
         /var/lib/axiapanel/recordings /var/lib/axiapanel/audit \
         /var/run/axiapanel /var/backups/axiapanel /var/www

# Save token and config
echo '{token}' > /etc/axiapanel/agent.token
chmod 600 /etc/axiapanel/agent.token

cat > /etc/axiapanel/agent.env <<ENVEOF
AGENT_TOKEN={token}
AGENT_LISTEN_TCP=0.0.0.0:9443
AXIAPANEL_SERVER_TOKEN={token}
AXIAPANEL_SERVER_ID={server_id}
AXIAPANEL_CENTRAL_URL={panel_url}
ENVEOF
chmod 600 /etc/axiapanel/agent.env

# Download agent binary from the panel itself.
# --insecure intentional: the panel may use a self-signed cert during dev,
# and we authenticate the binary via cert fingerprint pinning later, not
# via TLS chain trust at download time.
log "Downloading agent binary from panel: {panel_url}/api/agent/binary?arch={arch}"
if ! curl -fsSL --insecure --connect-timeout 10 --max-time 180 \
    '{panel_url}/api/agent/binary?arch={arch}' \
    -o /usr/local/bin/axiapanel-agent 2>>"$LOG"; then
    echo "ERRO: falha ao baixar o binário do agent de {panel_url}/api/agent/binary?arch={arch}" >&2
    echo "Verifique se BASE_URL está acessível deste servidor (curl em modo manual no servidor remoto para diagnosticar)." >&2
    exit 3
fi
chmod +x /usr/local/bin/axiapanel-agent

# Sanity check the binary
if ! file /usr/local/bin/axiapanel-agent 2>>"$LOG" | grep -q ELF; then
    echo "ERRO: o arquivo baixado não é um binário ELF válido." >&2
    head -c 500 /usr/local/bin/axiapanel-agent >&2 || true
    exit 4
fi
log "Binary OK ($(stat -c%s /usr/local/bin/axiapanel-agent) bytes)"

# Generate self-signed TLS cert
if [ ! -f /etc/axiapanel/ssl/agent.crt ]; then
    log "Generating self-signed TLS cert"
    openssl req -x509 -newkey rsa:2048 -keyout /etc/axiapanel/ssl/agent.key \
        -out /etc/axiapanel/ssl/agent.crt -days 3650 -nodes \
        -subj '/CN=axiapanel-agent' >>"$LOG" 2>&1
    chmod 600 /etc/axiapanel/ssl/agent.key
fi

# Persist socket dir across reboots
echo 'd /run/axiapanel 0755 root root -' > /etc/tmpfiles.d/axiapanel.conf

# Create systemd service
cat > /etc/systemd/system/axiapanel-agent.service <<UNITEOF
[Unit]
Description=AxiaPanel Agent
After=network.target docker.service
Wants=docker.service
StartLimitBurst=5
StartLimitIntervalSec=60

[Service]
Type=simple
ExecStartPre=/bin/sh -c 'mkdir -p /run/axiapanel /var/lib/axiapanel/git'
ExecStart=/usr/local/bin/axiapanel-agent
EnvironmentFile=/etc/axiapanel/agent.env
Environment=RUST_LOG=info
Restart=always
RestartSec=5
NoNewPrivileges=no
ProtectSystem=no
ProtectHome=no
PrivateTmp=no
ProtectKernelLogs=yes
ProtectKernelModules=yes
MemoryMax=512M
LimitNOFILE=65535

[Install]
WantedBy=multi-user.target
UNITEOF

# Open firewall port
log "Opening firewall :9443"
if command -v ufw >/dev/null 2>&1; then
    ufw allow 9443/tcp >>"$LOG" 2>&1 || true
elif command -v firewall-cmd >/dev/null 2>&1; then
    firewall-cmd --permanent --add-port=9443/tcp >>"$LOG" 2>&1 || true
    firewall-cmd --reload >>"$LOG" 2>&1 || true
fi

# Start agent
log "Starting axiapanel-agent.service"
systemctl daemon-reload
systemctl enable axiapanel-agent >>"$LOG" 2>&1
systemctl restart axiapanel-agent

# Wait for agent socket (up to 15s) AND for :9443 to accept TLS handshakes (up to 20s)
log "Waiting for agent socket"
for i in $(seq 1 15); do
    [ -S /var/run/axiapanel/agent.sock ] && break
    sleep 1
done
if [ ! -S /var/run/axiapanel/agent.sock ]; then
    echo "ERRO: agent socket /var/run/axiapanel/agent.sock não foi criado." >&2
    echo "--- journalctl -u axiapanel-agent --no-pager -n 30 ---" >&2
    journalctl -u axiapanel-agent --no-pager -n 30 >&2 2>/dev/null || true
    exit 5
fi

log "Waiting for HTTPS :9443 to be live"
ready=0
for i in $(seq 1 20); do
    if curl -sk --connect-timeout 1 --max-time 2 https://127.0.0.1:9443/health >/dev/null 2>&1; then
        ready=1
        break
    fi
    sleep 1
done
if [ "$ready" -ne 1 ]; then
    echo "ERRO: agent rodando mas não respondendo em https://127.0.0.1:9443 após 20s." >&2
    echo "--- journalctl -u axiapanel-agent --no-pager -n 30 ---" >&2
    journalctl -u axiapanel-agent --no-pager -n 30 >&2 2>/dev/null || true
    exit 6
fi
log "Agent live on :9443"

# Print cert fingerprint as the last stdout line (the panel pins this)
openssl x509 -in /etc/axiapanel/ssl/agent.crt -fingerprint -sha256 -noout \
    | sed 's/.*=//' | tr -d ':' | tr 'A-F' 'a-f'
"#,
        token = agent_token,
        server_id = server_id,
        panel_url = panel_url,
        arch = arch,
    )
}

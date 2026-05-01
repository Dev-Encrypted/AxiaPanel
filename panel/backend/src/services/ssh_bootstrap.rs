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
/// It installs Docker, sets up agent dirs/config, downloads the agent binary
/// from the panel itself, generates a self-signed cert, registers a systemd
/// unit, and starts the agent. Finally prints the cert SHA-256 fingerprint
/// to stdout so the panel can pin it.
pub fn bootstrap_script(
    panel_url: &str,
    agent_token: &str,
    server_id: &str,
    arch: &str,
) -> String {
    format!(
        r#"set -e
export DEBIAN_FRONTEND=noninteractive

# Install Docker if missing
if ! command -v docker >/dev/null 2>&1; then
    curl -fsSL https://get.docker.com | sh >/dev/null 2>&1
fi
systemctl enable --now docker >/dev/null 2>&1 || true

# Install curl and openssl
if command -v apt-get >/dev/null 2>&1; then
    apt-get update -qq >/dev/null 2>&1
    apt-get install -y -qq curl openssl >/dev/null 2>&1
elif command -v dnf >/dev/null 2>&1; then
    dnf install -y -q curl openssl >/dev/null 2>&1
elif command -v yum >/dev/null 2>&1; then
    yum install -y -q curl openssl >/dev/null 2>&1
fi

# Create directories
mkdir -p /etc/dockpanel/ssl /run/dockpanel /var/lib/dockpanel/git \
         /var/lib/dockpanel/recordings /var/lib/dockpanel/audit \
         /var/run/dockpanel /var/backups/dockpanel /var/www

# Save token and config
echo '{token}' > /etc/dockpanel/agent.token
chmod 600 /etc/dockpanel/agent.token

cat > /etc/dockpanel/agent.env <<ENVEOF
AGENT_TOKEN={token}
AGENT_LISTEN_TCP=0.0.0.0:9443
DOCKPANEL_SERVER_TOKEN={token}
DOCKPANEL_SERVER_ID={server_id}
DOCKPANEL_CENTRAL_URL={panel_url}
ENVEOF
chmod 600 /etc/dockpanel/agent.env

# Download agent binary from the panel itself
curl -fsSL --insecure '{panel_url}/api/agent/binary?arch={arch}' \
    -o /usr/local/bin/dockpanel-agent
chmod +x /usr/local/bin/dockpanel-agent

# Generate self-signed TLS cert
if [ ! -f /etc/dockpanel/ssl/agent.crt ]; then
    openssl req -x509 -newkey rsa:2048 -keyout /etc/dockpanel/ssl/agent.key \
        -out /etc/dockpanel/ssl/agent.crt -days 3650 -nodes \
        -subj '/CN=axiapanel-agent' >/dev/null 2>&1
    chmod 600 /etc/dockpanel/ssl/agent.key
fi

# Persist socket dir across reboots
echo 'd /run/dockpanel 0755 root root -' > /etc/tmpfiles.d/dockpanel.conf

# Create systemd service
cat > /etc/systemd/system/dockpanel-agent.service <<UNITEOF
[Unit]
Description=AxiaPanel Agent
After=network.target docker.service
Wants=docker.service
StartLimitBurst=5
StartLimitIntervalSec=60

[Service]
Type=simple
ExecStartPre=/bin/sh -c 'mkdir -p /run/dockpanel /var/lib/dockpanel/git'
ExecStart=/usr/local/bin/dockpanel-agent
EnvironmentFile=/etc/dockpanel/agent.env
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
if command -v ufw >/dev/null 2>&1; then
    ufw allow 9443/tcp >/dev/null 2>&1 || true
elif command -v firewall-cmd >/dev/null 2>&1; then
    firewall-cmd --permanent --add-port=9443/tcp >/dev/null 2>&1 || true
    firewall-cmd --reload >/dev/null 2>&1 || true
fi

# Start agent
systemctl daemon-reload
systemctl enable dockpanel-agent >/dev/null 2>&1
systemctl start dockpanel-agent

# Wait for agent to be ready (up to 15s)
for i in $(seq 1 15); do
    if [ -S /var/run/dockpanel/agent.sock ]; then
        break
    fi
    sleep 1
done

# Print cert fingerprint (the panel will pin this for future requests)
openssl x509 -in /etc/dockpanel/ssl/agent.crt -fingerprint -sha256 -noout \
    | sed 's/.*=//' | tr -d ':' | tr 'A-F' 'a-f'
"#,
        token = agent_token,
        server_id = server_id,
        panel_url = panel_url,
        arch = arch,
    )
}

# CLI Reference

The `axiapanel` CLI provides full command-line access to all panel operations. It communicates with the agent via Unix socket using the token stored at `/etc/axiapanel/agent.token`.

## Global Options

| Option | Default | Description |
|--------|---------|-------------|
| `-o, --output <FORMAT>` | `table` | Output format: `table` or `json` |
| `--version` | | Print version and exit |
| `--help` | | Print help |

## Commands

---

### `axiapanel status`

Show server status including CPU, memory, disk, and uptime.

```bash
axiapanel status
```

```
SERVER STATUS
─────────────────────────────────
Hostname:    web-1
OS:          Ubuntu 22.04.4 LTS
Kernel:      6.8.0-106-generic
Uptime:      14 days, 3 hours
Load:        0.12 0.08 0.05

CPU:         3.2% (2 cores)
Memory:      847 MB / 2048 MB (41.4%)
Disk:        12.3 GB / 50.0 GB (24.6%)
```

JSON output:

```bash
axiapanel status -o json
```

---

### `axiapanel sites`

List all Nginx sites.

```bash
axiapanel sites
```

```
DOMAIN                RUNTIME    SSL    STATUS
example.com           php        ✓      active
api.example.com       proxy      ✓      active
blog.example.com      static     ✓      active
```

Filter by domain:

```bash
axiapanel sites -f blog
```

#### `axiapanel sites create`

Create a new site.

```bash
axiapanel sites create example.com --runtime php --ssl --ssl-email admin@example.com
```

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `DOMAIN` | Yes | | Domain name |
| `--runtime` | No | `static` | Runtime type: `static`, `php`, or `proxy` |
| `--proxy-port` | No | | Upstream port (required for `--runtime proxy`) |
| `--ssl` | No | | Provision Let's Encrypt SSL |
| `--ssl-email` | No | | Email for Let's Encrypt (required with `--ssl`) |

```
Site created: example.com
  Runtime:  php
  Root:     /var/www/example.com/public
  SSL:      provisioned (expires 2026-06-18)
```

#### `axiapanel sites info`

Show site details.

```bash
axiapanel sites info example.com
```

```
SITE DETAILS
─────────────────────────────────
Domain:      example.com
Runtime:     php
Root:        /var/www/example.com/public
SSL:         active (expires 2026-06-18)
Created:     2026-03-15 10:30:00
```

#### `axiapanel sites delete`

Delete a site and its Nginx configuration.

```bash
axiapanel sites delete example.com
```

```
Site deleted: example.com
```

---

### `axiapanel db`

List databases.

```bash
axiapanel db
```

```
NAME              ENGINE      PORT    STATUS     SIZE
mysite_db         mysql       3306    running    245 MB
analytics_db      postgres    5433    running    1.2 GB
```

Filter by name:

```bash
axiapanel db -f analytics
```

#### `axiapanel db create`

Create a new database in a Docker container.

```bash
axiapanel db create blog_db --engine mysql --password "s3cureP@ss" --port 3307
```

| Argument | Required | Description |
|----------|----------|-------------|
| `NAME` | Yes | Database name |
| `--engine` | Yes | Engine: `mysql`, `mariadb`, or `postgres` |
| `--password` | Yes | Root/admin password |
| `--port` | Yes | Host port to expose |

```
Database created: blog_db
  Engine:    mysql
  Port:      3307
  Container: axiapanel-db-blog_db
```

#### `axiapanel db delete`

Delete a database container.

```bash
axiapanel db delete abc123def456
```

---

### `axiapanel apps`

List Docker apps.

```bash
axiapanel apps
```

```
NAME           IMAGE                   PORT    STATUS     DOMAIN
ghost          ghost:5-alpine          2368    running    blog.example.com
grafana        grafana/grafana:latest  3000    running    metrics.example.com
n8n            n8nio/n8n:latest        5678    running    —
```

Filter by name or domain:

```bash
axiapanel apps -f grafana
```

#### `axiapanel apps templates`

List all available app templates.

```bash
axiapanel apps templates
```

```
ID                CATEGORY      NAME             DESCRIPTION
ghost             cms           Ghost            Modern publishing platform
wordpress         cms           WordPress        Popular CMS and blogging platform
grafana           monitoring    Grafana          Observability dashboards
prometheus        monitoring    Prometheus       Metrics collection
uptime-kuma       monitoring    Uptime Kuma      Uptime monitoring
nextcloud         storage       Nextcloud        Self-hosted cloud storage
...
(152 templates across 14 categories)
```

#### `axiapanel apps deploy`

Deploy an app from a template.

```bash
axiapanel apps deploy ghost --name my-blog --port 2368 --domain blog.example.com --ssl-email admin@example.com
```

| Argument | Required | Description |
|----------|----------|-------------|
| `TEMPLATE` | Yes | Template ID (from `apps templates`) |
| `--name` | Yes | App name |
| `--port` | Yes | Host port |
| `--domain` | No | Domain for auto reverse proxy + SSL |
| `--ssl-email` | No | Email for Let's Encrypt (requires `--domain`) |

```
Deploying ghost as "my-blog"...
  Pulling image: ghost:5-alpine
  Starting container on port 2368
  Configuring reverse proxy: blog.example.com → localhost:2368
  Provisioning SSL for blog.example.com
App deployed: my-blog (blog.example.com)
```

#### `axiapanel apps stop`

```bash
axiapanel apps stop abc123def456
```

#### `axiapanel apps start`

```bash
axiapanel apps start abc123def456
```

#### `axiapanel apps restart`

```bash
axiapanel apps restart abc123def456
```

#### `axiapanel apps remove`

```bash
axiapanel apps remove abc123def456
```

#### `axiapanel apps logs`

View container logs.

```bash
axiapanel apps logs abc123def456
```

#### `axiapanel apps compose`

Deploy from a Docker Compose file.

```bash
axiapanel apps compose /path/to/docker-compose.yml
```

---

### `axiapanel services`

Check service health.

```bash
axiapanel services
```

```
SERVICE              STATUS      PID     MEMORY
axiapanel-agent      ● running   1234    30 MB
axiapanel-api        ● running   1235    27 MB
nginx                ● running   1236    12 MB
docker               ● running   1237    45 MB
php8.3-fpm           ● running   1238    18 MB
fail2ban             ● running   1239    8 MB
ufw                  ● active    —       —
```

Filter by service name:

```bash
axiapanel services -f nginx
```

---

### `axiapanel ssl`

SSL certificate management.

#### `axiapanel ssl status`

Check certificate details for a domain.

```bash
axiapanel ssl status example.com
```

```
SSL CERTIFICATE
─────────────────────────────────
Domain:      example.com
Issuer:      Let's Encrypt
Valid From:  2026-03-15
Expires:     2026-06-13
Days Left:   85
Auto-Renew:  yes
```

#### `axiapanel ssl provision`

Provision a Let's Encrypt certificate.

```bash
axiapanel ssl provision example.com --email admin@example.com --runtime php
```

| Argument | Required | Default | Description |
|----------|----------|---------|-------------|
| `DOMAIN` | Yes | | Domain name |
| `--email` | Yes | | Let's Encrypt email |
| `--runtime` | No | `static` | Site runtime: `static`, `php`, or `proxy` |
| `--proxy-port` | No | | Upstream port (for proxy runtime) |

---

### `axiapanel backup`

Backup management.

#### `axiapanel backup create`

```bash
axiapanel backup create example.com
```

```
Creating backup for example.com...
Backup created: example.com_2026-03-20_143022.tar.gz (45.2 MB)
```

#### `axiapanel backup list`

```bash
axiapanel backup list example.com
```

#### `axiapanel backup restore`

```bash
axiapanel backup restore example.com example.com_2026-03-20_143022.tar.gz
```

```
Restoring example.com from example.com_2026-03-20_143022.tar.gz...
Restore complete.
```

#### `axiapanel backup delete`

```bash
axiapanel backup delete example.com example.com_2026-03-18_020000.tar.gz
```

---

### `axiapanel logs`

View system and site logs.

```bash
axiapanel logs
```

| Option | Default | Description |
|--------|---------|-------------|
| `-d, --domain` | | Domain for site-specific logs |
| `-t, --type` | `syslog` | Log type: `syslog`, `nginx`, `auth`, `php`, `mysql` |
| `-n, --lines` | `50` | Number of lines to show |
| `-f, --filter` | | Filter text (substring match) |
| `-s, --search` | | Search pattern (regex) |

Examples:

```bash
# View system log
axiapanel logs

# View Nginx error log for a site
axiapanel logs -d example.com -t nginx -n 100

# Search for errors in auth log
axiapanel logs -t auth -s "Failed password"

# Filter PHP logs
axiapanel logs -t php -f "Fatal error" -n 200
```

---

### `axiapanel security`

Security overview.

```bash
axiapanel security
```

```
SECURITY OVERVIEW
─────────────────────────────────
Score:           82/100
Firewall:        active (UFW)
Fail2Ban:        active (3 jails)
SSH Root Login:  disabled
SSH Password:    disabled
2FA:             enabled
Last Scan:       2026-03-19 02:00
```

#### `axiapanel security scan`

Run a security scan.

```bash
axiapanel security scan
```

```
Running security scan...

FINDINGS
  [HIGH]   Port 3306 exposed to all IPs
  [MEDIUM] SSH password authentication still enabled
  [LOW]    Unattended upgrades not configured
  [PASS]   Firewall active
  [PASS]   Fail2Ban running
  [PASS]   SSH root login disabled
  [PASS]   SSL certificates valid

Score: 78/100 (3 findings)
```

#### `axiapanel security firewall`

List firewall rules.

```bash
axiapanel security firewall
```

```
#    ACTION    FROM           PORT      PROTO
1    allow     Anywhere       22/tcp    tcp
2    allow     Anywhere       80/tcp    tcp
3    allow     Anywhere       443/tcp   tcp
4    allow     Anywhere       8443/tcp  tcp
```

#### `axiapanel security firewall add`

Add a firewall rule.

```bash
axiapanel security firewall add --port 3000 --proto tcp --action allow
axiapanel security firewall add --port 5432 --proto tcp --action allow --from 10.0.0.0/8
```

| Option | Default | Description |
|--------|---------|-------------|
| `--port` | | Port number |
| `--proto` | `tcp` | Protocol: `tcp` or `udp` |
| `--action` | `allow` | Action: `allow` or `deny` |
| `--from` | | Source IP or CIDR (optional) |

#### `axiapanel security firewall remove`

Remove a rule by number.

```bash
axiapanel security firewall remove 4
```

---

### `axiapanel top`

Show top processes by CPU usage.

```bash
axiapanel top
```

```
PID      CPU%    MEM%    COMMAND
1234     12.3    2.1     /usr/sbin/mysqld
5678     8.7     1.4     php-fpm: pool www
9012     3.2     0.8     nginx: worker process
1357     2.1     1.2     axiapanel-agent
2468     1.8     1.1     axiapanel-api
```

---

### `axiapanel php`

PHP version management.

```bash
axiapanel php
```

```
VERSION    STATUS     FPM SOCKET
8.1        installed  /run/php/php8.1-fpm.sock
8.3        installed  /run/php/php8.3-fpm.sock
```

#### `axiapanel php install`

Install a PHP version.

```bash
axiapanel php install 8.4
```

Supported versions: `8.1`, `8.2`, `8.3`, `8.4`.

---

### `axiapanel diagnose`

Run server diagnostics across 6 categories.

```bash
axiapanel diagnose
```

```
DIAGNOSTICS
─────────────────────────────────
[✓] Nginx configuration valid
[✓] All SSL certificates valid (next expiry: 85 days)
[✓] Disk usage: 24.6% (12.3 GB / 50 GB)
[✓] Memory usage: 41.4% (847 MB / 2048 MB)
[✓] Docker: 5 containers running, 0 unhealthy
[!] PHP-FPM: high average response time (320ms)
[✓] Fail2Ban: 3 jails active
[✓] Firewall: active

Score: 95/100 (1 warning)
```

---

### `axiapanel export`

Export server configuration as YAML (Infrastructure as Code).

```bash
# Print to stdout
axiapanel export

# Save to file
axiapanel export -O config.yml
```

Sample output:

```yaml
version: "1"
sites:
  - domain: example.com
    runtime: php
    ssl: true
  - domain: api.example.com
    runtime: proxy
    proxy_port: 3000
    ssl: true
databases:
  - name: mysite_db
    engine: mysql
    port: 3306
apps:
  - name: ghost
    template: ghost
    port: 2368
    domain: blog.example.com
```

---

### `axiapanel apply`

Apply server configuration from a YAML file.

```bash
# Dry run (show what would change)
axiapanel apply config.yml --dry-run

# Apply changes
axiapanel apply config.yml --email admin@example.com
```

| Argument | Required | Description |
|----------|----------|-------------|
| `FILE` | Yes | Path to YAML config file |
| `--dry-run` | No | Show changes without applying |
| `--email` | No | Email for Let's Encrypt SSL provisioning |

Dry run output:

```
DRY RUN — no changes will be made
  [+] Create site: staging.example.com (static, SSL)
  [~] Update site: api.example.com (proxy_port 3000 → 3001)
  [=] No change: example.com
  [+] Create database: staging_db (postgres, port 5434)
```

---

### `axiapanel completions`

Generate shell completions.

```bash
# Bash
axiapanel completions bash > /etc/bash_completion.d/axiapanel

# Zsh
axiapanel completions zsh > ~/.zfunc/_axiapanel

# Fish
axiapanel completions fish > ~/.config/fish/completions/axiapanel.fish
```

Supported shells: `bash`, `zsh`, `fish`, `powershell`, `elvish`.

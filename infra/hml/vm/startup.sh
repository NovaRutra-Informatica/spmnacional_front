#!/usr/bin/env bash
# Debian 12 GCE startup: prepare only the host; never invent credentials or seed data.
set -Eeuo pipefail
umask 077
[[ ${EUID} -eq 0 ]] || { printf '%s\n' 'startup.sh exige root.' >&2; exit 1; }
export DEBIAN_FRONTEND=noninteractive
. /etc/os-release
[[ $ID == debian && $VERSION_ID == 12 ]] || {
    printf '%s\n' 'Este startup foi preparado para Debian 12.' >&2
    exit 1
}

install -d -m 0700 /opt/spm-hml /opt/spm-hml/generated /opt/spm-hml/state /opt/spm-hml/backups
timedatectl set-timezone America/Sao_Paulo
apt-get update -qq
apt-get install -y -qq ca-certificates curl gnupg python3 util-linux

if ! command -v docker >/dev/null || ! docker compose version >/dev/null 2>&1; then
    install -d -m 0755 /etc/apt/keyrings
    curl --fail --silent --show-error --retry 3 \
        https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
    chmod 0644 /etc/apt/keyrings/docker.asc
    cat > /etc/apt/sources.list.d/docker.sources <<EOF
Types: deb
URIs: https://download.docker.com/linux/debian
Suites: bookworm
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
    apt-get update -qq
    apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi

if ! command -v gcloud >/dev/null; then
    curl --fail --silent --show-error --retry 3 https://packages.cloud.google.com/apt/doc/apt-key.gpg \
        | gpg --dearmor --yes -o /etc/apt/keyrings/google-cloud.gpg
    chmod 0644 /etc/apt/keyrings/google-cloud.gpg
    printf '%s\n' 'deb [signed-by=/etc/apt/keyrings/google-cloud.gpg] https://packages.cloud.google.com/apt cloud-sdk main' \
        > /etc/apt/sources.list.d/google-cloud-sdk.list
    apt-get update -qq
    apt-get install -y -qq google-cloud-cli
fi

systemctl enable --now docker
if [[ ! -e /swapfile ]]; then
    fallocate -l 1G /swapfile
    chmod 0600 /swapfile
    mkswap /swapfile >/dev/null
fi
if ! swapon --show=NAME --noheadings | grep -Fxq /swapfile; then
    swapon /swapfile
fi
if ! grep -q '^/swapfile ' /etc/fstab; then
    printf '%s\n' '/swapfile none swap sw 0 0' >> /etc/fstab
fi
printf '%s\n' 'vm.swappiness=10' > /etc/sysctl.d/90-spm-hml.conf
sysctl -p /etc/sysctl.d/90-spm-hml.conf >/dev/null

cat > /etc/systemd/system/spm-hml-deploy.service <<'EOF'
[Unit]
Description=Initialize SPM HML only after protected release/config are present
Wants=network-online.target
After=network-online.target docker.service
Requires=docker.service
ConditionPathExists=/opt/spm-hml/deploy.sh

[Service]
Type=oneshot
WorkingDirectory=/opt/spm-hml
ExecStart=/bin/bash /opt/spm-hml/deploy.sh --boot
TimeoutStartSec=1200
UMask=0077

[Install]
WantedBy=multi-user.target
EOF
cat > /etc/systemd/system/spm-hml-gateway.service <<'EOF'
[Unit]
Description=Evaluate Brasília HML access window, fail closed
After=docker.service
Requires=docker.service
ConditionPathExists=/opt/spm-hml/gateway.sh

[Service]
Type=oneshot
ExecStart=/bin/bash /opt/spm-hml/gateway.sh
TimeoutStartSec=40
UMask=0077
EOF
cat > /etc/systemd/system/spm-hml-gateway.timer <<'EOF'
[Unit]
Description=Check SPM HML access every minute

[Timer]
OnBootSec=5s
OnCalendar=*-*-* *:*:00
AccuracySec=1s
RandomizedDelaySec=0
Unit=spm-hml-gateway.service

[Install]
WantedBy=timers.target
EOF
cat > /etc/systemd/system/spm-hml-cron.service <<'EOF'
[Unit]
Description=SPM HML retention, Calendar and PostgreSQL backup
After=docker.service
Requires=docker.service
ConditionPathExists=/opt/spm-hml/cron.sh

[Service]
Type=oneshot
ExecStart=/bin/bash /opt/spm-hml/cron.sh
TimeoutStartSec=600
UMask=0077
EOF
cat > /etc/systemd/system/spm-hml-cron.timer <<'EOF'
[Unit]
Description=Evaluate HML operations during the configured VM window

[Timer]
OnBootSec=45s
OnCalendar=*-*-* *:*:00
AccuracySec=1s
RandomizedDelaySec=0
Unit=spm-hml-cron.service

[Install]
WantedBy=timers.target
EOF

systemctl daemon-reload
systemctl enable spm-hml-deploy.service spm-hml-gateway.timer spm-hml-cron.timer
systemctl start spm-hml-gateway.timer spm-hml-cron.timer
# First boot has no release/config. A later reboot can initialize the installed release.
if [[ -f /opt/spm-hml/deploy.sh && -s /opt/spm-hml/release.env && -s /opt/spm-hml/config.env ]]; then
    systemctl start --no-block spm-hml-deploy.service
else
    printf '%s\n' 'Host HML preparado. Site fechado até instalar uma release e configuração completas.'
fi

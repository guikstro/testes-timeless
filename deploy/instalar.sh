#!/usr/bin/env bash
# Instala e sobe a plataforma num servidor Ubuntu novo (ex.: Oracle Cloud Always Free).
#
# No servidor:
#   git clone https://github.com/guikstro/testes-timeless.git tracking
#   cd tracking && git switch deploy-gratuito
#   bash deploy/instalar.sh
#
# Rodar de novo atualiza: puxa o código, reconstrói e reinicia, sem perder dados.
set -euo pipefail
cd "$(dirname "$0")"

# 1. Docker
if ! command -v docker >/dev/null 2>&1; then
  echo "Instalando o Docker..."
  curl -fsSL https://get.docker.com | sudo sh
  sudo usermod -aG docker "$USER" || true
fi
DOCKER="docker"
docker info >/dev/null 2>&1 || DOCKER="sudo docker"

# 2. Firewall do Ubuntu (a Oracle bloqueia 80/443 por padrão na imagem Ubuntu)
if command -v iptables >/dev/null 2>&1; then
  for p in 80 443; do
    sudo iptables -C INPUT -p tcp --dport "$p" -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 6 -p tcp --dport "$p" -j ACCEPT
  done
  sudo iptables -C INPUT -p udp --dport 443 -j ACCEPT 2>/dev/null || sudo iptables -I INPUT 6 -p udp --dport 443 -j ACCEPT
  command -v netfilter-persistent >/dev/null 2>&1 && sudo netfilter-persistent save || true
fi

# 3. Configuração
[ -f .env.prod ] || cp .env.prod.example .env.prod
gerar() { # gerar CHAVE comando
  if grep -qE "^$1=$" .env.prod; then
    sed -i "s|^$1=$|$1=$(eval "$2")|" .env.prod
  fi
}
gerar POSTGRES_PASSWORD "openssl rand -hex 24"
gerar JWT_SECRET "openssl rand -base64 48 | tr -d '\n/+='"
gerar TOKEN_ENCRYPTION_KEY "openssl rand -hex 32"
gerar WHATSAPP_WEBHOOK_VERIFY_TOKEN "openssl rand -hex 16"
gerar WHATSAPP_APP_SECRET "openssl rand -hex 16"

if grep -qE "^DOMINIO_APP=$" .env.prod; then
  IP="$(curl -fsS https://api.ipify.org || curl -fsS ifconfig.me)"
  echo "Sem domínio: usando sslip.io com o IP $IP"
  sed -i "s|^DOMINIO_APP=$|DOMINIO_APP=app.$IP.sslip.io|; s|^DOMINIO_ADMIN=$|DOMINIO_ADMIN=admin.$IP.sslip.io|; s|^DOMINIO_LINK=$|DOMINIO_LINK=link.$IP.sslip.io|" .env.prod
fi
if grep -qE "^EMAIL_CERTIFICADO=$" .env.prod; then
  echo "Preencha EMAIL_CERTIFICADO em deploy/.env.prod e rode de novo."; exit 1
fi

# 4. Memória extra (as construções do Next pedem bastante RAM)
if [ ! -f /swapfile ] && [ "$(free -m | awk '/Mem:/{print $2}')" -lt 6000 ]; then
  sudo fallocate -l 4G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
  echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab >/dev/null
fi

# 5. Sobe
git -C .. pull --ff-only || true
PERFIS=""
grep -qE "^RCLONE_DESTINO=.+" .env.prod && PERFIS="--profile offsite"
$DOCKER compose -f docker-compose.prod.yml --env-file .env.prod $PERFIS up -d --build --remove-orphans
$DOCKER compose -f docker-compose.prod.yml --env-file .env.prod ps

set -a; . ./.env.prod; set +a
echo
echo "Pronto:"
echo "  Painel do cliente: https://$DOMINIO_APP"
echo "  Painel da equipe:  https://$DOMINIO_ADMIN"
echo "  Links rastreáveis: https://$DOMINIO_LINK/r/<código>"

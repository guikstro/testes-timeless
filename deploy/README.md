# Subir a plataforma de graça (sem Render)

Tudo roda num servidor só, com Docker: banco, filas, API (com o WhatsApp por
QR Code), painel do cliente, painel da equipe, cópia diária do banco e HTTPS.

| Peça | Antes (pago) | Agora (grátis) |
|---|---|---|
| API + filas + WhatsApp | Render Starter, US$ 7/mês | Oracle Cloud Always Free |
| Painel e admin | Render | mesmo servidor |
| Banco | Supabase | Postgres no mesmo servidor (backup diário, 30 dias) |
| Redis | Render Key Value free (perdia dados) | Redis no mesmo servidor, gravando em disco |
| HTTPS | Render | Caddy + Let's Encrypt |
| Domínio | onrender.com | sslip.io (grátis) ou um subdomínio seu |

**Por que Oracle:** a API precisa ficar ligada 24 h, senão o WhatsApp
desconecta e os links `/r/` param. Os planos grátis da Render, Koyeb e
parecidos "dormem" sem uso. O Always Free da Oracle dá uma máquina ARM com até
4 CPUs e 24 GB de RAM, ligada o tempo todo, sem prazo para acabar.

## 1. Criar o servidor (uma vez, ~15 min)

1. Crie a conta em <https://www.oracle.com/cloud/free/>. Pede cartão só para
   verificar identidade; o Always Free não cobra. Escolha a região
   **Brazil East (São Paulo)**. A região não muda depois.
2. **Compute → Instances → Create instance**
   - Image: **Ubuntu 24.04**
   - Shape: **Ampere (VM.Standard.A1.Flex)**, 4 OCPU e 24 GB (tudo dentro do grátis)
   - Networking: deixe criar a VCN e **marque "Assign a public IPv4 address"**
   - SSH keys: baixe a chave privada (ou cole a sua pública)
   - Se aparecer "Out of capacity", tente de novo mais tarde ou com 2 OCPU / 12 GB.
3. Abra as portas 80 e 443: na instância, **Subnet → Security List → Add Ingress Rules**
   - Source CIDR `0.0.0.0/0`, TCP, porta de destino `80`
   - Source CIDR `0.0.0.0/0`, TCP, porta de destino `443`
4. Anote o **IP público** da instância.

## 2. Instalar a plataforma (~10 min)

```bash
ssh -i chave.key ubuntu@IP_DO_SERVIDOR
git clone https://github.com/guikstro/testes-timeless.git tracking
cd tracking && git switch deploy-gratuito
cp deploy/.env.prod.example deploy/.env.prod
nano deploy/.env.prod     # preencha só EMAIL_CERTIFICADO (e os domínios, se tiver)
bash deploy/instalar.sh
```

O script instala o Docker, libera o firewall do Ubuntu, gera todas as senhas,
usa `sslip.io` se os domínios ficarem vazios e sobe tudo. No fim mostra:

- Painel do cliente: `https://app.IP.sslip.io`
- Painel da equipe: `https://admin.IP.sslip.io`
- Links rastreáveis: `https://link.IP.sslip.io/r/<código>`

### Domínio próprio (opcional, recomendado para os links)

Crie três registros **A** apontando para o IP do servidor, por exemplo no
Hostinger (DNS de um domínio da Timeless):

| Nome | Tipo | Valor |
|---|---|---|
| `app` | A | IP do servidor |
| `admin` | A | IP do servidor |
| `link` | A | IP do servidor |

Coloque os nomes completos em `DOMINIO_APP`, `DOMINIO_ADMIN` e `DOMINIO_LINK`
e rode `bash deploy/instalar.sh` de novo. O Caddy emite os certificados sozinho.

## 3. Primeiro acesso

1. Crie a conta em `https://DOMINIO_APP` (cadastro público, limitado a 4 contas
   em produção).
2. Para recuperar senha com `EMAIL_TRANSPORTE=registro`, o link aparece no log:
   `docker compose -f deploy/docker-compose.prod.yml --env-file deploy/.env.prod logs api | grep -i senha`

## 4. Trazer os dados antigos do Supabase (opcional)

Se o projeto do Supabase ainda existir, pegue a `DATABASE_URL` (Supabase →
Project Settings → Database → Connection string) e, no servidor:

```bash
cd tracking/deploy
docker run --rm postgres:17-alpine pg_dump "URL_DO_SUPABASE" --no-owner --no-privileges | \
  docker compose -f docker-compose.prod.yml --env-file .env.prod exec -T postgres psql -U tintim -d tintim
```

Atenção: a `TOKEN_ENCRYPTION_KEY` precisa ser **a mesma do Render** para as
sessões de WhatsApp e tokens antigos continuarem legíveis. Sem ela, é só
reconectar o WhatsApp e a Meta pelo painel.

## Rotina

| O quê | Comando (em `tracking/deploy`) |
|---|---|
| Atualizar | `bash instalar.sh` |
| Ver logs da API | `docker compose -f docker-compose.prod.yml --env-file .env.prod logs -f api` |
| Reiniciar | `docker compose -f docker-compose.prod.yml --env-file .env.prod restart` |
| Backups | volume `tracking_backups` (um `.sql.gz` por dia, 30 dias) |

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

## 1-B. Alternativa: Google Cloud e2-micro (grátis para sempre)

Máquina menor (2 vCPU compartilhadas, 1 GB de RAM, 30 GB de disco), só nos
EUA. Por isso as imagens são construídas no GitHub e o servidor só baixa.

1. <https://console.cloud.google.com> → crie um projeto e ative o
   faturamento (pede cartão; o e2-micro fica dentro do nível gratuito).
2. **Compute Engine → VM instances → Create instance**
   - Region: **us-central1**, **us-east1** ou **us-west1** (só essas são grátis)
   - Machine type: **e2-micro**
   - Boot disk: **Ubuntu 24.04 LTS**, **Standard persistent disk**, **30 GB**
   - Firewall: marque **Allow HTTP** e **Allow HTTPS**
3. **VPC network → IP addresses**: promova o IP externo para **estático**
   (grátis enquanto estiver ligado à VM).
4. Entre pelo botão **SSH** do console (abre no navegador).
5. GitHub → Settings → Secrets and variables → Actions → **Variables**:
   `DOMINIO_APP=app.IP.sslip.io`, `DOMINIO_ADMIN=admin.IP.sslip.io`,
   `DOMINIO_LINK=link.IP.sslip.io`. Rode o fluxo **Produção** à mão
   (Actions → Produção → Run workflow) para gerar as imagens.
6. No servidor, siga o passo 2 abaixo, mas no `.env.prod` coloque também
   `MODO_IMAGENS=sim` e os mesmos três domínios. Antes do `instalar.sh`,
   entre no ghcr.io com um token do GitHub (`read:packages`):
   `echo TOKEN | sudo docker login ghcr.io -u guikstro --password-stdin`

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

## 5. Ficar sabendo quando algo cai

Três camadas, todas grátis:

1. **Dentro do servidor:** a API tem healthcheck e o contêiner `autoheal`
   reinicia sozinho o que travar. O `restart: unless-stopped` religa tudo
   depois de um reboot.
2. **WhatsApp:** quando a sessão cai sozinha (celular desligado, "sair" pelo
   aparelho), a plataforma avisa no sino e por push: "WhatsApp desconectado".
3. **De fora (UptimeRobot, grátis):** crie uma conta em <https://uptimerobot.com>
   e adicione dois monitores HTTP(s) de 5 em 5 minutos, com aviso por e-mail
   ou Telegram:
   - `https://DOMINIO_LINK/health` (palavra-chave `"status":"ok"`)
   - `https://DOMINIO_APP/login`

## 6. Backup fora do servidor (recomendado)

O backup diário fica no próprio servidor. Para não perder tudo se a máquina
sumir, copie para o **Object Storage da Oracle** (20 GB grátis):

1. Oracle → **Storage → Buckets → Create bucket** `tracking-backups`.
2. **Perfil → Customer secret keys → Generate** (gera Access/Secret key).
3. Preencha o bloco `RCLONE_*` em `.env.prod` (exemplo no `.env.prod.example`;
   o `namespace` aparece na página do bucket) e rode `bash instalar.sh`.

O contêiner `backup-offsite` copia os `.sql.gz` de hora em hora e nunca apaga
nada no destino.

## 7. Atualização automática pelo GitHub

O fluxo `.github/workflows/producao.yml` publica sozinho: depois que o CI
passa num envio para `main` ou `deploy-gratuito`, ele entra no servidor por
SSH, roda `instalar.sh` e confere `/health` de fora.

No GitHub → **Settings → Secrets and variables → Actions**:

| Tipo | Nome | Valor |
|---|---|---|
| Secret | `SERVIDOR_HOST` | IP do servidor |
| Secret | `SERVIDOR_USUARIO` | `ubuntu` |
| Secret | `SERVIDOR_CHAVE_SSH` | conteúdo da chave privada |
| Variable | `DOMINIO_LINK` | o mesmo do `.env.prod` |

Sem esses valores o fluxo só avisa e não publica nada.

## 8. Google Ads de um cliente (ex.: Quezado)

A plataforma guarda o `gclid` de cada clique e devolve ao Google Ads os
leads que viraram **qualificado** e **venda**. Assim o Google aprende com
quem virou cliente, e não só com o clique.

1. **Links:** em Links, crie um link por campanha (destino
   `https://wa.me/55DDDNUMERO`, campanha = nome da campanha no Google Ads).
   Use esse link no botão de WhatsApp da landing page. A página repassa o
   `gclid` e os `utm_*` para ele.
2. **Ações de conversão no Google Ads:** Metas → Conversões → Nova → Importar
   → "Rastrear conversões de cliques". Crie duas: `Lead qualificado` e `Venda`.
3. **Na plataforma:** Integrações → Google Ads, informe os mesmos dois nomes
   e copie o script.
4. **No Google Ads:** Ferramentas → Ações em massa → Scripts → novo script,
   cole, autorize e programe **de hora em hora**.

## Pendências conhecidas (não bloqueiam)

- Aviso do Prisma sobre `package.json#prisma`: só vira problema no Prisma 7.
  Migrar para `prisma.config.ts` muda a leitura do `.env`; fazer junto com a
  troca de versão.
- O ramo `teste-ia-vendas` (mede acerto e custo da IA de vendas) não foi
  juntado à `main`.

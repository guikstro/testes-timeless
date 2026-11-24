# Guia rápido: a plataforma no ar (Vercel + Render + Supabase)

Tudo no plano grátis. O seu Mac não precisa ficar ligado.

## Onde fica cada coisa

| O quê | Endereço | Conta |
|---|---|---|
| Painel dos clientes | https://tracking-timeless.vercel.app | cada cliente entra com o próprio e-mail |
| Painel da equipe (admin) | https://tracking-timeless-admin.vercel.app | guilhermecastro1009@gmail.com |
| API, WhatsApp e links `/r/` | https://tracking-api-z557.onrender.com | Render (login Google) |
| Banco de dados | Supabase "tracking-timeless" | Vercel → Storage |

## As 3 contas que importam

- **Vercel** (vercel.com, login GitHub guikstro): painel e admin. Projetos `tracking-timeless` e `tracking-timeless-admin`.
- **Render** (dashboard.render.com, login Google): `tracking-api` (API + WhatsApp) e `tracking-redis` (filas).
- **Supabase** (pela Vercel → Storage → tracking-timeless): o banco. Grátis até 500 MB.

## Seu acesso

- **guilhermecastro1009@gmail.com** é administrador da plataforma: vê o menu **Clientes**, entra na conta de qualquer cliente e gera o link de conexão do WhatsApp.
- **contato@timeless.lat** é o login do cliente Quezado (só vê a Quezado).

## Rotina

- **Cliente novo:** criar conta em `/register` com o e-mail e o nome da empresa → dentro da conta: WhatsApp (QR ou link de conexão), Links, Integrações (Google Ads / Meta).
- **WhatsApp caiu:** aparece aviso no sino. Clientes → empresa → **Gerar link de conexão** e mandar para o cliente (vale 24 h, uma vez).
- **Esqueci a senha:** "Esqueci a senha" no login. O e-mail não é enviado de verdade: o link aparece no log do Render (tracking-api → Logs → buscar `redefinir-senha`).
- **Atualizar o sistema:** todo envio na branch `deploy-gratuito` do GitHub publica sozinho na Vercel e no Render (5 a 10 min).

## O que é grátis e seus limites

- **Render grátis dorme** após 15 min sem acesso. Um agendamento dentro do banco (`manter-api-acordada`, a cada 5 min) mantém acordado. Se a API demorar ~50 s para responder, ela estava dormindo.
- **750 horas/mês** de Render por conta: dá para 1 serviço ligado direto. Não crie outro serviço grátis que fique acordado.
- **Redis grátis** não guarda em disco: um reinício perde tarefas agendadas (lembretes). Leads e mensagens ficam no banco e não se perdem.
- **Supabase grátis:** 500 MB (hoje ~52 MB) e pausa se ficar 7 dias sem uso (o despertador evita).
- **Vercel Hobby** é para uso não comercial. Com mais clientes pagantes, migrar para um plano pago ou uma VPS (o projeto já tem tudo em `deploy/`).

## Se algo der errado

1. Abra https://tracking-api-z557.onrender.com/health → deve mostrar `"status":"ok"`.
2. Se não: Render → tracking-api → **Logs** (o erro aparece em vermelho) ou **Manual Deploy → Deploy latest commit**.
3. Painel fora: Vercel → projeto → **Deployments** → último deve estar "Ready".

## Segurança

- O endereço do banco (DATABASE_URL) tem a senha do banco: nunca mande em chat ou e-mail.
- O arquivo `.env.supabase` no Mac guarda esse endereço só para cópias de dados; pode apagar quando não precisar mais.
- Ative a verificação em duas etapas na Vercel, no Render e no GitHub.

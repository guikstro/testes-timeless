# Produção grátis: Vercel + Render + Supabase

| Peça | Onde | Endereço |
|---|---|---|
| Painel do cliente | Vercel (`tracking-timeless`) | https://tracking-timeless.vercel.app |
| Painel da equipe (admin) | Vercel (`tracking-timeless-admin`) | https://tracking-timeless-admin.vercel.app |
| API + WhatsApp + links `/r/` | Render (`tracking-api`, plano free) | https://tracking-api-z557.onrender.com |
| Filas (Redis) | Render (`tracking-redis`, plano free) | interno |
| Banco | Supabase (`tracking-timeless`, via Vercel Storage) | interno |

- Publicação: todo push na branch `deploy-gratuito` publica as três (Vercel e Render).
- O Render grátis dorme depois de 15 min sem acesso. Um monitor (UptimeRobot)
  chamando `https://tracking-api-z557.onrender.com/health` a cada 5 min mantém acordado.
- Variáveis da API: Render → tracking-api → Environment. `DATABASE_URL` é a
  `POSTGRES_URL_NON_POOLING` do Supabase (Vercel → Storage → tracking-timeless).
- Variáveis do painel/admin: Vercel → projeto → Settings → Environment Variables
  (`NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_ADMIN_URL`, `NEXT_PUBLIC_WEB_APP_URL`).

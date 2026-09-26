# Plano: pessoas com acesso a um cliente e a áreas específicas

## Decisões do usuário (2026-09-26)
- A pessoa entra por um **link de convite** e cria a própria senha. Nenhuma senha passa pela Timeless.
- **Um cliente por pessoa.**
- **O cadastro público fecha.** Só a primeira conta de todas pode nascer por `/register` (é a instalação). O resto entra por convite.

## Modelo
- Áreas: `dashboard, conversas, leads, campanhas, verba, links, integracoes, relatorio, configuracoes`. São os itens do menu do cliente.
- Coluna `memberships.areas text[]`:
  - vale só para o papel MEMBER;
  - OWNER/ADMIN (e o operador dentro do cliente) têm tudo;
  - a migration dá todas as áreas aos MEMBER que já existem, para ninguém perder acesso.
- Convite no Redis, como o link do WhatsApp:
  - hash do token → `{ organizationId, email, papel, areas, operador }`;
  - vale 72 h e só uma vez.

## Onde a permissão é conferida
- Na **API**, e não só na tela:
  - `JwtStrategy` carrega `areas` do vínculo quando o papel é MEMBER;
  - o `JwtAuthGuard` confere o `@Areas(...)` da rota, e a rota aceita se a pessoa tiver **qualquer uma** das áreas listadas.
- Rotas por área:

  | Rota | Áreas |
  |---|---|
  | `analytics` | dashboard, campanhas, relatorio, verba |
  | `conversations` | conversas |
  | `leads` | leads, conversas |
  | `verbas`, `controle-de-anuncios` | verba |
  | `tracking-links` | links |
  | `campaigns` | integracoes (`investimento`: também relatorio) |
  | `integrations/google` | integracoes |
  | `integrations/meta` | integracoes (`GET`: também verba) |
  | `integrations/whatsapp` | integracoes (`GET` de status: livre, porque a barra do topo usa) |
  | `organizations/current` (escrita), `classification-rules`, `auditoria` | configuracoes |

- Ficam livres: `auth/*` (a própria conta), `notifications`, `telemetria`, `GET organizations/current`.
- Na tela: o menu mostra só as áreas da pessoa, e a página inicial leva à primeira área permitida.

## Fluxo
1. **Timeless → Configurações → Equipe → "Adicionar pessoa":**
   - o operador informa o e-mail;
   - escolhe o acesso: "Equipe Timeless (tudo)" ou "Um cliente", com o cliente e as áreas;
   - recebe um link.
2. **A pessoa abre `/convite/<token>`:** vê o cliente e o e-mail, informa nome e senha, entra.
3. **Página do cliente (`/clientes/[id]`):** lista quem tem acesso e permite remover (a remoção encerra as sessões).

## Fora de escopo (v1)
- Editar as áreas de quem já entrou (hoje: remover e convidar de novo).
- Convites pendentes listados.
- Somente leitura dentro de uma área.

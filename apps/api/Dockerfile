FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable
ENV CI=true

FROM base AS dev
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile=false
COPY . .
WORKDIR /app/apps/api
RUN pnpm prisma:generate
EXPOSE 3001
CMD ["pnpm", "start:dev"]

FROM base AS build
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
# Trava no lockfile: uma imagem que resolve versões por conta própria não é a
# que foi testada, e a diferença só aparece em produção.
RUN pnpm install --frozen-lockfile
COPY . .
WORKDIR /app/apps/api
RUN pnpm prisma:generate && pnpm build

FROM base AS production
# Declarado na imagem, e não deixado a cargo de quem sobe.
#
# Sem isto `NODE_ENV` chegava vazia em produção, e todo `!== "production"` no
# código respondia "é desenvolvimento". Um deles devolvia o token de
# recuperação de senha dentro da resposta da rota pública.
ENV NODE_ENV=production

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
# Só o necessário para rodar: sem compilador, sem framework de teste, sem
# nada que existe apenas para construir. Menos peso e menos superfície.
RUN pnpm install --prod --frozen-lockfile

COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma
COPY --from=build /app/packages ./packages

WORKDIR /app/apps/api
# O client é gerado, não instalado: por isso o `prisma` é dependência de
# execução aqui, junto do `migrate deploy` que o contêiner roda ao subir.
RUN pnpm prisma generate

# Fora do root. Um processo que não precisa de root não deve rodar como root,
# e este só precisa ler o que está em /app e falar com Postgres e Redis.
RUN chown -R node:node /app
USER node

EXPOSE 3001
CMD ["node", "dist/src/main.js"]

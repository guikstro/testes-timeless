FROM node:22-alpine AS base
WORKDIR /app
RUN corepack enable
ENV CI=true

FROM base AS dev
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile=false
COPY . .
WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "dev"]

FROM base AS build
# `production` já na construção: o Next decide otimizações por esta variável,
# e construir em modo de desenvolvimento gera um pacote diferente do que se
# pretende servir.
ENV NODE_ENV=production
# Endereços que o Next grava no pacote durante a construção (NEXT_PUBLIC_*).
# Vazio por padrão: o código cai no valor de desenvolvimento, como antes.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_ADMIN_URL
ARG NEXT_PUBLIC_WEB_APP_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL \
    NEXT_PUBLIC_ADMIN_URL=$NEXT_PUBLIC_ADMIN_URL \
    NEXT_PUBLIC_WEB_APP_URL=$NEXT_PUBLIC_WEB_APP_URL
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY apps/web/package.json apps/web/package.json
COPY packages/shared/package.json packages/shared/package.json
# Trava no lockfile: uma imagem que resolve versões por conta própria não é a
# que foi testada, e a diferença só aparece em produção.
RUN pnpm install --frozen-lockfile --prod=false
COPY . .
WORKDIR /app/apps/web
RUN pnpm build

FROM base AS production
# Declarado na imagem, e não deixado a cargo de quem sobe.
ENV NODE_ENV=production
COPY --from=build /app ./

# Fora do root, e com posse do que o Next precisa escrever em tempo de
# execução (o cache de páginas fica dentro de .next).
RUN chown -R node:node /app
USER node

WORKDIR /app/apps/web
EXPOSE 3000
CMD ["pnpm", "start"]

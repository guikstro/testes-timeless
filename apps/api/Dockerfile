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
COPY package.json pnpm-workspace.yaml pnpm-lock.yaml* ./
COPY apps/api/package.json apps/api/package.json
COPY packages/shared/package.json packages/shared/package.json
RUN pnpm install --frozen-lockfile=false
COPY . .
WORKDIR /app/apps/api
RUN pnpm prisma:generate && pnpm build

FROM node:22-alpine AS production
WORKDIR /app
RUN corepack enable
COPY --from=build /app ./
WORKDIR /app/apps/api
EXPOSE 3001
CMD ["node", "dist/src/main.js"]

# --- Base ---
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
RUN apk add --no-cache libc6-compat

# --- Pruner ---
FROM base AS pruner
WORKDIR /app
COPY . .
# 仅裁剪 web 应用所需文件 (Version locked to avoid monorepo drift)
RUN pnpm dlx turbo@2.1.2 prune web --docker

# --- Installer ---
FROM base AS installer
WORKDIR /app

# 优先安装依赖（利用 Docker 缓存）
COPY --from=pruner /app/out/json/ ./
RUN pnpm install --frozen-lockfile

# 复制源码并构建
COPY --from=pruner /app/out/full/ ./
# 注入 dummy 变量以通过 Next.js 的构建检录阶段 (Build-time only)
ARG DATABASE_URL=postgresql://postgres:postgres@localhost:5432/build-time-dummy
RUN DATABASE_URL=$DATABASE_URL pnpm turbo run build --filter=web

# --- Runner ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

# 复制 standalone 产物和静态文件
# Next.js standalone outputs to .next/standalone which includes required node_modules
COPY --from=installer /app/apps/web/.next/standalone ./
COPY --from=installer /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=installer /app/apps/web/public ./apps/web/public

EXPOSE 3000
# 启动 Web 服务 (Standalone server entry point relative to standalone output root)
CMD ["node", "apps/web/server.js"]

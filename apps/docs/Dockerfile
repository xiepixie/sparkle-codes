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
# 仅裁剪 docs 应用所需文件
RUN pnpm dlx turbo@2.1.2 prune docs --docker

# --- Installer ---
FROM base AS installer
WORKDIR /app

# 优先安装依赖（利用 Docker 缓存）
COPY --from=pruner /app/out/json/ ./
RUN pnpm install --frozen-lockfile --ignore-scripts

# 复制源码并构建
COPY --from=pruner /app/out/full/ ./

# 确保在具备源码后执行 Fumadocs 内容映射生成，因为 postinstall 时源码还没 copy 进来！
RUN pnpm --filter docs run postinstall

# Docs 可能也需要 DATABASE_URL 环境变量注入来确保构建不崩溃（即使它不直接使用 db）
ARG DATABASE_URL=postgresql://postgres:postgres@localhost:5432/build-time-dummy
ARG NEXT_PUBLIC_WEB_URL=https://sparkle.codes
RUN DATABASE_URL=$DATABASE_URL NEXT_PUBLIC_WEB_URL=$NEXT_PUBLIC_WEB_URL pnpm turbo run build --filter=docs

# --- Runner ---
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

# 复制 standalone 产物和静态文件
# 注意：apps/docs/.next/standalone 包含运行 docs 所需的所有文件
COPY --from=installer /app/apps/docs/.next/standalone ./
COPY --from=installer /app/apps/docs/.next/static ./apps/docs/.next/static
COPY --from=installer /app/apps/docs/public ./apps/docs/public

EXPOSE 3001
# 启动 Docs 服务
CMD ["node", "apps/docs/server.js"]

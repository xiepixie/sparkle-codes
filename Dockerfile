# --- Base ---
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
RUN apk add --no-cache libc6-compat

# --- Pruner ---
# 提取构建特定应用所需的最小依赖树
FROM base AS pruner
WORKDIR /app
COPY . .
RUN npx turbo prune --scope=web --scope=docs --docker

# --- Installer ---
# 仅在协议文件（package.json/lockfile）变化时安装依赖
FROM base AS installer
WORKDIR /app

# 复制 pruned 后的 json 与 lockfile
COPY --from=pruner /app/out/json/ .
COPY --from=pruner /app/out/pnpm-lock.yaml ./

# 使用 BuildKit 缓存挂载 pnpm store，极大加速增量下载
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --ignore-scripts

# --- Builder ---
FROM base AS builder
WORKDIR /app

# 继承依赖与全量源码
COPY --from=installer /app/ .
COPY --from=pruner /app/out/full/ .
COPY .gitignore .gitignore

# 预生成文档映射（如果 docs 有变动）
RUN pnpm --filter docs run postinstall

# 注入构建参数
ARG DATABASE_URL
ARG NEXT_PUBLIC_DOCS_URL
ARG NEXT_PUBLIC_WEB_URL

# 使用全链路缓存阵容：
# 1. node_modules/.cache (编译器缓存)
# 2. apps/web/.next/cache (Web 增量生成缓存)
# 3. apps/docs/.next/cache (Docs 增量生成缓存)
# 4. .turbo (Turbo 任务指纹缓存)
# 使用严格串行构建，防止 4G 内存死机
RUN --mount=type=cache,target=/app/node_modules/.cache \
    --mount=type=cache,target=/app/apps/web/.next/cache \
    --mount=type=cache,target=/app/apps/docs/.next/cache \
    --mount=type=cache,target=/app/.turbo \
    DATABASE_URL=$DATABASE_URL \
    NEXT_PUBLIC_DOCS_URL=$NEXT_PUBLIC_DOCS_URL \
    NEXT_PUBLIC_WEB_URL=$NEXT_PUBLIC_WEB_URL \
    NODE_OPTIONS="--max-old-space-size=2048" \
    npx turbo run build --filter=web --filter=docs --concurrency=1

# --- Web Runner ---
FROM node:20-alpine AS runner-web
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

COPY --from=builder /app/apps/web/.next/standalone ./
COPY --from=builder /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]

# --- Docs Runner ---
FROM node:20-alpine AS runner-docs
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

COPY --from=builder /app/apps/docs/.next/standalone ./
COPY --from=builder /app/apps/docs/.next/static ./apps/docs/.next/static
# 注意：apps/docs 目录下目前没有 public 文件夹，请勿在此添加 COPY指令，否则会报错终止构建

EXPOSE 3001
CMD ["node", "apps/docs/server.js"]

# --- Base ---
FROM node:20-alpine AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
RUN apk add --no-cache libc6-compat

# --- Installer ---
FROM base AS installer
WORKDIR /app
COPY . .
# 1. 安装全量依赖。如果你发现某些组件（如 Prisma/esbuild）缺少二进制文件，
# 请考虑移除 --ignore-scripts 或者专门 rebuild。
RUN pnpm install --frozen-lockfile --ignore-scripts
# 2. 生成必要的文档映射文件等
RUN pnpm --filter docs run postinstall

# 环境变量声明，供构建使用
ARG DATABASE_URL=postgresql://postgres:postgres@localhost:5432/build-time-dummy
ARG NEXT_PUBLIC_DOCS_URL=https://sparkle.codes/docs
ARG NEXT_PUBLIC_WEB_URL=https://sparkle.codes

# --- Builder Web ---
FROM installer AS builder-web
# 注入环境变量并单独构建 web
RUN DATABASE_URL=$DATABASE_URL \
    NEXT_PUBLIC_DOCS_URL=$NEXT_PUBLIC_DOCS_URL \
    NEXT_PUBLIC_WEB_URL=$NEXT_PUBLIC_WEB_URL \
    pnpm turbo run build --filter=web

# --- Builder Docs ---
FROM installer AS builder-docs
# 注入环境变量并单独构建 docs
RUN DATABASE_URL=$DATABASE_URL \
    NEXT_PUBLIC_DOCS_URL=$NEXT_PUBLIC_DOCS_URL \
    NEXT_PUBLIC_WEB_URL=$NEXT_PUBLIC_WEB_URL \
    pnpm turbo run build --filter=docs

# --- Web Runner ---
# 这里不再继承 base（不需要 corepack 和 pnpm），保持最纯净小巧
FROM node:20-alpine AS runner-web
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

COPY --from=builder-web /app/apps/web/.next/standalone ./
COPY --from=builder-web /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder-web /app/apps/web/public ./apps/web/public

EXPOSE 3000
CMD ["node", "apps/web/server.js"]

# --- Docs Runner ---
# 同样不继承 base
FROM node:20-alpine AS runner-docs
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3001
ENV HOSTNAME="0.0.0.0"

COPY --from=builder-docs /app/apps/docs/.next/standalone ./
COPY --from=builder-docs /app/apps/docs/.next/static ./apps/docs/.next/static
COPY --from=builder-docs /app/apps/docs/public ./apps/docs/public

EXPOSE 3001
CMD ["node", "apps/docs/server.js"]

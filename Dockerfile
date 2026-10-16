# ==============================================================================
# MANWAH Space Studio - Google Cloud Run 多阶段生产构建 Dockerfile
# ==============================================================================

# --- 阶段 1: 依赖安装与全量构建 (Builder) ---
FROM node:22-slim AS builder

WORKDIR /app

# 安装构建所需依赖
COPY package*.json ./
RUN npm ci

# 复制完整源码
COPY . .

# 执行构建：产出 dist/ 静态目录以及 dist/server.cjs 服务端 Bundle
RUN npm run build

# --- 阶段 2: 极简生产运行镜像 (Runner) ---
FROM node:22-slim AS runner

WORKDIR /app

# 声明生产环境配置
ENV NODE_ENV=production
ENV PORT=3000

# 仅安装生产运行依赖（减少镜像体积并提升安全水位）
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 从构建器中复制已构建好的静态资源和编译后的服务端 Bundle
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public

# 暴露容器端口（Cloud Run 将注入 PORT 环境变量并在该端口进行健康探测）
EXPOSE 3000

# 启动服务端（node dist/server.cjs）
CMD ["npm", "start"]

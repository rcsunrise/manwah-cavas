# ==============================================================================
# MANWAH Space Studio - Google Cloud Run 多阶段生产构建 Dockerfile
# ==============================================================================

# --- 阶段 1: 依赖安装与全量构建 (Builder) ---
FROM node:22-slim AS builder

# 可选：国内网络构建时换 npm 源（本机 docker-compose 传 npmmirror；云端构建不传，保持官方源）
ARG NPM_REGISTRY=
RUN if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi

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

ARG NPM_REGISTRY=
# 可选：国内网络构建时换 apt 源（如 mirrors.aliyun.com）
ARG APT_MIRROR=
RUN if [ -n "$NPM_REGISTRY" ]; then npm config set registry "$NPM_REGISTRY"; fi   && if [ -n "$APT_MIRROR" ]; then sed -i "s|deb.debian.org|$APT_MIRROR|g" /etc/apt/sources.list.d/debian.sources; fi

WORKDIR /app

# 声明生产环境配置
ENV NODE_ENV=production
ENV PORT=3000

# 系统依赖：ffmpeg 用于智能体“看视频”时抽帧（server/services/video/videoFrameSampler.ts）；
# fonts-noto-cjk 提供思源宋体 / 黑体（Noto Serif / Sans CJK），模板海报排版用（server/services/posterTemplate/posterFonts.ts）
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg fonts-noto-cjk \
  && rm -rf /var/lib/apt/lists/*

# 构建时确认宋体 / 黑体真的装上了；没装上就让构建失败，别等线上出海报报错才发现
RUN find /usr/share/fonts -iname '*NotoSerifCJK*' | grep -q . \
  && find /usr/share/fonts -iname '*NotoSansCJK*' | grep -q . \
  && find /usr/share/fonts -iname '*NotoSerifCJK*' -o -iname '*NotoSansCJK*'

# 仅安装生产运行依赖（减少镜像体积并提升安全水位）
COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

# 从构建器中复制已构建好的静态资源和编译后的服务端 Bundle
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/public ./public
# 海报排版字体随镜像带上（server/services/posterTemplate/posterFonts.ts 优先读 assets/fonts，不依赖系统字体包）
COPY --from=builder /app/assets/fonts ./assets/fonts

# 暴露容器端口（Cloud Run 将注入 PORT 环境变量并在该端口进行健康探测）
EXPOSE 3000

# 启动服务端（node dist/server.cjs）
CMD ["npm", "start"]

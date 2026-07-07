# GameAsset Forge —— 多阶段镜像：构建 shared/web，运行时用 tsx 直跑服务端
# 使用 Debian slim（glibc），便于可选依赖 sharp 拉取预编译二进制。

# ---------- 构建阶段 ----------
FROM node:22-slim AS build
WORKDIR /app

# 先拷贝各 workspace 的清单，利用层缓存
COPY package.json package-lock.json* ./
COPY packages/shared/package.json packages/shared/
COPY packages/server/package.json packages/server/
COPY apps/web/package.json apps/web/

RUN npm install

# 拷贝源码并构建（shared 产物 + 服务端类型检查 + web 打包）
COPY . .
RUN npm run build

# ---------- 运行阶段 ----------
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=8787 \
    DATA_DIR=/data

# 直接复用构建阶段的完整应用（含 node_modules、shared/dist、web/dist、服务端源码）
COPY --from=build /app /app

RUN mkdir -p /data
VOLUME ["/data"]
EXPOSE 8787

# tsx 运行时直跑 TS 服务端；服务端会自动托管 apps/web/dist 静态资源
CMD ["npm", "run", "start"]

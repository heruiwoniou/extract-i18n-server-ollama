FROM node:18-alpine

WORKDIR /home/translateService

# 使用项目内的 registry 配置(如 npmmirror 镜像)
COPY .npmrc ./
COPY package.json package-lock.json ./

# 构建期安装依赖, 打进镜像层; 运行时无需再 npm install
RUN npm ci

# 拷贝应用源码, 使镜像自包含
COPY src ./src
COPY test ./test
COPY start.sh ./
RUN chmod +x start.sh

EXPOSE 9877

CMD ["sh", "./start.sh"]

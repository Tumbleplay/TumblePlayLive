FROM node:22-slim
WORKDIR /app
COPY package*.json .npmrc ./
# SQLite ships prebuilt binaries for Linux, so no compiler is needed
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build && npm prune --omit=dev --ignore-scripts
ENV NODE_ENV=production PORT=3000 DB_PATH=/data/tumble.db
EXPOSE 3000
CMD ["node", "server/index.js"]

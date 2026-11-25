# Build stage: install everything, build client + server
FROM node:22-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

# Runtime stage: compiled server, built client, production deps only
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3001 \
    DATABASE_PATH=/data/quire.db \
    CLIENT_DIST=/app/client/dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/server/package.json ./server/
COPY --from=build /app/server/dist ./server/dist
COPY --from=build /app/client/dist ./client/dist
RUN mkdir -p /data && chown node:node /data
USER node
EXPOSE 3001
WORKDIR /app/server
CMD ["node", "dist/index.js"]

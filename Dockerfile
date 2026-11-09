# Builds the web app and the API server into one image; the server serves the web app at /.
FROM docker.io/library/node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY calc/package.json calc/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci
COPY calc calc
COPY server server
COPY web web
COPY spec spec
RUN npm run build -w web && npm run build -w server

FROM docker.io/library/node:24-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
COPY calc/package.json calc/
COPY server/package.json server/
COPY web/package.json web/
RUN npm ci --omit=dev -w server --include-workspace-root=false

FROM docker.io/library/node:24-alpine
ENV NODE_ENV=production PORT=3000 WEB_DIR=/app/web
WORKDIR /app/server
COPY --from=deps /app/node_modules /app/node_modules
COPY --from=build /app/server/dist ./dist
COPY --from=build /app/server/migrations ./migrations
COPY --from=build /app/server/package.json ./
COPY --from=build /app/web/dist /app/web
USER node
EXPOSE 3000
CMD ["node", "dist/index.js"]

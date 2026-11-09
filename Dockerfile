FROM node:22-alpine AS base
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/gateway/package.json apps/gateway/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/db/package.json packages/db/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/db/prisma packages/db/prisma
COPY apps/web/scripts apps/web/scripts
RUN npm ci
COPY . .
RUN npm run build:libs

FROM base AS web-build
RUN npm run build -w @puestomap/web

FROM base AS services-build
RUN npm run build -w @puestomap/gateway \
 && npm run build -w @puestomap/worker

FROM node:22-alpine AS web
WORKDIR /app
ENV NODE_ENV=production TZ=Europe/Madrid PORT=3000 HOSTNAME=0.0.0.0
COPY --from=web-build /app/apps/web/.next/standalone ./
COPY --from=web-build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=web-build /app/apps/web/public ./apps/web/public
COPY --from=web-build /app/node_modules ./node_modules
COPY --from=web-build /app/packages/db/package.json ./packages/db/package.json
COPY --from=web-build /app/packages/db/dist ./packages/db/dist
COPY --from=web-build /app/packages/db/prisma ./packages/db/prisma
COPY --from=web-build /app/packages/shared ./packages/shared
COPY docker/web-entrypoint.sh /usr/local/bin/web-entrypoint
RUN chmod +x /usr/local/bin/web-entrypoint \
 && mkdir -p /data/uploads \
 && chown -R node:node /data/uploads
USER node
EXPOSE 3000
HEALTHCHECK --interval=10s --timeout=3s --start-period=30s --retries=5 CMD node -e "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
ENTRYPOINT ["web-entrypoint"]

FROM node:22-alpine AS gateway
WORKDIR /app
ENV NODE_ENV=production TZ=Europe/Madrid GATEWAY_PORT=8081
COPY --from=services-build /app/node_modules ./node_modules
COPY --from=services-build /app/apps/gateway/package.json ./apps/gateway/package.json
COPY --from=services-build /app/apps/gateway/dist ./apps/gateway/dist
COPY --from=services-build /app/packages/shared ./packages/shared
USER node
EXPOSE 8081
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 CMD node -e "fetch('http://127.0.0.1:8081/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "apps/gateway/dist/index.js"]

FROM node:22-alpine AS worker
WORKDIR /app
ENV NODE_ENV=production TZ=Europe/Madrid WORKER_HEALTH_PORT=8082
COPY --from=services-build /app/node_modules ./node_modules
COPY --from=services-build /app/apps/worker/package.json ./apps/worker/package.json
COPY --from=services-build /app/apps/worker/dist ./apps/worker/dist
COPY --from=services-build /app/packages/db ./packages/db
COPY --from=services-build /app/packages/shared ./packages/shared
USER node
EXPOSE 8082
HEALTHCHECK --interval=10s --timeout=3s --start-period=10s --retries=5 CMD node -e "fetch('http://127.0.0.1:8082/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["node", "apps/worker/dist/index.js"]

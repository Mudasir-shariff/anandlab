FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production LAB_HOST=0.0.0.0 PORT=3000 LAB_DATA_DIR=/app/data LAB_BACKUP_DIR=/app/backups
COPY --chown=node:node package.json server.mjs ./
COPY --chown=node:node lib ./lib
COPY --chown=node:node dist ./dist
COPY --chown=node:node scripts ./scripts
RUN mkdir -p /app/data /app/backups && chown node:node /app/data /app/backups && chmod 700 /app/data /app/backups
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/api/health').then(async r=>process.exit(r.ok&&(await r.json()).ok?0:1)).catch(()=>process.exit(1))"
CMD ["node","server.mjs"]

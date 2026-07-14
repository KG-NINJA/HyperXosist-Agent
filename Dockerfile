FROM node:20-slim
ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=8787
WORKDIR /app
COPY --chown=node:node package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --chown=node:node agent-api.js ./
COPY --chown=node:node mcp ./mcp
USER node
EXPOSE 8787
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 CMD node -e "fetch('http://127.0.0.1:8787/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"
CMD ["npm", "run", "mcp:remote"]

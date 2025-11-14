FROM node:22.14.0-slim

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install --production --ignore-scripts --no-audit --no-fund \
  || npm install --production --ignore-scripts

COPY . .

RUN chmod +x /app/bin/healthcheck.sh

ENV NODE_ENV=production

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD /app/bin/healthcheck.sh

CMD ["node", "src/index.js"]

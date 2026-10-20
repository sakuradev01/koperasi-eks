FROM node:20-alpine
WORKDIR /app

COPY server/package*.json ./
RUN npm ci --omit=dev

COPY server/. .
COPY shared /shared

ENV NODE_ENV=production
EXPOSE 5000

CMD ["node", "index.js"]

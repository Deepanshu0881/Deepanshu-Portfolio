FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
# Content, uploads and backups live here — mount a volume so they survive redeploys.
VOLUME ["/app/data"]
EXPOSE 3000
CMD ["node", "server.js"]

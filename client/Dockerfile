# --- Stage 1: Build React app ---
FROM node:20-alpine AS build
WORKDIR /app

# Keep these as build args because Vite injects them at build time.
ARG VITE_API_URL=https://api.samitcoop.com
ARG VITE_SERVER_URL=https://api.samitcoop.com
ENV NODE_ENV=development
ENV VITE_API_URL=$VITE_API_URL
ENV VITE_SERVER_URL=$VITE_SERVER_URL

RUN echo "nameserver 1.1.1.1" | tee /etc/resolv.conf > /dev/null
RUN npm config set registry https://registry.npmmirror.com

COPY client/package*.json ./
RUN npm install

COPY client/. .
COPY shared /shared
RUN npx vite build

# --- Stage 2: Serve static via Nginx ---
FROM docker.io/library/nginx:alpine
COPY client/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

# Stage 1: Build
FROM node:22-alpine AS builder

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

# Build with API URL - empty means same origin (nginx proxies /api to backend)
ARG VITE_API_URL=
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine

# Install ca-certificates for HTTPS proxy
RUN apk add --no-cache ca-certificates

COPY --from=builder /app/dist /usr/share/nginx/html

# Backend URL configurable at runtime (default: Docker Compose service name)
ENV BACKEND_URL=http://backend:8000
ENV PORT=80

# nginx config template — BACKEND_URL and PORT are injected at container start via envsubst
RUN mkdir -p /etc/nginx/templates && \
    echo 'server { \
  listen ${PORT}; \
  root /usr/share/nginx/html; \
  index index.html; \
  client_max_body_size 25m; \
  resolver 127.0.0.11 valid=30s ipv6=off; \
  location / { \
    try_files $uri $uri/ /index.html; \
  } \
  location /api { \
    proxy_pass ${BACKEND_URL}; \
    proxy_ssl_server_name on; \
    proxy_ssl_verify off; \
    proxy_set_header Host $proxy_host; \
    proxy_set_header X-Real-IP $remote_addr; \
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for; \
    proxy_set_header X-Forwarded-Proto $scheme; \
    proxy_read_timeout 120s; \
    proxy_send_timeout 120s; \
    client_max_body_size 25m; \
  } \
}' > /etc/nginx/templates/default.conf.template

EXPOSE 80

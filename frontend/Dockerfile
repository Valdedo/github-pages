# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .

# Build with API URL pointing to backend
ARG VITE_API_URL=http://localhost:8000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# Stage 2: Serve with nginx
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# nginx config for SPA routing (all paths → index.html)
RUN echo 'server { \
  listen 80; \
  root /usr/share/nginx/html; \
  index index.html; \
  client_max_body_size 25m; \
  location / { \
    try_files $uri $uri/ /index.html; \
  } \
  location /api { \
    proxy_pass http://backend:8000; \
    proxy_set_header Host $host; \
    proxy_set_header X-Real-IP $remote_addr; \
    proxy_read_timeout 120s; \
    proxy_send_timeout 120s; \
    client_max_body_size 25m; \
  } \
}' > /etc/nginx/conf.d/default.conf

EXPOSE 80

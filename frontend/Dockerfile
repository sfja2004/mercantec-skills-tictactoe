# syntax=docker/dockerfile:1
FROM oven/bun:1.2-alpine AS build
WORKDIR /app

COPY frontend/package.json frontend/package-lock.json* ./frontend/
WORKDIR /app/frontend
RUN bun install

WORKDIR /app
COPY backend/src ./backend/src
COPY backend/tsconfig.json ./backend/tsconfig.json
COPY frontend ./frontend

WORKDIR /app/frontend
RUN bunx vite build

FROM nginx:1.27-alpine AS runtime
COPY frontend/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/frontend/dist /usr/share/nginx/html
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]

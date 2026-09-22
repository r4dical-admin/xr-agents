FROM node:22-bookworm-slim AS build
WORKDIR /workspace
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.app.json vite.config.ts index.html ./
COPY electron/ electron/
COPY src/ src/
COPY tests/ tests/
RUN npm run check

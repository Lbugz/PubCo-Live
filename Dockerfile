# Multi-stage build for Railway deployment
FROM node:20-slim AS builder

# Install dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libxss1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Cache bust to force rebuild - Updated: 2025-11-09
ARG CACHEBUST=20251109
RUN echo "Cache bust: $CACHEBUST"

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

# Build frontend (Vite looks for index.html in /client)
WORKDIR /app/client
RUN npx vite build

# Build backend (esbuild bundles to /app/dist)
WORKDIR /app
RUN npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist

# Production stage
FROM node:20-slim

# Install runtime dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    wget \
    gnupg \
    ca-certificates \
    fonts-liberation \
    libappindicator3-1 \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libxss1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy package files and install production dependencies
COPY package*.json ./
RUN npm install --omit=dev

# Copy built application (contains both server and frontend)
COPY --from=builder /app/dist ./dist

# Expose port for Railway
EXPOSE 5000

# Start application
CMD ["npm", "start"]

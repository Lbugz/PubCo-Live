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

# Cache bust - change this number if cache issues persist
ARG CACHEBUST=2025110902
RUN echo "Build: $CACHEBUST"

# Copy package files and install ALL dependencies
COPY package*.json ./
RUN npm install

# Copy all source code
COPY . .

# Run the build script from package.json
RUN npm run build

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

# Copy built application
COPY --from=builder /app/dist ./dist

# Expose port
EXPOSE 5000

# Start application
CMD ["npm", "start"]

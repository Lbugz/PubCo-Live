FROM node:20-slim

# Install Puppeteer dependencies
RUN apt-get update && apt-get install -y \
    wget gnupg ca-certificates fonts-liberation \
    libappindicator3-1 libasound2 libatk-bridge2.0-0 \
    libatk1.0-0 libcups2 libdbus-1-3 libgdk-pixbuf2.0-0 \
    libnspr4 libnss3 libx11-xcb1 libxcomposite1 \
    libxdamage1 libxrandr2 xdg-utils libgbm1 \
    libpango-1.0-0 libcairo2 libxss1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy everything
COPY . .

# Install and build in one layer to avoid cache
RUN npm install && \
    npx vite build && \
    npx esbuild server/index.ts --platform=node --packages=external --bundle --format=esm --outdir=dist && \
    npm prune --production

EXPOSE 5000

CMD ["node", "dist/index.js"]

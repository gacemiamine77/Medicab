FROM node:20-slim

WORKDIR /app

RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci --production=false

COPY . .

# Build the frontend
RUN npm run build

EXPOSE 3000

ENV NODE_ENV=production

CMD ["npx", "tsx", "server.ts"]

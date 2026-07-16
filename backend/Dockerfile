# ---- Build stage ----
# Debian slim (não Alpine): o Prisma detecta o OpenSSL 3 corretamente aqui.
# Em Alpine, o schema/query engine falha ao carregar a libssl e o backend
# entra em loop de reinício ("Could not parse schema engine response").
FROM node:22-slim AS build
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci
COPY prisma ./prisma
RUN npx prisma generate
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# ---- Runtime stage ----
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
RUN apt-get update && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*
COPY package*.json ./
RUN npm ci --omit=dev
COPY prisma ./prisma
RUN npx prisma generate
COPY --from=build /app/dist ./dist
EXPOSE 4000
# Runs as the non-root "node" user (built into the base image) instead of root — limits
# blast radius if a future RCE-class bug in a dependency ever gets code execution here.
USER node
# Apply migrations then start
CMD ["sh", "-c", "npx prisma migrate deploy && node dist/server.js"]

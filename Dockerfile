# syntax=docker/dockerfile:1

# ---- Base ----
FROM node:22-alpine AS base
WORKDIR /usr/src/app
RUN apk add --no-cache dumb-init

# ---- Dependencies (full, incl. dev — needed to build) ----
FROM base AS deps
COPY package*.json ./
RUN npm ci

# ---- Build ----
FROM base AS build
COPY package*.json ./
COPY --from=deps /usr/src/app/node_modules ./node_modules
COPY . .
RUN npm run build && npm prune --omit=dev

# ---- Production (slim runtime) ----
FROM base AS production
ENV NODE_ENV=production
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
COPY package.json ./
USER node
EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "dist/main"]

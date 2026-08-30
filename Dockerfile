# DoqSeal backend — Azure Container Apps
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npx tsc

FROM node:22-bookworm-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3030
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# CommonJS compiled layout keeps relative requires; copy non-TS runtime assets if any
COPY --from=build /app/package.json ./package.json
EXPOSE 3030
USER node
CMD ["node", "dist/index.js"]

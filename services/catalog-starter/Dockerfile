FROM node:24-alpine AS build
WORKDIR /src
COPY services/catalog-starter/package.json services/catalog-starter/package-lock.json ./
RUN npm ci
COPY services/catalog-starter/ ./
RUN npm run build && npm ci --omit=dev

FROM gcr.io/distroless/nodejs24-debian12:nonroot
WORKDIR /app
COPY --from=build /src/dist ./dist
COPY --from=build /src/node_modules ./node_modules
COPY --from=build /src/package.json ./package.json
USER nonroot:nonroot
EXPOSE 3082
CMD ["dist/main.js"]

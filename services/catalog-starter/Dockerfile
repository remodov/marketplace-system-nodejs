# TODO шаг 15: образ сервиса.
# Сейчас всё в один слой и от root: в образ уедут npm, TypeScript, тесты и dev-зависимости,
# а контейнер побежит с лишними правами. Контекст сборки это корень репозитория.
FROM node:24-alpine
WORKDIR /app
COPY services/catalog-starter/ ./
RUN npm ci && npm run build
EXPOSE 3082
CMD ["node", "dist/main.js"]

FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
# Bot API MAX (platform-api2.max.ru) отдаёт сертификат, подписанный российским
# государственным CA (Минцифры), который отсутствует в стандартном доверенном
# наборе Node/Alpine — без этого бандла TLS-хендшейк не пройдёт.
# Сертификат копируется до объявления переменной, иначе Node при сборке предупреждает, что файла ещё нет.
COPY certs ./certs
ENV NODE_EXTRA_CA_CERTS=/app/certs/russian_trusted_ca_bundle.pem

COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY --from=builder /app/dist ./dist

CMD ["node", "dist/bot.js"]

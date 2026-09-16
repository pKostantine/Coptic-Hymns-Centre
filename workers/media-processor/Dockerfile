FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV R2_DRIVER=s3

CMD ["npm", "run", "process:once"]

FROM node:22-bookworm-slim

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY src ./src

ENV R2_DRIVER=s3
ENV NODE_ENV=production

# The container runs the long-lived worker: it drains the queue, then polls.
# Use `npm run process:once` instead to process a single job and exit.
CMD ["npm", "start"]

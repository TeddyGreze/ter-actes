FROM node:20-slim
WORKDIR /app
COPY package.json package-lock.json* yarn.lock* pnpm-lock.yaml* ./
RUN npm install --no-audit --no-fund || yarn || true
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["npm", "start"]

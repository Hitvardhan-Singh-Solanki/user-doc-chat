FROM node:22

WORKDIR /app

# Create certificates directory for TLS
RUN mkdir -p /app/certs

COPY package*.json ./
RUN npm ci --production

COPY . .

RUN npm run build

# Create non-root user for security
RUN groupadd -r appuser && useradd -r -g appuser appuser
RUN chown -R appuser:appuser /app
USER appuser

CMD ["npm", "run", "start"]
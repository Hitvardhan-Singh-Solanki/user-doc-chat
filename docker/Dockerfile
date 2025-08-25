FROM node:22

WORKDIR /app

COPY package*.json ./
RUN npm ci --production

COPY . .

RUN npm run build

CMD ["npm", "run", "start"]
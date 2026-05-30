FROM node:22-alpine
WORKDIR /app
COPY package.json ./
COPY tsconfig.json ./
COPY src ./src
COPY sql ./sql
RUN npm install
RUN npm run build
CMD ["npm", "start"]

FROM node:20-alpine
RUN apk add --no-cache ffmpeg yt-dlp
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
EXPOSE 3000
ENV NODE_ENV=production
CMD ["npm", "start"]

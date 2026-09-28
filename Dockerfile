FROM node:20-slim

RUN apt-get update \
 && apt-get install -y --no-install-recommends python3 ffmpeg curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*

RUN curl -fsSL https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp -o /usr/local/bin/yt-dlp \
 && chmod a+rx /usr/local/bin/yt-dlp

WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY server.js ./
COPY public ./public
COPY www.youtube.com_cookies.txt ./www.youtube.com_cookies.txt
ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.js"]

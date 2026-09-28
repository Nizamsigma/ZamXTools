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
RUN echo '#!/bin/sh\n\
yt-dlp -U 2>/dev/null || pip3 install -U --break-system-packages yt-dlp 2>/dev/null\n\
exec node server.js' > /start.sh \
 && chmod +x /start.sh

CMD ["/start.sh"]

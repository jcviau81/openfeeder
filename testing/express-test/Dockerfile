FROM node:20-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY adapters/express /app/adapters/express
COPY testing/express-test/package.json /app/testing/express-test/package.json
COPY testing/express-test/server.js /app/testing/express-test/server.js

RUN cd /app/adapters/express && npm install --ignore-scripts && \
    cd /app/testing/express-test && npm install

WORKDIR /app/testing/express-test

EXPOSE 3002

CMD ["node", "server.js"]

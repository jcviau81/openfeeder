FROM node:20-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends python3 python3-pip python3-venv curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Python deps (validator + sidecar tests)
RUN python3 -m venv /app/venv
ENV PATH="/app/venv/bin:$PATH"
RUN pip install --no-cache-dir httpx click rich

# Copy project files needed for testing
COPY adapters/express /app/adapters/express
COPY testing/express-test /app/testing/express-test
COPY testing/test-express.js /app/testing/test-express.js
COPY testing/test-caching.js /app/testing/test-caching.js
COPY testing/test-security.js /app/testing/test-security.js
COPY testing/gateway-dialogue-test.js /app/testing/gateway-dialogue-test.js
COPY sidecar/test_chunker.py /app/sidecar/test_chunker.py
COPY sidecar/test_sidecar.py /app/sidecar/test_sidecar.py
COPY sidecar/chunker.py /app/sidecar/chunker.py
COPY sidecar/analytics.py /app/sidecar/analytics.py
COPY validator /app/validator

# Node deps
RUN cd /app/adapters/express && npm install --ignore-scripts && \
    cd /app/testing/express-test && npm install

COPY testing/runner/run-tests.sh /app/run-tests.sh
RUN chmod +x /app/run-tests.sh

CMD ["/app/run-tests.sh"]

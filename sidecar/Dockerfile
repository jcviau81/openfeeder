FROM python:3.11-slim

LABEL org.opencontainers.image.source="https://github.com/openfeeder/openfeeder"
LABEL org.opencontainers.image.description="OpenFeeder sidecar — crawl, chunk, embed, serve"

# System deps for lxml
RUN apt-get update && \
    apt-get install -y --no-install-recommends build-essential libxml2-dev libxslt1-dev && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Pre-download the default embedding model at build time so the container
# starts faster and doesn't need outbound network access at runtime.
RUN python -c "from sentence_transformers import SentenceTransformer; SentenceTransformer('all-MiniLM-L6-v2')"

COPY . .

VOLUME /data

EXPOSE 8080

CMD ["python", "main.py"]

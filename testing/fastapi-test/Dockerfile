FROM python:3.11-slim

RUN apt-get update && apt-get install -y --no-install-recommends curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY adapters/fastapi /app/adapters/fastapi
COPY testing/fastapi-test/requirements.txt /app/testing/fastapi-test/requirements.txt
COPY testing/fastapi-test/main.py /app/testing/fastapi-test/main.py

RUN pip install --no-cache-dir -r /app/testing/fastapi-test/requirements.txt && \
    pip install --no-cache-dir -e /app/adapters/fastapi

WORKDIR /app/testing/fastapi-test

EXPOSE 3003

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "3003"]

# Emilia Backend API - FastAPI
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies (curl for healthcheck)
RUN apt-get update && \
    apt-get install -y --no-install-recommends curl && \
    rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application
COPY main.py .
COPY config.py .
COPY dependencies.py .
COPY parse_chat.py .
COPY routers/ ./routers/
COPY schemas/ ./schemas/
COPY core/ ./core/
COPY services/ ./services/
COPY db/ ./db/

EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8080/api/health || exit 1

CMD ["python", "main.py"]

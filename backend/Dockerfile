# Emilia Backend API - FastAPI
FROM python:3.11-slim

WORKDIR /app

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application modules
COPY main.py .
COPY config.py .
COPY dependencies.py .
COPY parse_chat.py .
COPY database.py .

# Copy modular structure
COPY routers/ ./routers/
COPY schemas/ ./schemas/
COPY core/ ./core/
COPY services/ ./services/
COPY db/ ./db/

# Expose port
EXPOSE 8080

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
    CMD python -c "import requests; requests.get('http://localhost:8080/api/health').raise_for_status()" || exit 1

# Run
CMD ["python", "main.py"]

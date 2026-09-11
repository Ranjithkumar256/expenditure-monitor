# syntax=docker/dockerfile:1
FROM python:3.11-slim

# Set container working directory
WORKDIR /app

# Configure Python runtime settings
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8000 \
    HOST=0.0.0.0 \
    DB_PATH=/app/data/finance.db

# Install runtime utilities (curl for container healthchecks)
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*

# Create persistent data directory and a dedicated non-root user
RUN mkdir -p /app/data && \
    useradd -m -u 1000 -s /bin/bash appuser && \
    chown -R appuser:appuser /app

# Copy dependency definition and install Python packages
COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip && \
    pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY run.py .
COPY app/ ./app/
COPY static/ ./static/

# Ensure non-root user owns the files and data directory
RUN chown -R appuser:appuser /app

# Switch to non-root user for security
USER appuser

# Expose web application port
EXPOSE 8000

# Automated healthcheck
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD curl -f http://localhost:8000/api/health || exit 1

# Launch server
CMD ["python3", "run.py"]

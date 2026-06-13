FROM python:3.11-slim

# Install system dependencies for pdf2image (poppler) and PaddleOCR (OpenCV requirements)
RUN apt-get update && apt-get install -y \
    poppler-utils \
    libgomp1 \
    libglib2.0-0 \
    libsm6 \
    libxrender1 \
    libxext6 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy requirements and install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source code
COPY . .

# Create directory for SQLite storage
RUN mkdir -p /app/data

EXPOSE 5000

# Run with Gunicorn, setting timeout to 120s due to OCR engine load time on startup
CMD ["sh", "-c", "gunicorn app:app --bind 0.0.0.0:${PORT:-5000}"]

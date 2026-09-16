FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PORT=8080 \
    HF_HOME=/models/hf \
    HF_HUB_ENABLE_HF_TRANSFER=0

RUN apt-get update && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY main.py .

# Model weights are NOT baked in: mount a Cloud Storage bucket at /models (see README) so the image stays small.
CMD exec uvicorn main:app --host 0.0.0.0 --port ${PORT} --workers 1

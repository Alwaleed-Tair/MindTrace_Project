# Build from the repository root:  docker build -f backend/Dockerfile -t mindtrace .
FROM node:22-slim AS web
WORKDIR /web
COPY frontend/package.json frontend/package-lock.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/ .
COPY bridge/samples /bridge/samples
COPY --from=web /web/dist /frontend/dist
ENV MINDTRACE_DATA_DIR=/data MINDTRACE_FRONTEND_DIR=/frontend/dist
VOLUME /data
EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]

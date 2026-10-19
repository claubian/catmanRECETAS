FROM node:22-bookworm-slim AS frontend
WORKDIR /build/web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
ENV VITE_USE_MOCK=false VITE_API_BASE_URL=""
RUN npm run build

FROM python:3.13-slim-bookworm AS runtime
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PORT=8080 \
    WEB_DIST_DIR=/app/web/dist
WORKDIR /app/backend
COPY backend/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY backend/app.py ./
COPY --from=frontend /build/web/dist /app/web/dist
RUN useradd --create-home --uid 10001 appuser
USER appuser
EXPOSE 8080
CMD ["sh", "-c", "exec uvicorn app:app --host 0.0.0.0 --port \"$PORT\" --workers 1"]

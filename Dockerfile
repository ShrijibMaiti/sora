# Sora: API + built web app in one image.
#   docker build -t sora .
#   docker run -p 8000:8000 -v sora-data:/data -e OPENAQ_API_KEY=... -e FIRMS_MAP_KEY=... sora
# /data keeps the OSM road graph between restarts (first start downloads it, ~40 s for Delhi).

FROM node:20-slim AS web
WORKDIR /web
COPY web/package.json web/package-lock.json ./
RUN npm ci
COPY web/ ./
RUN npm run build

FROM python:3.12-slim
WORKDIR /app
COPY pyproject.toml ./
COPY sora/ sora/
RUN pip install --no-cache-dir . && mkdir /data && chown nobody /data
COPY --from=web /web/dist /app/web/dist
ENV SORA_CACHE=/data SORA_WEB_DIST=/app/web/dist PYTHONUNBUFFERED=1
VOLUME /data
USER nobody
EXPOSE 8000
HEALTHCHECK --interval=60s --start-period=120s \
  CMD python -c "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health', timeout=5)"
CMD ["uvicorn", "sora.api.main:app", "--host", "0.0.0.0", "--port", "8000", "--proxy-headers"]

"""Production middleware: security headers, per-client rate limits, Prometheus metrics."""
import base64
import hashlib
import os
import re
import threading
import time
from collections import defaultdict
from pathlib import Path

from fastapi import Request
from fastapi.responses import JSONResponse, PlainTextResponse, Response

TRUST_PROXY = os.environ.get("SORA_TRUST_PROXY") == "1"   # behind a reverse proxy: use X-Forwarded-For / -Proto
METRICS_TOKEN = os.environ.get("SORA_METRICS_TOKEN")      # if set, /api/metrics needs "Authorization: Bearer <token>"
TILES = "https://tile.openstreetmap.org"
FONTS_CSS, FONTS = "https://fonts.googleapis.com", "https://fonts.gstatic.com"


# ---------- security headers ----------

def csp(index_html: Path) -> str:
    """Content-Security-Policy for the app. Inline scripts in the built page (the theme bootstrap) are allowed by hash
    only. Inline styles stay allowed: Leaflet's marker HTML and React style props need them."""
    try:
        html = index_html.read_text(encoding="utf-8")
    except OSError:
        html = ""
    hashes = " ".join("'sha256-" + base64.b64encode(hashlib.sha256(s.encode()).digest()).decode() + "'"
                      for s in re.findall(r"<script>(.*?)</script>", html, re.S))
    return "; ".join([
        "default-src 'self'", f"script-src 'self' {hashes}".strip(), f"style-src 'self' 'unsafe-inline' {FONTS_CSS}",
        f"font-src 'self' {FONTS}", f"img-src 'self' data: {TILES}", f"connect-src 'self' {TILES} {FONTS_CSS} {FONTS}",
        "worker-src 'self'", "manifest-src 'self'", "object-src 'none'", "base-uri 'self'", "form-action 'self'",
        "frame-ancestors 'none'",
    ])


def security_headers(policy: str):
    async def mw(request: Request, call_next):
        resp = await call_next(request)
        h = resp.headers
        h["Content-Security-Policy"] = policy
        h["X-Content-Type-Options"] = "nosniff"
        h["Referrer-Policy"] = "strict-origin-when-cross-origin"
        h["Permissions-Policy"] = "camera=(), microphone=(), geolocation=(self)"
        h["X-Frame-Options"] = "DENY"
        h["Cross-Origin-Opener-Policy"] = "same-origin"
        if (request.url.scheme == "https") or (TRUST_PROXY and request.headers.get("x-forwarded-proto") == "https"):
            h["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains"
        p = request.url.path
        if p.startswith("/assets/"):
            h["Cache-Control"] = "public, max-age=31536000, immutable"  # content-hashed file names
        elif not p.startswith("/api/") and "cache-control" not in h:
            h["Cache-Control"] = "no-cache"  # pages, sw.js, manifest: always revalidate
        return resp
    return mw


# ---------- rate limits ----------

# per client IP: (requests per minute, burst). Sized to stop abuse, not people: one app load spends 2 planning
# requests and every trip edit 5 (plan + 4 what-ifs), and many mobile users in India share an IP behind carrier NAT.
LIMITS = {"plan": (90, 40), "push": (10, 5), "api": (600, 150)}


def bucket_of(request: Request) -> str | None:
    p, m = request.url.path, request.method
    if not p.startswith("/api/") or p in ("/api/health", "/api/metrics"):
        return None
    if m == "POST" and p in ("/api/plan", "/api/day", "/api/counterfactual"):
        return "plan"
    if p.startswith("/api/push/") and m != "GET":
        return "push"
    return "api"


def client_ip(request: Request) -> str:
    if TRUST_PROXY and (fwd := request.headers.get("x-forwarded-for")):
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


class RateLimiter:
    def __init__(self, limits=LIMITS):
        self.limits, self.state, self.lock, self.swept = limits, {}, threading.Lock(), time.monotonic()

    def take(self, key: tuple[str, str], now: float | None = None) -> float:
        """0 if allowed, else seconds until the next request would be."""
        now = time.monotonic() if now is None else now
        per_min, burst = self.limits[key[1]]
        rate = per_min / 60
        with self.lock:
            tokens, last = self.state.get(key, (burst, now))
            tokens = min(burst, tokens + (now - last) * rate)
            if tokens >= 1:
                self.state[key] = (tokens - 1, now)
                wait = 0.0
            else:
                self.state[key] = (tokens, now)
                wait = (1 - tokens) / rate
            if now - self.swept > 600:  # forget idle clients
                self.state = {k: v for k, v in self.state.items() if now - v[1] < 600}
                self.swept = now
        return wait


def rate_limit(limiter: RateLimiter):
    async def mw(request: Request, call_next):
        b = None if os.environ.get("SORA_RATE_LIMIT") == "off" else bucket_of(request)
        if b:
            wait = limiter.take((client_ip(request), b))
            if wait:
                return JSONResponse(status_code=429, headers={"Retry-After": str(int(wait) + 1)}, content={
                    "detail": {"code": "rate_limited", "message": "Too many requests. Try again in a moment."}})
        return await call_next(request)
    return mw


# ---------- metrics ----------

class Metrics:
    def __init__(self):
        self.lock = threading.Lock()
        self.count = defaultdict(int)       # (route, method, status) → requests
        self.seconds = defaultdict(float)   # route → total seconds
        self.n = defaultdict(int)

    def observe(self, route, method, status, secs):
        with self.lock:
            self.count[(route, method, status)] += 1
            self.seconds[route] += secs
            self.n[route] += 1

    def render(self, gauges: dict[str, dict[str, float]]) -> str:
        lines = ["# TYPE sora_requests_total counter"]
        with self.lock:
            lines += [f'sora_requests_total{{route="{r}",method="{m}",status="{s}"}} {c}' for (r, m, s), c in sorted(self.count.items())]
            lines += ["# TYPE sora_request_seconds summary"]
            for r in sorted(self.n):
                lines += [f'sora_request_seconds_sum{{route="{r}"}} {self.seconds[r]:.4f}', f'sora_request_seconds_count{{route="{r}"}} {self.n[r]}']
        for name, series in gauges.items():
            lines += [f"# TYPE {name} gauge"] + [f'{name}{{city="{k}"}} {v:.0f}' for k, v in sorted(series.items())]
        return "\n".join(lines) + "\n"


def metrics_mw(metrics: Metrics):
    async def mw(request: Request, call_next):
        t = time.perf_counter()
        resp = await call_next(request)
        p = request.url.path
        # bounded label set: ids collapsed, unknown paths grouped, static files as one
        path = ("static" if not p.startswith("/api/") else "unmatched" if resp.status_code == 404 and "route" not in request.scope
                else re.sub(r"/[0-9a-f]{20}(?=/|$)", "/{id}", p))
        metrics.observe(path, request.method, resp.status_code, time.perf_counter() - t)
        return resp
    return mw


def metrics_response(request: Request, metrics: Metrics, gauges) -> Response:
    if METRICS_TOKEN and request.headers.get("authorization") != f"Bearer {METRICS_TOKEN}":
        return JSONResponse(status_code=401, content={"detail": {"code": "unauthorized", "message": "Metrics need a token."}})
    return PlainTextResponse(metrics.render(gauges()), media_type="text/plain; version=0.0.4")

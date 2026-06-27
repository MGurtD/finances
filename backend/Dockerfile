# ===============================================
# Finances API — multi-stage Dockerfile
#
# Pure in-container build (no host-bundle): the image is reproducible
# regardless of the host running the build. SQLite driver is
# modernc.org/sqlite (pure Go, no CGO), so CGO_ENABLED=0 is safe and
# lets us ship a ~2 MB static binary on distroless.
#
# If a future dep requires CGO, switch the final stage to
# gcr.io/distroless/base-debian12:nonroot (still no shell, but glibc).
# ===============================================

FROM golang:1.26-alpine AS build

WORKDIR /src

# Cache layer: go.mod + go.sum only.
COPY backend/go.mod backend/go.sum ./backend/
RUN cd backend && go mod download

# Source.
COPY backend/ ./backend/

# Static, stripped binary.
RUN cd backend \
 && CGO_ENABLED=0 GOOS=linux GOARCH=amd64 \
    go build -ldflags="-s -w" -trimpath -o /out/server ./cmd/server

# ===============================================
# Runtime — distroless static, nonroot (uid 65532)
#
# No shell, no package manager, no libc. HEALTHCHECK is omitted on
# purpose: distroless has no shell and no curl/wget. External probes
# (Traefik, Kubernetes, docker-compose `healthcheck:`) are expected.
# ===============================================
FROM gcr.io/distroless/static-debian12:nonroot

COPY --from=build /out/server /server

ENV PORT=3001 \
    HOST=0.0.0.0

EXPOSE 3001

USER nonroot:nonroot

ENTRYPOINT ["/server"]
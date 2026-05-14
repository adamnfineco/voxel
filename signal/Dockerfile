# ── Build stage ──────────────────────────────────────────────────────────────
FROM rust:1.95-slim AS builder

WORKDIR /build
COPY Cargo.toml Cargo.lock* ./
COPY src ./src

# Build release binary
RUN cargo build --release

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM debian:bookworm-slim

# Install CA certs for TLS (wss://)
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

COPY --from=builder /build/target/release/voxel-signal /usr/local/bin/voxel-signal

# Default port
EXPOSE 8080

ENV BIND_ADDR=0.0.0.0:8080
ENV RUST_LOG=info

ENTRYPOINT ["voxel-signal"]

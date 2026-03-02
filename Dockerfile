###############################################################
# Stage 1 — build whisper.cpp
###############################################################
FROM debian:bookworm-slim AS whisper-builder

RUN apt-get update && apt-get install -y --no-install-recommends \
    cmake build-essential git ca-certificates \
    && rm -rf /var/lib/apt/lists/*

RUN git clone --depth 1 --branch v1.7.4 https://github.com/ggerganov/whisper.cpp /src \
    && cmake -B /src/build -S /src \
       -DCMAKE_BUILD_TYPE=Release \
       -DBUILD_SHARED_LIBS=OFF \
       -DGGML_OPENMP=OFF \
       -DGGML_NATIVE=OFF \
       -DWHISPER_BUILD_TESTS=OFF \
    && cmake --build /src/build -j$(nproc) \
    && (cp /src/build/bin/whisper-cli /whisper-cpp 2>/dev/null || cp /src/build/main /whisper-cpp) \
    && find /src/build -name "*.so*" -type f -exec cp {} /usr/local/lib/ \; \
    && ldconfig

###############################################################
# Stage 2 — main bot image (relay + web + git)
###############################################################
FROM oven/bun:1

# Whisper binary + shared libs
COPY --from=whisper-builder /whisper-cpp /usr/local/bin/whisper-cpp
COPY --from=whisper-builder /usr/local/lib/ /usr/local/lib/
RUN ldconfig

# System packages
RUN apt-get update && apt-get install -y \
    nodejs npm ffmpeg curl sudo \
    postgresql-client libstdc++6 git \
    && rm -rf /var/lib/apt/lists/*

# ngrok
RUN ARCH=$(dpkg --print-architecture) \
    && curl -fsSL "https://bin.equinox.io/c/bNyj1mQVY4c/ngrok-v3-stable-linux-${ARCH}.tgz" \
       | tar xz -C /usr/local/bin \
    && ngrok version

# Claude CLI (must run as non-root — relay user created below)
RUN npm install -g @anthropic-ai/claude-code

# Non-root user (Claude CLI refuses --dangerously-skip-permissions as root)
RUN useradd -m -u 1001 relay

# ── Relay dependencies ────────────────────────────────────
WORKDIR /home/relay/app/services/relay
COPY services/relay/package.json services/relay/bun.lock* ./
RUN bun install --production

# ── Web dependencies ──────────────────────────────────────
WORKDIR /home/relay/app/services/web
COPY services/web/package.json services/web/bun.lock* ./
RUN bun install --production

# ── Full project copy ─────────────────────────────────────
WORKDIR /home/relay/app
COPY . .

# ── Helpers ───────────────────────────────────────────────
RUN chmod +x entrypoint.sh \
    && chmod +x actions/send_file_to_telegram.sh

# ── Directory setup + permissions ─────────────────────────
RUN mkdir -p /home/relay/.claude-relay \
    && mkdir -p /home/relay/.claude/debug /home/relay/.claude/todos /home/relay/.claude/backups \
    && mkdir -p /files \
    && chown -R relay:relay /home/relay \
    && chown relay:relay /files \
    && echo "relay ALL=(root) NOPASSWD: /bin/chown relay\\:relay /files" >> /etc/sudoers

USER relay

ENTRYPOINT ["./entrypoint.sh"]

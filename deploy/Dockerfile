# Kavach engine for an always-on sandbox (Agent37 or any Docker host).
FROM python:3.12-slim
WORKDIR /app
COPY engine /app/engine
COPY vendor /app/vendor
ENV PYTHONPATH=/app/engine KAVACH_FINCH_DIR=/app/vendor/finch
# Re-attack the target every night and keep each signed record on disk.
CMD ["sh", "-c", "mkdir -p /data && while true; do python -m kavach run --quiet --out /data/eng-$(date +%Y%m%d-%H%M).json ${KAVACH_FLAGS}; sleep 86400; done"]

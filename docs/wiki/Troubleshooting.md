# Troubleshooting

## Quick checks
- Review logs: `docker-compose logs` (use `-f app` or `-f worker` for specific services).
- Verify `.env` matches your compose file.
- Ensure disk space: `df -h`.
- If uploads fail, check proxy/body size limits and retry a small file.

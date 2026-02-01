# Maintenance

## Backups
```bash
docker-compose down
tar -czf vitransfer-backup.tar.gz \
  /var/lib/docker/volumes/vitransfer_postgres-data \
  /var/lib/docker/volumes/vitransfer_uploads
```

If using bind mounts, back up your host paths instead.

## Updates
```bash
docker-compose pull
docker-compose up -d
```

For a specific tag:
```bash
docker pull crypt010/vitransfer:latest
docker-compose up -d
```

Migrations run automatically on startup.

## Logs
```bash
docker-compose logs app
docker-compose logs worker
docker-compose logs -f
```

## Database management
```bash
# Access PostgreSQL
docker exec -it vitransfer-postgres psql -U vitransfer -d vitransfer

# Backup
docker exec vitransfer-postgres pg_dump -U vitransfer vitransfer > backup.sql

# Restore
docker exec -i vitransfer-postgres psql -U vitransfer vitransfer < backup.sql
```

#!/bin/bash
set -e

# Wait for Postgres to be ready
until pg_isready -h localhost -U "$POSTGRES_USER" -d "$POSTGRES_DB"; do
  echo "Waiting for postgres..."
  sleep 2
done

echo "Ensuring pgvector extension exists..."
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" <<-EOSQL
  CREATE EXTENSION IF NOT EXISTS vector;
EOSQL

echo "pgvector extension is now installed."

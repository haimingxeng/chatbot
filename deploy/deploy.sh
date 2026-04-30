#!/bin/bash
# Run on VPS to deploy / update chatbot
set -e

REPO="https://github.com/haimingxeng/chatbot"
APP_DIR="/srv/chatbot"

if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO" "$APP_DIR"
fi

cd "$APP_DIR"
git pull origin main

# .env.production must already exist (first deploy: copy and fill manually)
if [ ! -f .env.production ]; then
  echo "ERROR: .env.production not found. Create it first."
  echo "  cp .env.production.example .env.production && vi .env.production"
  exit 1
fi

docker compose down --remove-orphans
docker compose build --no-cache
docker compose up -d

echo "Deployed. Check logs: docker compose logs -f"

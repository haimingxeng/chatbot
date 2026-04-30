#!/bin/bash
# Run once on fresh VPS to install dependencies
set -e

# Docker
if ! command -v docker &>/dev/null; then
  curl -fsSL https://get.docker.com | sh
  systemctl enable --now docker
fi

# Certbot
if ! command -v certbot &>/dev/null; then
  apt-get update && apt-get install -y certbot python3-certbot-nginx
fi

# Nginx
if ! command -v nginx &>/dev/null; then
  apt-get update && apt-get install -y nginx
fi

echo "Setup complete."

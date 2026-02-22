#!/usr/bin/env bash
# Install and activate the OpenFeeder plugin in WordPress
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE="docker compose -f ${SCRIPT_DIR}/../docker-compose.yml"

echo "==> WordPress: Installing core..."
$COMPOSE run --rm wpcli core install \
  --url=http://localhost:8081 \
  --title="OpenFeeder Test Site" \
  --admin_user=admin \
  --admin_password=admin \
  --admin_email=test@test.com \
  --skip-email

echo "==> WordPress: Activating OpenFeeder plugin..."
$COMPOSE run --rm wpcli plugin activate openfeeder

echo "==> WordPress: Flushing rewrite rules..."
$COMPOSE run --rm wpcli rewrite flush

echo "==> WordPress: Creating sample content..."
$COMPOSE run --rm wpcli post create \
  --post_title="Hello OpenFeeder" \
  --post_content="This is a test post for OpenFeeder validation. It contains enough text to verify that the chunking and content API are working correctly. The OpenFeeder protocol exposes website content to LLMs via clean, structured endpoints." \
  --post_status=publish

$COMPOSE run --rm wpcli post create \
  --post_title="Second Test Post" \
  --post_content="Another test post to verify index pagination. OpenFeeder provides a discovery endpoint and a content API that returns structured, chunked content suitable for large language models." \
  --post_status=publish

echo "==> WordPress: Done!"
echo "    Admin: http://localhost:8081/wp-admin (admin/admin)"
echo "    OpenFeeder: http://localhost:8081/.well-known/openfeeder.json"

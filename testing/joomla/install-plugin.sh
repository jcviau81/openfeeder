#!/usr/bin/env bash
# Install and enable the OpenFeeder plugin in Joomla
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE="docker compose -f ${SCRIPT_DIR}/../docker-compose.yml"

echo "==> Joomla: Running auto-installation..."
# Joomla 5 Docker image auto-installs on first boot via environment variables.
# We need to wait for that process to complete by checking for configuration.php.
MAX_WAIT=120
ELAPSED=0
while ! $COMPOSE exec -T joomla test -f /var/www/html/configuration.php 2>/dev/null; do
  if [ $ELAPSED -ge $MAX_WAIT ]; then
    echo "ERROR: Joomla auto-installation did not complete within ${MAX_WAIT}s"
    exit 1
  fi
  echo "    Waiting for Joomla installation... (${ELAPSED}s)"
  sleep 5
  ELAPSED=$((ELAPSED + 5))
done

echo "==> Joomla: Installation detected (configuration.php exists)"

echo "==> Joomla: Discovering OpenFeeder plugin..."
# Use Joomla CLI to discover and install the plugin
$COMPOSE exec -T joomla php cli/joomla.php extension:discover:install || {
  echo "    Note: discover:install not available, trying discover + install..."
  $COMPOSE exec -T joomla php cli/joomla.php extension:discover || true
  $COMPOSE exec -T joomla php cli/joomla.php extension:discover:install || true
}

echo "==> Joomla: Enabling OpenFeeder plugin via database..."
# Enable the plugin directly in the database as a reliable fallback
$COMPOSE exec -T joomla-db mysql -ujoomla -pjoomla joomla -e "
  UPDATE \`#__extensions\` SET enabled=1 WHERE element='openfeeder' AND type='plugin';
" 2>/dev/null || {
  # Try with the actual table prefix (default: empty in Docker image)
  $COMPOSE exec -T joomla-db mysql -ujoomla -pjoomla joomla -e "
    UPDATE extensions SET enabled=1 WHERE element='openfeeder' AND type='plugin';
  " 2>/dev/null || echo "    Warning: Could not enable plugin via DB (may need manual activation)"
}

echo "==> Joomla: Clearing cache..."
$COMPOSE exec -T joomla php cli/joomla.php cache:clean || true

echo "==> Joomla: Creating sample content..."
# Create articles via database insert (most reliable cross-version method)
$COMPOSE exec -T joomla-db mysql -ujoomla -pjoomla joomla -e "
  INSERT INTO \`#__content\` (title, alias, introtext, fulltext, state, catid, created, created_by, access, language)
  VALUES
    ('Hello OpenFeeder', 'hello-openfeeder',
     'This is a test article for OpenFeeder validation. It contains enough text to verify that the chunking and content API are working correctly.',
     'The OpenFeeder protocol exposes website content to LLMs via clean, structured endpoints.',
     1, 2, NOW(), (SELECT id FROM \`#__users\` LIMIT 1), 1, '*'),
    ('Second Test Article', 'second-test-article',
     'Another test article to verify index pagination.',
     'OpenFeeder provides a discovery endpoint and a content API that returns structured, chunked content suitable for large language models.',
     1, 2, NOW(), (SELECT id FROM \`#__users\` LIMIT 1), 1, '*');
" 2>/dev/null || {
  # Fallback without table prefix
  $COMPOSE exec -T joomla-db mysql -ujoomla -pjoomla joomla -e "
    INSERT INTO content (title, alias, introtext, fulltext, state, catid, created, created_by, access, language)
    VALUES
      ('Hello OpenFeeder', 'hello-openfeeder',
       'This is a test article for OpenFeeder validation. It contains enough text to verify that the chunking and content API are working correctly.',
       'The OpenFeeder protocol exposes website content to LLMs via clean, structured endpoints.',
       1, 2, NOW(), (SELECT id FROM users LIMIT 1), 1, '*'),
      ('Second Test Article', 'second-test-article',
       'Another test article to verify index pagination.',
       'OpenFeeder provides a discovery endpoint and a content API that returns structured, chunked content suitable for large language models.',
       1, 2, NOW(), (SELECT id FROM users LIMIT 1), 1, '*');
  " 2>/dev/null || echo "    Warning: Could not create sample content (may need manual creation)"
}

echo "==> Joomla: Done!"
echo "    Admin: http://localhost:8083/administrator (admin/admin)"
echo "    OpenFeeder: http://localhost:8083/.well-known/openfeeder.json"

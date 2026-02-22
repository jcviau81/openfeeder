#!/usr/bin/env bash
# Install and enable the OpenFeeder module in Drupal
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
COMPOSE="docker compose -f ${SCRIPT_DIR}/../docker-compose.yml"

echo "==> Drupal: Installing site..."
$COMPOSE exec -T drupal php /opt/drupal/vendor/bin/drush site:install standard \
  --db-url=pgsql://drupal:drupal@drupal-db:5432/drupal \
  --site-name="OpenFeeder Test Site" \
  --account-name=admin \
  --account-pass=admin \
  --yes

echo "==> Drupal: Enabling OpenFeeder module..."
$COMPOSE exec -T drupal php /opt/drupal/vendor/bin/drush en openfeeder --yes

echo "==> Drupal: Clearing caches..."
$COMPOSE exec -T drupal php /opt/drupal/vendor/bin/drush cr

echo "==> Drupal: Creating sample content..."
$COMPOSE exec -T drupal php /opt/drupal/vendor/bin/drush eval "
  use Drupal\node\Entity\Node;
  \$node = Node::create([
    'type' => 'article',
    'title' => 'Hello OpenFeeder',
    'body' => [['value' => 'This is a test article for OpenFeeder validation. It contains enough text to verify that the chunking and content API are working correctly. The OpenFeeder protocol exposes website content to LLMs via clean, structured endpoints.', 'format' => 'basic_html']],
    'status' => 1,
  ]);
  \$node->save();
  echo 'Created node ' . \$node->id() . PHP_EOL;
"

$COMPOSE exec -T drupal php /opt/drupal/vendor/bin/drush eval "
  use Drupal\node\Entity\Node;
  \$node = Node::create([
    'type' => 'article',
    'title' => 'Second Test Article',
    'body' => [['value' => 'Another test article to verify index pagination. OpenFeeder provides a discovery endpoint and a content API that returns structured, chunked content suitable for large language models.', 'format' => 'basic_html']],
    'status' => 1,
  ]);
  \$node->save();
  echo 'Created node ' . \$node->id() . PHP_EOL;
"

echo "==> Drupal: Done!"
echo "    Admin: http://localhost:8082/user/login (admin/admin)"
echo "    OpenFeeder: http://localhost:8082/.well-known/openfeeder.json"

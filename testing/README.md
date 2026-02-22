# OpenFeeder Local Testing Environment

Docker Compose setup that runs WordPress, Drupal, and Joomla locally with the OpenFeeder plugins pre-installed.

## Quick start

```bash
cd testing/
docker compose up -d
./setup.sh      # wait ~2min for DBs to init
./test-all.sh   # run validator against all 3
```

## Services

| CMS       | URL                    | Admin URL                              | Credentials   |
|-----------|------------------------|----------------------------------------|---------------|
| WordPress | http://localhost:8081  | http://localhost:8081/wp-admin         | admin / admin |
| Drupal    | http://localhost:8082  | http://localhost:8082/user/login       | admin / admin |
| Joomla    | http://localhost:8083  | http://localhost:8083/administrator    | admin / admin |

## What setup.sh does

1. Starts all containers (`docker compose up -d`)
2. Polls each CMS until it returns HTTP 200 (retries for up to 2 minutes)
3. **WordPress**: installs core via WP-CLI, activates the OpenFeeder plugin, creates sample posts
4. **Drupal**: runs `drush site:install`, enables the OpenFeeder module, creates sample articles
5. **Joomla**: waits for auto-installation, discovers and enables the plugin, creates sample articles

## What test-all.sh does

Runs `validator.py` from the `../validator/` directory against all three CMS instances and reports pass/fail for each.

## Teardown

```bash
# Stop containers (preserves data)
docker compose down

# Stop and remove all data
docker compose down -v
```

## Troubleshooting

**Container won't start**: Check logs with `docker compose logs <service>` (e.g., `docker compose logs wordpress`).

**Database not ready**: The setup script waits up to 2 minutes. If DBs are slow on first run, try `./setup.sh` again.

**Plugin not activating**: Verify the adapter source exists at `../adapters/<cms>/`. The plugin directories are bind-mounted read-only into the containers.

**Port conflicts**: If ports 8081-8083 are in use, edit the `ports:` section in `docker-compose.yml`.

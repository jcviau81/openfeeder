# OpenFeeder — Drupal Module

Expose your Drupal content to LLMs via the [OpenFeeder protocol](../../spec/SPEC.md).

## Requirements

- Drupal 10 or 11

## Installation

1. Copy (or symlink) this directory into your Drupal site:

   ```bash
   cp -r adapters/drupal /path/to/drupal/web/modules/custom/openfeeder
   ```

2. Enable the module via Drush or the admin UI:

   ```bash
   drush en openfeeder
   ```

   Or navigate to **Extend** (`/admin/modules`), find "OpenFeeder", and enable it.

3. Clear caches:

   ```bash
   drush cr
   ```

## Configuration

Settings are located at **Administration > Configuration > System > OpenFeeder** (`/admin/config/system/openfeeder`).

| Setting | Description | Default |
|---------|-------------|---------|
| Enable OpenFeeder | Toggle the API endpoints on/off | Enabled |
| Site Description | Override the site slogan in the discovery document | *(site slogan)* |
| Max Chunks per Response | Limit chunks returned per request (1-50) | 50 |

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /.well-known/openfeeder.json` | Discovery document |
| `GET /openfeeder` | Paginated content index |
| `GET /openfeeder?url=/path` | Chunked content for a specific node |
| `GET /openfeeder?q=search+term` | Search results ranked by relevance |

## Cache Invalidation

The module automatically invalidates cached responses when nodes are created, updated, or deleted via Drupal's cache tag system.

# OpenFeeder for Joomla — Installation

**No plugin manager needed.** Just drop two files.

## Steps

### 1. Copy `openfeeder.php` to your Joomla webroot

```bash
cp openfeeder.php /var/www/html/openfeeder.php
```

### 2. Add routing rules to `.htaccess`

Open your Joomla webroot `.htaccess` and add these lines **before** the main `RewriteRule` block (look for `## Joomla! core SEF Section.`):

```apache
## OpenFeeder LLM endpoints
RewriteRule ^\.well-known/openfeeder\.json$ openfeeder.php [L,QSA]
RewriteRule ^openfeeder/?$ openfeeder.php [L,QSA]
```

The `htaccess.txt` file included in this package contains exactly these lines.

### 3. Test

```bash
curl https://yoursite.com/.well-known/openfeeder.json
curl https://yoursite.com/openfeeder
```

Both should return JSON.

## Requirements

- Joomla 4.x or 5.x
- PHP 8.0+
- MySQL / MariaDB
- Apache mod_rewrite (standard on most hosts)

## How it works

`openfeeder.php` reads `configuration.php` directly (zero Joomla bootstrap),
connects to your database, and serves OpenFeeder-compliant JSON. Fast and dependency-free.

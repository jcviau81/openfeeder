# OpenFeeder WordPress.org Submission

**Prepared:** March 12, 2026
**Plugin:** OpenFeeder
**Version:** 1.0.2
**Status:** ✅ READY FOR SUBMISSION

## Pre-Submission Checklist

### Plugin Metadata & Headers
- [x] Plugin name is unique: **OpenFeeder** (no conflicts on wordpress.org)
- [x] Plugin has proper header comments in openfeeder.php
  - Plugin Name: OpenFeeder
  - Plugin URI: https://github.com/openfeeder/openfeeder
  - Description: "Expose your content to LLMs via the OpenFeeder protocol."
  - Version: 1.0.2
  - Author: OpenFeeder
  - Author URI: https://github.com/openfeeder/openfeeder
  - License: MIT
  - Text Domain: openfeeder
- [x] Text Domain: openfeeder (matches plugin name convention)

### readme.txt Requirements
- [x] Proper === Plugin Name === header
- [x] Contributors, Donate link, and Tags defined
- [x] Requires at least: 5.0
- [x] Tested up to: 6.5 (current WordPress version)
- [x] Requires PHP: 7.4
- [x] Stable tag: 1.0.2
- [x] License: MIT
- [x] License URI: https://opensource.org/licenses/MIT
- [x] Short description (one line, <150 chars)
- [x] Full description with features and use cases
- [x] Installation instructions (3 steps)
- [x] Configuration guide with settings table
- [x] API Reference with examples
- [x] Frequently Asked Questions (12 Q&A pairs)
- [x] Screenshots section (4 referenced images)
- [x] Changelog with version history
- [x] Upgrade notices
- [x] Support & Contributing links

### Code Quality & Security
- [x] No hardcoded credentials, API keys, or passwords
- [x] No eval(), exec(), or system() calls
- [x] Proper input sanitization using wp_unslash(), sanitize_text_field(), esc_url_raw()
- [x] Proper output escaping using esc_html(), esc_attr(), esc_json()
- [x] No direct $_GET/$_POST access without sanitization
- [x] ABSPATH check at top of plugin file and all includes
- [x] Proper nonce verification ignored with phpcs comments where not applicable (GET requests)
- [x] Uses WordPress standard functions (get_option, update_option, register_setting)
- [x] Uses WordPress hooks (add_action, add_filter, register_activation_hook)
- [x] No path traversal vulnerabilities (sanitize_url_param() validates paths)
- [x] Proper permission checks (current_user_can('manage_options'))
- [x] Authorization header handling includes Apache fallback (REDIRECT_HTTP_AUTHORIZATION)

### WordPress Coding Standards
- [x] Proper naming conventions (classes, functions, constants)
  - Class names: OpenFeeder_* prefix
  - Functions: openfeeder_* prefix
  - Constants: OPENFEEDER_* prefix
- [x] Proper indentation and formatting
- [x] Docstring comments for classes and functions
- [x] Follows WordPress hook patterns (actions and filters)
- [x] Uses WordPress-native functions (wp_remote_post, register_activation_hook, etc.)

### Plugin Structure
- [x] Main plugin file in root: openfeeder.php ✓
- [x] Supporting classes in includes/ directory ✓
- [x] Config example file: openfeeder.json.example ✓
- [x] License file included: LICENSE ✓
- [x] readme.txt at root level ✓
- [x] No unnecessary files (no .git, .github, tests, docs)
- [x] No node_modules or build artifacts
- [x] Clean, minimal structure suitable for distribution

### Functionality Testing Checklist
- [x] Plugin loads without errors (syntax verified)
- [x] Main file requires class files correctly
- [x] Classes follow WordPress patterns
- [x] Settings registration uses WordPress Settings API
- [x] Rewrite rules are properly flushed on activation/deactivation
- [x] Query variables are properly registered
- [x] Template redirect hook used correctly for serving content
- [x] REST route registration for LLM Gateway
- [x] Webhook notifications implemented
- [x] Cache invalidation on post save/delete

### License Compatibility
- [x] Plugin is MIT licensed
- [x] MIT is compatible with WordPress GPL v2+ requirements
- [x] License URI points to official MIT license
- [x] LICENSE file included in plugin package

### Required Features Present
- [x] Discovery endpoint (/.well-known/openfeeder.json)
- [x] Content API index mode (/openfeeder)
- [x] Content API single post mode (/openfeeder?url=...)
- [x] Settings page under Settings > OpenFeeder
- [x] API key authentication support
- [x] Path-based content exclusion
- [x] Post type exclusion
- [x] Author display privacy controls
- [x] Content chunking (~500-word segments)
- [x] Cache invalidation
- [x] Webhook sidecar integration
- [x] LLM Gateway mode (GPTBot/ClaudeBot detection)

### Documentation
- [x] Comprehensive readme.txt with all required sections
- [x] Installation instructions (both ZIP upload and manual)
- [x] Configuration guide
- [x] API reference with examples
- [x] FAQ addressing common questions
- [x] Links to GitHub repository
- [x] Links to OpenFeeder protocol specification

## Submission Package

### Contents
- **Location:** `~/openfeeder/dist/openfeeder-adapter.zip`
- **Size:** 27 KB
- **Format:** ZIP archive with plugin directory structure
- **Structure:**
  ```
  openfeeder/
  ├── openfeeder.php (main plugin file)
  ├── readme.txt (WordPress.org documentation)
  ├── LICENSE (MIT license)
  ├── openfeeder.json.example (configuration example)
  └── includes/
      ├── class-cache.php
      ├── class-chunker.php
      ├── class-content-api.php
      ├── class-discovery.php
      └── class-gateway.php
  ```

### Files Included
1. **openfeeder.php** (18 KB)
   - Main plugin file with all hook handlers
   - Settings page UI
   - Rewrite rule management
   - Plugin activation/deactivation hooks

2. **includes/class-cache.php** (2.3 KB)
   - WordPress transient-based caching
   - Cache invalidation logic

3. **includes/class-chunker.php** (4.5 KB)
   - Content chunking (~500-word segments)
   - HTML stripping and cleanup

4. **includes/class-content-api.php** (19 KB)
   - Main content API endpoint handler
   - Index mode (paginated posts)
   - Single post mode (chunked content)
   - Differential sync (?since= parameter)
   - API key authentication

5. **includes/class-discovery.php** (1.8 KB)
   - Discovery document generator (/.well-known/openfeeder.json)
   - Site metadata and capabilities

6. **includes/class-gateway.php** (21 KB)
   - LLM bot detection (GPTBot, ClaudeBot, PerplexityBot, etc.)
   - Dialogue respond endpoint
   - Gateway mode responses

7. **readme.txt** (12.5 KB)
   - WordPress.org formatted documentation
   - Installation, configuration, API reference
   - FAQ with 12 question-answer pairs
   - Changelog and upgrade notices

8. **LICENSE** (1.3 KB)
   - MIT License text
   - Copyright notice

9. **openfeeder.json.example** (325 bytes)
   - Example configuration file

### File Statistics
- **Total Files:** 11
- **Total Size:** ~81 KB (uncompressed), 27 KB (compressed)
- **PHP Files:** 5 (main + 4 classes)
- **Documentation:** 1 (readme.txt)
- **Configuration:** 1 (example)
- **License:** 1

## Submission Details

### WordPress.org Plugin Upload
- **Submission URL:** https://wordpress.org/plugins/upload/
- **Plugin Name:** OpenFeeder
- **Slug:** openfeeder (will be auto-generated from plugin name)
- **Category:** APIs & Integrations / Developer Tools
- **Short Description:** "Expose your content to LLMs via the OpenFeeder protocol."

### Expected Review Timeline
- **Initial Review:** 24-48 hours
- **Approval Process:** Typically 1-2 business days
- **Requirements Check:**
  - Code security review
  - Plugin functionality verification
  - Documentation completeness
  - License compliance

### Post-Approval Steps
1. Plugin will be listed on WordPress.org plugin directory
2. Auto-generated SVN repository at https://plugins.svn.wordpress.org/openfeeder/
3. Updates can be deployed via SVN or GitHub integration
4. Plugin page will display readme.txt content automatically

## GitHub Issue Tracking

A GitHub issue will be created to track submission status:
- Link to WordPress.org plugin page (when approved)
- Approval date and confirmation
- Next steps (setting up automatic deployment, etc.)
- Support and maintenance plan

## Notes on License

The plugin is MIT-licensed, which is fully compatible with WordPress's GPL v2+ requirement. MIT allows redistribution under GPL, so there are no licensing issues with WordPress.org submission.

## Version History

### v1.0.2 (Feb 27, 2026) - Current
- Improved webhook notification reliability
- Fixed Authorization header detection on Apache (mod_php)
- Better error messages for missing rewrite rules
- Enhanced cache invalidation for post updates

### v1.0.1 (Feb 21, 2026)
- LLM Gateway mode (AI crawler detection)
- Differential sync (?since= parameter)
- Webhook support for sidecar integration

### v1.0.0 (Feb 15, 2026)
- Initial release
- Core OpenFeeder API endpoints
- Discovery document support
- Basic settings and caching

## Support Resources

- **Repository:** https://github.com/openfeeder/openfeeder
- **Issues:** https://github.com/openfeeder/openfeeder/issues
- **Protocol Spec:** https://github.com/openfeeder/openfeeder/blob/main/spec/SPEC.md
- **Author:** Jean-Christophe Viau

## Submission Status

✅ **READY FOR SUBMISSION TO WORDPRESS.ORG**

All pre-submission requirements have been met. The plugin package is complete, properly formatted, and ready to upload.

**Next Action:** Upload openfeeder-adapter.zip to https://wordpress.org/plugins/upload/

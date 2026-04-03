# Community Setup Guide

This document outlines the community infrastructure for OpenFeeder — GitHub Discussions categories, templates, and moderation guidelines.

## GitHub Discussions

GitHub Discussions is the recommended community platform for OpenFeeder. It keeps conversations close to the code, requires no additional accounts, and integrates with issues and PRs.

### Enabling Discussions

1. Go to **Settings** → **General** → **Features** in the GitHub repository
2. Check **Discussions**
3. Configure the categories below

### Discussion Categories

| Category | Description | Format |
|----------|-------------|--------|
| **Announcements** | Release notes, roadmap updates, milestone announcements | Announcement (maintainers only) |
| **General** | Open conversation about OpenFeeder, the protocol, and the ecosystem | Open-ended |
| **Adapter Help** | Questions about installing, configuring, or troubleshooting adapters | Q&A |
| **Show & Tell** | Share sites, integrations, or projects built with OpenFeeder | Open-ended |
| **Spec Discussion** | Proposals and discussion about the OpenFeeder specification | Open-ended |
| **Ideas** | Feature requests, adapter requests, and improvement suggestions | Open-ended |

### Pinned Discussions (create on launch)

1. **Welcome to OpenFeeder Discussions**

   ```markdown
   # Welcome!

   This is the community hub for OpenFeeder — an open standard for websites to expose
   structured content to LLMs.

   **Getting started:**
   - [Read the README](../README.md) for an overview
   - [Read the spec](../spec/SPEC.md) for the protocol details
   - [See the adapters](../adapters/) for platform-specific installation

   **How to get help:**
   - For adapter installation/configuration questions → **Adapter Help** category
   - For bug reports → [Open an Issue](../../issues/new)
   - For feature ideas → **Ideas** category
   - For spec proposals → **Spec Discussion** category

   **How to contribute:**
   - Read [CONTRIBUTING.md](../CONTRIBUTING.md)
   - Check [open issues](../../issues) for things to work on

   **Share what you build:**
   - Added OpenFeeder to your site? Post in **Show & Tell**!
   - Built a tool that uses OpenFeeder? We want to see it.
   ```

2. **Adapter Wishlist — What platforms should OpenFeeder support next?**

   ```markdown
   # Adapter Wishlist

   Which platforms should get an OpenFeeder adapter next? Vote with a thumbs-up
   reaction on existing suggestions, or add your own.

   **Current adapters:** Express, Next.js, FastAPI, Astro, Vite, WordPress, Drupal,
   Joomla, WooCommerce, Universal Sidecar

   **Requested (add yours below):**
   - Django
   - Ruby on Rails
   - Laravel
   - Spring Boot
   - Hugo
   - Eleventy
   - Shopify
   - Ghost
   - Strapi
   - Directus
   ```

## Issue Templates

Create these in `.github/ISSUE_TEMPLATE/`:

### Bug Report (`bug_report.yml`)

```yaml
name: Bug Report
description: Report a bug in an OpenFeeder adapter, tool, or the spec
labels: ["bug"]
body:
  - type: dropdown
    id: component
    attributes:
      label: Component
      options:
        - Express adapter
        - Next.js adapter
        - FastAPI adapter
        - Astro adapter
        - Vite adapter
        - WordPress adapter
        - Drupal adapter
        - Joomla adapter
        - WooCommerce adapter
        - Universal Sidecar
        - CLI
        - MCP Server
        - Validator
        - Spec
        - Other
    validations:
      required: true
  - type: textarea
    id: description
    attributes:
      label: What happened?
      placeholder: Describe the bug
    validations:
      required: true
  - type: textarea
    id: steps
    attributes:
      label: Steps to reproduce
      placeholder: |
        1. Install adapter...
        2. Configure...
        3. Run curl...
    validations:
      required: true
  - type: textarea
    id: expected
    attributes:
      label: Expected behavior
    validations:
      required: true
  - type: input
    id: version
    attributes:
      label: Version
      placeholder: e.g., 1.1.1, WordPress 6.5, Node 20
```

### Feature Request (`feature_request.yml`)

```yaml
name: Feature Request
description: Suggest a new feature or improvement
labels: ["enhancement"]
body:
  - type: dropdown
    id: component
    attributes:
      label: Component
      options:
        - New adapter
        - Existing adapter
        - Spec
        - CLI
        - MCP Server
        - Validator
        - Sidecar
        - Documentation
        - Other
    validations:
      required: true
  - type: textarea
    id: description
    attributes:
      label: What would you like?
      placeholder: Describe the feature or improvement
    validations:
      required: true
  - type: textarea
    id: motivation
    attributes:
      label: Why is this useful?
      placeholder: What problem does this solve?
    validations:
      required: true
```

### Spec Proposal (`spec_proposal.yml`)

```yaml
name: Spec Proposal
description: Propose a change to the OpenFeeder specification
labels: ["spec-proposal"]
body:
  - type: textarea
    id: problem
    attributes:
      label: Problem statement
      placeholder: What limitation or gap in the current spec does this address?
    validations:
      required: true
  - type: textarea
    id: proposal
    attributes:
      label: Proposed change
      placeholder: Describe the change, including example request/response payloads
    validations:
      required: true
  - type: textarea
    id: compatibility
    attributes:
      label: Backwards compatibility
      placeholder: Does this break existing implementations? How should they migrate?
    validations:
      required: true
```

## Issue Labels

Create these labels in the repository:

| Label | Color | Description |
|-------|-------|-------------|
| `adapter` | `#0075ca` | Related to a specific platform adapter |
| `spec-proposal` | `#d876e3` | Proposed change to the OpenFeeder specification |
| `docs` | `#0e8a16` | Documentation improvement |
| `testing` | `#fbca04` | Test suite improvement |
| `cli` | `#1d76db` | CLI tool |
| `mcp` | `#1d76db` | MCP server |
| `validator` | `#1d76db` | Validator tool |
| `sidecar` | `#1d76db` | Universal sidecar proxy |
| `good first issue` | `#7057ff` | Good for newcomers |
| `help wanted` | `#008672` | Extra attention needed |

## Moderation Guidelines

- Be welcoming to newcomers — OpenFeeder is a new project and every early adopter matters
- Redirect support questions from Issues to Discussions (Adapter Help category)
- Close spec proposals that lack a problem statement with a comment asking for one
- Convert high-quality Discussion threads into Issues when they reach consensus
- Pin important announcements (releases, breaking changes, community milestones)

# Built with OpenFeeder

A registry of sites and projects actively using OpenFeeder in production.

## Featured Projects

| Project | URL | Adapter Type | Description | Status |
|---------|-----|--------------|-------------|--------|
| **SketchyNews** | https://sketchynews.snaf.foo | Native (Astro) | Daily AI-generated comic news briefs from real news sources. Claude + FLUX image generation. | ✅ Live |

## How to Add Your Project

If you've implemented OpenFeeder (native adapter or sidecar), you're part of the ecosystem!

**Requirements:**
- Your site has a working `.well-known/openfeeder.json` endpoint
- You're actively maintaining the implementation
- You can verify ownership

**To add yourself:**
1. Fork [jcviau81/openfeeder](https://github.com/jcviau81/openfeeder)
2. Edit this file and add your project
3. Include: name, URL, adapter type (Native / Sidecar / MCP), brief description, and status
4. Submit a PR with title: `chore: add [Your Project] to BUILT_WITH registry`

**PR Template:**
```markdown
## Adding [Project Name] to BUILT_WITH

- **URL:** [Your OpenFeeder endpoint]
- **Adapter:** [Native / Sidecar / MCP]
- **Verification:** [Link to `.well-known/openfeeder.json` or screenshot]
- **Description:** [1-2 sentences about your use case]
```

## Community

Join us:
- GitHub Discussions: [jcviau81/openfeeder/discussions](https://github.com/jcviau81/openfeeder/discussions)
- Issues & Feature Requests: [GitHub Issues](https://github.com/jcviau81/openfeeder/issues)
- Contribute adapters: See `adapters/` directory in the main repo

---

*Last updated: 2026-03-12*  
*OpenFeeder v1.1.0*

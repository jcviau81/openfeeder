# OpenFeeder Outreach Email Templates

Use these templates to reach out to communities, maintainers, and platforms about OpenFeeder.

---

## Template 1: Dev.to Post Comment & Outreach

**Subject:** OpenFeeder — An Open Standard for LLM Content Access

**Body:**

Hi [Author/Community],

I just shipped [OpenFeeder](https://github.com/jcviau81/openfeeder) — an open standard for websites to expose content natively to LLMs. No scraping, no noise.

The idea: instead of LLMs digging through 300KB of HTML to extract a 10KB article, sites implement a single `.well-known/openfeeder.json` endpoint that serves clean, structured JSON designed for AI consumption.

**Why you might care:**
- If you write about AI/tooling: OpenFeeder solves a real friction point in the LLM web access story
- If your site gets indexed by LLMs: You can optimize how Claude, GPT, Perplexity, and other AI systems read your content
- If you maintain a framework/CMS: We have adapters for Express, FastAPI, Next.js, Astro, WordPress — and we need more

**Real-world impact:**
- BBC News: 30x reduction in bandwidth per request
- WordPress (default theme): 22x smaller payloads
- Hacker News: 8x cleaner structured data
- Zero anti-scraping arms race needed

We have a working implementation running at [SketchyNews](https://sketchynews.snaf.foo) — hit the endpoint and see what structured JSON-LD output looks like.

**I'd love your thoughts:** Is this useful? What's missing? Would your community benefit from native adapter support?

Repo: https://github.com/jcviau81/openfeeder

—

*OpenFeeder is MIT licensed and open to contributions.*

---

## Template 2: Reddit r/webdev & r/programming

**Title:** OpenFeeder — An Open Standard for LLM Content Access (No More Scraping Wars)

**Body:**

Hi [subreddit],

I built [OpenFeeder](https://github.com/jcviau81/openfeeder) — a server-side protocol that lets websites expose content natively to LLMs, bypassing the entire HTML scraping mess.

**The problem it solves:**
- LLMs scraping your site get 200KB of HTML soup: ads, nav, JS bundles, tracking pixels
- You rate-limit them → angry AI companies
- They use headless browsers → your server gets hammered
- Everyone loses

**The solution:**
Sites implement one endpoint:
```
https://yoursite.com/.well-known/openfeeder.json   ← discovery
https://yoursite.com/openfeeder?q=search_query      ← content
```

LLMs get:
- Clean JSON (1KB vs 19KB raw HTML)
- Structured data (JSON-LD)
- Real-time sync (differential updates)
- No noise (no ads, nav, scripts)

**We have a working demo:** [SketchyNews](https://sketchynews.snaf.foo) — an AI-powered news comic site using OpenFeeder.

**Benchmarks (real sites, measured Feb 2026):**
- BBC News: 30x smaller payloads
- Ars Technica: 39x smaller
- WordPress default: 22x smaller

**Looking for:**
1. Feedback from the community
2. People interested in building adapters (Express, Django, Ruby on Rails, etc.)
3. Sites willing to test the protocol

Repo: https://github.com/jcviau81/openfeeder

Happy to answer questions — this is about making the LLM + website relationship less adversarial.

---

## Template 3: Framework Maintainers (Next.js, Astro, Django, Rails, etc.)

**Subject:** OpenFeeder Adapter for [Framework] — Let's Make LLM Integration Native

**Body:**

Hi [Maintainer/Team],

I'm reaching out because I think [Framework] would be a natural fit for native OpenFeeder support.

OpenFeeder is an open standard (GitHub: jcviau81/openfeeder) for websites to expose content to LLMs in a structured, clean way. Instead of LLMs scraping your rendered HTML, they call a native endpoint and get JSON.

**Why [Framework] specifically:**
- [Next.js: SSR and RSC already structure your data — we can tap that]
- [Astro: Static sites + content collections = perfect for OpenFeeder]
- [Django/Rails: Your ORM already has the data — just expose it]
- [FastAPI: Pydantic models serialize perfectly to our schema]

**What we're asking:**
1. Interest in an official adapter (we'd maintain it in the main repo)
2. Feedback on the spec (any Framework-specific pain points?)
3. Maybe a shout-out if you like the idea

**What you get:**
- Your users can easily make their sites AI-friendly
- Better control over how LLMs see their content
- No scraping, no bot detection, no arms race

**The current state:**
- Spec: 1.0 (stable, MIT licensed)
- Working adapters: Astro, Express, FastAPI, Next.js (basic)
- Real-world deployment: SketchyNews (Astro)
- Community: Just getting started — this is a good time to shape the direction

**No pressure** — just wanted to see if you'd be interested in collaborating.

Repo: https://github.com/jcviau81/openfeeder  
Docs: https://openfeeder.dev (coming soon)

Let me know if you want to chat!

---

## Template 4: LLM Companies (Anthropic, OpenAI, Perplexity, etc.)

**Subject:** OpenFeeder — A Better Way for Sites to Serve Content to Your Models

**Body:**

Hi [Product/Dev Relations Team],

I built OpenFeeder because I noticed a tension in how your systems interact with websites:

**Current situation:**
- Your LLMs scrape websites to get context
- Sites hate being scraped → block bots, rate-limit, use CAPTCHA
- Your systems work around it → headless browsers, distributed crawling, caching
- Everyone's unhappy

**The alternative:**
OpenFeeder is a simple, server-side protocol. Sites implement it once:
```
https://site.com/.well-known/openfeeder.json      ← discovery
https://site.com/openfeeder?q=query               ← structured content
```

**Benefits for your business:**
- Cleaner, faster data (1KB vs 19KB per page)
- Real-time, structured responses (no HTML parsing needed)
- Sites opt-in (way better optics than scraping)
- Reduces server load on both sides
- Better data quality (properly typed, verified by publishers)

**The ecosystem is forming:**
- Working spec (1.0, MIT)
- Production deployment: SketchyNews
- Community interest growing
- Open to collaboration on standardization

**Ask:**
Would you consider:
1. Supporting OpenFeeder endpoints in your web crawlers?
2. Documenting OpenFeeder compatibility in your docs?
3. Contributing feedback on the spec?

This isn't about locking content behind a proprietary wall — it's the opposite. It's about giving publishers control over how AI systems see their content.

Repo: https://github.com/jcviau81/openfeeder

Happy to discuss further.

---

## Template 5: CMS Platforms (WordPress, Contentful, Strapi, Ghost, etc.)

**Subject:** OpenFeeder Support for [CMS] — Make Your Users AI-Friendly

**Body:**

Hi [CMS Team],

We're working on [OpenFeeder](https://github.com/jcviau81/openfeeder), and I think [CMS] would be a great fit for native integration.

**Quick pitch:**
OpenFeeder lets websites expose clean, structured content to LLMs (Claude, GPT, etc.) — no scraping, no noise, just a simple JSON endpoint.

**Why [CMS] users need this:**
- Their sites get indexed by LLMs → they want control
- They publish regularly → OpenFeeder can sync that in real-time
- They want better LLM integration → (ChatGPT plugins, Claude skills, etc.)
- They don't want to manage separate APIs → our adapter handles it

**Example:**
A WordPress site with OpenFeeder would serve articles like:
```json
{
  "title": "Why OpenFeeder Matters",
  "author": "Jane Doe",
  "published": "2026-03-12",
  "content": "...",
  "tags": ["ai", "web-standards"]
}
```

LLM bots get exactly what they need. No database queries for ads or sidebar widgets.

**What we're asking:**
1. Official adapter integration (we maintain it)
2. Docs on how [CMS] users enable it
3. Feedback on the spec

**Current status:**
- Spec is stable (1.0, MIT)
- Working adapters: Astro, Express, FastAPI
- Real deployment: SketchyNews (40+ articles)
- Growing community interest

This is a good time to get involved — the standard is young and shaped by feedback.

Repo: https://github.com/jcviau81/openfeeder

Let me know if you'd like to chat!

---

## Template 6: Publishers & Content Sites

**Subject:** OpenFeeder — Let LLMs Access Your Content Better

**Body:**

Hi [Publisher],

I'm sharing something that might interest you: [OpenFeeder](https://github.com/jcviau81/openfeeder).

**The current problem:**
- LLMs (ChatGPT, Claude, Perplexity) scrape your site
- They extract context from 300KB of HTML
- You can't control what they see or how they use it
- You have no metrics on AI-driven traffic

**OpenFeeder solves this:**
Sites implement one endpoint. LLMs get clean, structured content. You get:
- Better API control (rate limits, analytics)
- Cleaner data (no confusion from ads, nav, etc.)
- Real-time metrics on AI traffic
- Better indexing for AI tools

**Example:**
Instead of LLMs reading the full rendered page, they call:
```
https://yoursite.com/openfeeder?q=climate+policy
```

And get exactly the articles that match, in JSON, with metadata.

**Real-world impact:**
BBC News: 30x smaller payloads for LLM bots  
Ars Technica: 39x reduction  
No performance hit on your actual readers.

**We have a demo:** [SketchyNews](https://sketchynews.snaf.foo) — showing what OpenFeeder looks like in the wild.

**Interested?** The implementation is simple (a plugin or a few routes). We have adapters for popular platforms.

More info: https://github.com/jcviau81/openfeeder

Questions? I'm happy to help.

---

## General Tips for Outreach

1. **Personalize:** Mention something specific about their project/platform
2. **Be concrete:** Show examples (the SketchyNews endpoint, benchmark numbers)
3. **Make ask clear:** What specifically do you want from them?
4. **Lead with benefit:** Why *their* community/business should care
5. **Keep it short:** 3-4 paragraphs max
6. **Include a link:** GitHub repo, docs, working demo
7. **Be honest:** We're early, community-driven, looking for feedback

## Tracking Responses

Save outreach in a spreadsheet:
| Date | Recipient | Platform | Template Used | Status | Notes |
|------|-----------|----------|----------------|--------|-------|
| 2026-03-12 | dev.to community | Dev.to | Template 1 | Sent | Waiting for responses |
| 2026-03-12 | @nextjs | X/Twitter | Forum | DM sent | — |

---

*Last updated: 2026-03-12*  
*OpenFeeder v1.1.0*

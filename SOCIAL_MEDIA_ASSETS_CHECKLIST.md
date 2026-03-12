# OpenFeeder Social Media Assets Checklist

Post calendar and asset requirements for Week 1–8 launch promotion.

---

## Week 1: Announcement (Mar 12–18)

### Post 1.1: "OpenFeeder Announcement" 🎉
**Platforms:** Twitter/X, LinkedIn, Dev.to, Reddit  
**Content Type:** Launch announcement with problem/solution hook  
**Assets:**
- [ ] Main graphic (1200x630): "OpenFeeder | The Standard for AI-Native Content" 
  - **Type:** Custom design (hero image)
  - **What it needs:** Logo, problem/solution visual, "v1.0 Live" badge
  - **Who:** Design (Figma)
- [ ] Twitter card (1024x512): Horizontal version of above
  - **Type:** Custom design (derivative)
  - **What it needs:** Same as above, landscape aspect ratio
  - **Who:** Design
- [ ] LinkedIn banner (1500x500): "OpenFeeder is Live"
  - **Type:** Custom design
  - **What it needs:** Professional tone, stats (30x smaller payloads)
  - **Who:** Design
- [ ] Demo video/GIF (15–30s): `.well-known/openfeeder.json` endpoint call + JSON response
  - **Type:** Auto-generated (curl demo, record terminal)
  - **What it needs:** Script `demo_video.sh` (bash + ffmpeg)
  - **Who:** Dev

**Copy:** Announcement tweet (280 chars), LinkedIn post (300 chars), blog post intro

---

### Post 1.2: "The Problem" 
**Platforms:** Twitter/X (thread), LinkedIn, Dev.to  
**Content Type:** Explainer thread  
**Assets:**
- [ ] Infographic: "HTML Soup vs OpenFeeder" 
  - **Type:** Auto-generated (Python script creates comparison chart)
  - **What it needs:** Data (300KB HTML vs 1KB JSON), simple bar chart
  - **Who:** Dev (matplotlib/plotly)
- [ ] Comparison table (image): Raw HTML overhead across sites
  - **Type:** Auto-generated (from README benchmarks)
  - **What it needs:** Table data already exists (BBC, Ars Technica, Le Monde, etc.)
  - **Who:** Dev (generate from README → PNG)
- [ ] Code snippet image: "Before/After" requests
  - **Type:** Auto-generated (highlight.js screenshot)
  - **What it needs:** Side-by-side curl commands
  - **Who:** Dev

**Copy:** Twitter thread (5–7 tweets), LinkedIn article, Dev.to post

---

### Post 1.3: "Live Demo"
**Platforms:** Twitter, LinkedIn, Discord, GitHub Discussions  
**Content Type:** Product demo  
**Assets:**
- [ ] Terminal recording: Live curl requests to SketchyNews endpoint
  - **Type:** Auto-generated (asciinema + recording script)
  - **What it needs:** Demo script, terminal theme (nord/dracula)
  - **Who:** Dev
- [ ] JSON response pretty-print (image): Example output
  - **Type:** Auto-generated (jq output → screenshot)
  - **What it needs:** Real endpoint response
  - **Who:** Dev

**Copy:** "Here's OpenFeeder in action" + demo link

---

## Week 2: Technical Deep Dive (Mar 19–25)

### Post 2.1: "How It Works"
**Platforms:** Dev.to, Reddit r/webdev, Twitter thread  
**Content Type:** Educational  
**Assets:**
- [ ] Architecture diagram: Discovery → Index → Fetch flow
  - **Type:** Custom design (Lucidchart or draw.io)
  - **What it needs:** OpenFeeder flow, interaction arrows, example endpoints
  - **Who:** Design
- [ ] Sequence diagram (image): Client → OpenFeeder endpoint → LLM
  - **Type:** Auto-generated (mermaid → PNG)
  - **What it needs:** mermaid-cli, UML sequence diagram
  - **Who:** Dev

**Copy:** Tech blog post, Reddit thread, Twitter thread explanation

---

### Post 2.2: "Adapters Available"
**Platforms:** Twitter, LinkedIn, Dev.to  
**Content Type:** Showcase  
**Assets:**
- [ ] Adapter grid (1200x800): All available adapters with logos
  - **Type:** Custom design
  - **What it needs:** Framework logos (Astro, Express, FastAPI, Next.js, etc.)
  - **Who:** Design (grab from official brand repos)
- [ ] Code snippet carousel (5 images): One per adapter showing minimal implementation
  - **Type:** Auto-generated (syntax highlight → PNG)
  - **What it needs:** Real code from `adapters/` folder
  - **Who:** Dev (automate with script)

**Copy:** "Build for OpenFeeder in minutes with [Framework]"

---

### Post 2.3: "Real-World Impact"
**Platforms:** LinkedIn, Twitter, Dev.to  
**Content Type:** Data visualization  
**Assets:**
- [ ] Benchmark visualization (1200x600): Bar chart — HTML vs OpenFeeder payload sizes
  - **Type:** Auto-generated (matplotlib/D3.js)
  - **What it needs:** Benchmark data (already in README)
  - **Who:** Dev
- [ ] Time savings infographic (1200x630): "Response time comparison"
  - **Type:** Auto-generated (chart)
  - **What it needs:** Latency benchmarks (measure if missing)
  - **Who:** Dev (measure + chart)
- [ ] Energy/Carbon badge (500x300): "22x Less Data = Less Carbon"
  - **Type:** Auto-generated (simple badge)
  - **What it needs:** Calculation (MB saved × energy per MB)
  - **Who:** Dev

**Copy:** LinkedIn article on environmental impact, Twitter stats

---

## Week 3: Community Building (Mar 26–Apr 1)

### Post 3.1: "Featured: SketchyNews"
**Platforms:** All platforms  
**Content Type:** Case study  
**Assets:**
- [ ] SketchyNews screenshot: Comic generation example
  - **Type:** Product screenshot (capture from live site)
  - **What it needs:** Link to https://sketchynews.snaf.foo
  - **Who:** Manual (or automated with playwright)
- [ ] Comic carousel (3–5 images): Different SketchyNews outputs
  - **Type:** Curated from SketchyNews (export from DB)
  - **What it needs:** High-quality comics
  - **Who:** Manual selection
- [ ] Case study infographic: "SketchyNews by the numbers"
  - **Type:** Auto-generated (metrics dashboard)
  - **What it needs:** Analytics from SketchyNews (posts/day, API calls, user count)
  - **Who:** Dev

**Copy:** "Built with OpenFeeder: SketchyNews" case study post

---

### Post 3.2: "Call for Contributors"
**Platforms:** GitHub, Reddit, Twitter, Dev.to  
**Content Type:** Community call  
**Assets:**
- [ ] Contribution guide (visual): "How to contribute" flowchart
  - **Type:** Custom design or auto-generated (mermaid)
  - **What it needs:** Fork → Create Adapter → PR → Deploy flow
  - **Who:** Design
- [ ] "Good First Issue" badge (500x300)
  - **Type:** Auto-generated (simple badge generator)
  - **What it needs:** Just text
  - **Who:** Dev

**Copy:** "We're looking for adapter maintainers" + contribution guide link

---

### Post 3.3: "Use Cases & Ideas"
**Platforms:** Twitter thread, LinkedIn, Dev.to  
**Content Type:** Inspiration  
**Assets:**
- [ ] Use case grid (1200x800): 6 example implementations
  - **Type:** Custom design
  - **What it needs:** Scenarios (News site, E-commerce, Documentation, Blog, API docs, Support KB)
  - **Who:** Design (icon-driven layout)
- [ ] Code examples (carousel of 6): Minimal setup for each use case
  - **Type:** Auto-generated (syntax highlight)
  - **What it needs:** Example implementations
  - **Who:** Dev

**Copy:** Twitter thread on "6 ways to use OpenFeeder"

---

## Week 4: Social Proof & Testimonials (Apr 2–8)

### Post 4.1: "Early Adopters"
**Platforms:** All platforms  
**Content Type:** Social proof  
**Assets:**
- [ ] Testimonial graphics (1200x630 each, 3–5): Developer/publisher quotes
  - **Type:** Custom design (quote card template)
  - **What it needs:** Quotes from early adopters (need to collect these first)
  - **Who:** Design (template), then populate
- [ ] "Who's Using OpenFeeder" grid
  - **Type:** Custom design or simple HTML/CSS table
  - **What it needs:** Logo + URL of each adopter
  - **Who:** Design or manual

**Copy:** Retweet/reshare each testimonial

---

### Post 4.2: "Stats & Milestones"
**Platforms:** Twitter, LinkedIn  
**Content Type:** Growth metrics  
**Assets:**
- [ ] Milestone graphic: GitHub stats (stars, contributors, forks)
  - **Type:** Auto-generated (fetch from GitHub API)
  - **What it needs:** Script to pull live stats → generate graphic
  - **Who:** Dev
- [ ] Growth chart (30 days): Stars/forks trajectory
  - **Type:** Auto-generated (matplotlib)
  - **What it needs:** GitHub historical data (or start tracking now)
  - **Who:** Dev

**Copy:** "Thanks for the early support! 🙏 We just hit X stars"

---

### Post 4.3: "Press/Coverage"
**Platforms:** All platforms  
**Content Type:** Press mentions  
**Assets:**
- [ ] "As seen in" badge grid (1200x400): Publication logos
  - **Type:** Custom design or auto-generated
  - **What it needs:** Links/screenshots of press mentions (collect as they come in)
  - **Who:** Manual
- [ ] "Featured on" graphic (1024x512): Hacker News / Product Hunt if applicable
  - **Type:** Custom design
  - **What it needs:** Screenshot or badge
  - **Who:** Manual

**Copy:** Press release or roundup post

---

## Week 5–8: Content Series & Evergreen (Apr 9–29)

### Post 5.1–5.4: "Adapter Series"
**Platforms:** Dev.to (4-part blog series), Twitter thread  
**Content Type:** Educational  
**Assets:**
- [ ] Blog header (1200x630 each, 4): One per adapter
  - **Type:** Custom design (template)
  - **What it needs:** Framework logo + "Building OpenFeeder for [X]"
  - **Who:** Design
- [ ] Code snippets (auto-generated throughout)
  - **Type:** Auto-generated
  - **What it needs:** Extract from official adapter repos
  - **Who:** Dev

**Copy:** 4 technical blog posts (1 per adapter: Astro, Express, Next.js, FastAPI)

---

### Post 6.1–6.3: "FAQ Series"
**Platforms:** Dev.to, Twitter thread  
**Content Type:** Educational  
**Assets:**
- [ ] FAQ infographic (1200x800): Visual answers to top 5 questions
  - **Type:** Custom design
  - **What it needs:** Design questions we expect
  - **Who:** Design
- [ ] Comparison chart (1200x600): "OpenFeeder vs Scraping vs Other Standards"
  - **Type:** Auto-generated or custom
  - **What it needs:** Comparison matrix
  - **Who:** Design or Dev

**Copy:** FAQ blog post, Twitter threads

---

### Post 7.1–7.2: "Security & Privacy Deep Dive"
**Platforms:** Dev.to, Reddit r/webdev  
**Content Type:** Thought leadership  
**Assets:**
- [ ] Security checklist graphic (1200x800)
  - **Type:** Custom design
  - **What it needs:** GDPR, rate limiting, auth topics
  - **Who:** Design
- [ ] GDPR compliance badge (500x300)
  - **Type:** Auto-generated or simple badge
  - **What it needs:** Just text
  - **Who:** Design

**Copy:** Security blog post, Reddit discussion

---

### Post 8.1: "Retrospective & Looking Ahead"
**Platforms:** All platforms  
**Content Type:** Celebration + future vision  
**Assets:**
- [ ] Month 1 recap infographic (1200x800): What shipped, community stats, roadmap
  - **Type:** Auto-generated + custom design
  - **What it needs:** Milestones, contributor count, adoption numbers
  - **Who:** Dev (data) + Design (layout)
- [ ] Roadmap visual (1200x600): What's coming in Q2
  - **Type:** Custom design (Figma timeline)
  - **What it needs:** Major features planned
  - **Who:** Design

**Copy:** "Month 1 recap" blog post, LinkedIn update

---

## Automation Scripts Needed

Create these to minimize manual work:

### Dev Tasks (automation scripts)

```python
# 1. generate_benchmark_chart.py
# Input: README benchmarks data
# Output: benchmark_comparison.png (matplotlib)

# 2. generate_adapter_snippets.py
# Input: adapters/ directory
# Output: 4 code snippet images (syntax highlighted)

# 3. generate_github_stats.py
# Input: GitHub API (jcviau81/openfeeder)
# Output: stats_graphic.png (stars, contributors, forks)

# 4. generate_social_banners.py
# Input: text, emoji, template
# Output: Multiple social media images (different aspect ratios)

# 5. demo_video_generator.sh
# Input: curl commands
# Output: asciinema recording (.json) → terminal GIF
```

### Design Tasks (template setup)

```
Templates needed:
- Social media post (1200x630) — Instagram, LinkedIn, Twitter
- Story card (1080x1920) — Instagram Stories, Twitter Fleets
- Quote card (1200x630) — Testimonials
- Blog header (1200x630) — Dev.to, Medium, blog posts
- LinkedIn article banner (1500x500)
```

---

## Asset Submission Checklist

Before posting each asset:

- [ ] High resolution (min. 1200px wide)
- [ ] Accessible colors (contrast ratio 4.5:1 minimum)
- [ ] Logo and branding consistent
- [ ] Watermark/attribution if using external images
- [ ] File formats: PNG (transparent backgrounds), JPEG (photos), GIF (animated)
- [ ] Social media optimized (no white borders, legible text at thumbnail size)
- [ ] Filename: `[week]-[post-number]-[asset-type].png` (e.g., `w1-1-1-hero.png`)

---

## Content Calendar Template

| Week | Date | Platform | Post Type | Asset Status | Copy Status | Scheduled? |
|------|------|----------|-----------|--------------|------------|-----------|
| 1 | Mar 12 | Twitter | Announcement | Pending | ✅ | — |
| 1 | Mar 13 | Dev.to | Blog post | In progress | In progress | — |
| 1 | Mar 14 | LinkedIn | Article | Pending | Pending | — |
| ... | ... | ... | ... | ... | ... | ... |

---

## Key Metrics to Track

Once published, monitor:
- Impressions & reach (Twitter Analytics, LinkedIn)
- Engagement (likes, replies, retweets, shares)
- Click-through rate (use UTM parameters)
- Follower growth per post
- Traffic to GitHub/docs from social

**Add UTM tracking:**
```
https://github.com/jcviau81/openfeeder?utm_source=twitter&utm_medium=organic&utm_campaign=week1_announcement
```

---

## Notes

- **Design bottleneck?** Prioritize Post 1.1 (hero), 2.1 (architecture), 3.1 (SketchyNews case study) — these unlock the rest
- **No designer?** Start with Figma community templates or Canva; auto-generate charts where possible
- **Repurposing:** A single blog post can become 1 LinkedIn article + 5 Twitter threads + 1 Dev.to post + slides + video clip
- **Scheduling tool:** Use Buffer, Later, or Hootsuite to batch-schedule posts (especially Twitter threads)

---

*Last updated: 2026-03-12*  
*Ready for Week 1 Launch*

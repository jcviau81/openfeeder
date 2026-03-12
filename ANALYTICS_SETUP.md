# OpenFeeder Analytics Setup

Guide for implementing tracking on openfeeder.dev and related properties.

---

## Overview

**Goal:** Measure web traffic, user engagement, adapter adoption, and API usage across:
1. **openfeeder.dev** — Main documentation site
2. **GitHub repository** — Issues, discussions, stars
3. **SketchyNews** — Live implementation (reference site)
4. **Adapter repos** — npm/PyPI download tracking

**Metrics to track:**
- **Traffic:** Page views, unique visitors, geography, traffic sources
- **Engagement:** Time on page, bounce rate, scroll depth
- **Conversion:** Visitors → GitHub stars, GitHub → npm downloads, newsletter signups
- **Developer metrics:** Adapter downloads, API usage (rate limiting, quota tracking)

---

## Option A: Google Analytics 4 (Recommended for Simple Setup)

**Cost:** Free (generous free tier)  
**Effort:** 30 minutes  
**Best for:** Website traffic, engagement, conversions  
**Limitation:** No API usage tracking (separate tool needed)

### Setup

1. **Create Google Analytics account**
   ```
   Visit: https://analytics.google.com
   Sign in with your Google account
   Create new property: "OpenFeeder"
   ```

2. **Create GA4 web stream for openfeeder.dev**
   ```
   Admin → Property settings
   Data streams → Create stream
   - Platform: Web
   - Website URL: https://openfeeder.dev
   - Stream name: "openfeeder.dev"
   ```

3. **Get Measurement ID**
   ```
   Copy: G-XXXXXXXXXX (shown after stream creation)
   This goes in your site HTML
   ```

4. **Install tracking snippet on openfeeder.dev**
   ```html
   <!-- Google Analytics -->
   <script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
   <script>
     window.dataLayer = window.dataLayer || [];
     function gtag(){dataLayer.push(arguments);}
     gtag('js', new Date());
     gtag('config', 'G-XXXXXXXXXX');
   </script>
   ```

   **If using a static site generator (Astro, Hugo, Jekyll):**
   - Astro: Use `react-ga4` npm package in a layout component
   - Hugo/Jekyll: Add the snippet to `_includes/head.html` or layout template

5. **Configure custom events** (optional but useful)
   ```javascript
   // Track adapter downloads
   gtag('event', 'adapter_download', {
     adapter_name: 'astro',
     adapter_type: 'native'
   });
   
   // Track API endpoint calls
   gtag('event', 'api_call', {
     endpoint: '/openfeeder',
     query_type: 'search'
   });
   
   // Track GitHub navigation
   gtag('event', 'github_click', {
     link_type: 'repository',
     target: 'github.com/jcviau81/openfeeder'
   });
   ```

6. **Set up goals/conversions**
   ```
   Admin → Goals
   - Goal 1: "Star Repository" (click event → GitHub star link)
   - Goal 2: "npm Install" (click event → npm package link)
   - Goal 3: "Sign Up Newsletter" (form submission)
   ```

7. **Enable YouTube Reporting**
   ```
   Admin → Linked accounts
   Link Google Search Console for keyword tracking
   ```

### Dashboard Setup

Create custom report to track:
- **Real-time:** Current visitors, traffic sources
- **Traffic:** Page views, unique users, bounce rate, session duration
- **Geography:** Top countries, cities
- **Referrers:** Which sites refer traffic (Twitter, Dev.to, Reddit, etc.)
- **Conversions:** Clicks to GitHub, npm, newsletter

**Useful dimensions to add:**
- Page title & URL
- Traffic source (organic, direct, referral, social)
- Device category (mobile, desktop, tablet)
- User country

---

## Option B: Plausible Analytics (Privacy-First Alternative)

**Cost:** €9/month  
**Effort:** 20 minutes  
**Best for:** Privacy-conscious (no GDPR cookie issues), simple tracking  
**Limitation:** Fewer features than GA4, but sufficient for our needs

### Setup

1. **Sign up**
   ```
   Visit: https://plausible.io
   Create account, add property: "openfeeder.dev"
   ```

2. **Install tracking code**
   ```html
   <script defer data-domain="openfeeder.dev" src="https://plausible.io/js/script.js"></script>
   ```

3. **Add custom events**
   ```javascript
   // In Plausible, custom events are tracked like:
   plausible('adapter_download', {props: {name: 'astro'}})
   ```

**Plausible vs GA4:**
| Feature | Plausible | GA4 |
|---------|-----------|-----|
| Privacy | 🟢 GDPR compliant (no cookie needed) | 🔴 Needs cookie consent |
| Ease of use | 🟢 Simple dashboard | 🟡 Steeper learning curve |
| Cost | 💰 €9/month | 🟢 Free |
| Custom events | 🟢 Simple | 🟢 Advanced |
| Integrations | 🟡 Limited | 🟢 Extensive |

**Recommendation:** Use Plausible if privacy is priority; GA4 if you want free + advanced features.

---

## Option C: Umami Analytics (Self-Hosted, Open Source)

**Cost:** Free (requires server)  
**Effort:** 1–2 hours (includes hosting)  
**Best for:** Maximum privacy, data ownership, customization  
**Limitation:** Requires deployment, maintenance

### Setup

1. **Deploy Umami**
   ```bash
   # Use Docker (easiest)
   docker run -d \
     -e DATABASE_URL=postgresql://user:pass@host:5432/umami \
     -p 3000:3000 \
     umami
   ```

   Or use Vercel (free tier):
   ```
   Visit: https://umami.is/docs/install
   Click "Deploy to Vercel"
   ```

2. **Add tracking snippet**
   ```html
   <script async src="https://your-umami-domain.com/script.js" 
           data-website-id="XXXXX"></script>
   ```

3. **Access dashboard**
   ```
   https://your-umami-domain.com
   Login → View analytics in real-time
   ```

---

## Option D: Mixpanel (Advanced, Event-Driven)

**Cost:** Free tier ($500/month worth), paid plans start $999/month  
**Effort:** 1 hour  
**Best for:** Detailed user behavior, funnels, cohort analysis  
**Limitation:** Overkill for most projects, expensive at scale

### Setup

```javascript
// Install and initialize
npm install mixpanel-browser

// Track custom events
import mixpanel from 'mixpanel-browser';

mixpanel.init('PROJECT_TOKEN');

// Track adapter adoption
mixpanel.track('Adapter Installed', {
  adapter_name: 'astro',
  framework: 'astro',
  version: '1.0.0'
});

// Track API usage
mixpanel.track('API Call', {
  endpoint: '/openfeeder',
  response_time_ms: 145,
  status_code: 200
});
```

**Not recommended for initial launch** — add if adoption metrics become critical.

---

## API Usage Analytics (Separate from Website)

For tracking actual **OpenFeeder API calls** (not website traffic), add analytics to your sidecar/validator:

### Option 1: Self-Hosted Logging

**Setup:**
1. Log all API requests to a simple database (SQLite, PostgreSQL)
2. Expose `/analytics` endpoint with aggregated stats

**Implementation:**
```python
# FastAPI example
from datetime import datetime
import sqlite3

@app.middleware("http")
async def log_request(request: Request, call_next):
    request_id = uuid.uuid4()
    
    # Log request
    conn = sqlite3.connect('analytics.db')
    conn.execute('''
        INSERT INTO api_requests 
        (timestamp, method, path, user_agent, response_time)
        VALUES (?, ?, ?, ?, ?)
    ''', (
        datetime.now().isoformat(),
        request.method,
        request.url.path,
        request.headers.get('user-agent'),
        0  # will update after response
    ))
    conn.commit()
    
    response = await call_next(request)
    return response
```

**Dashboard endpoint:**
```python
@app.get("/analytics/summary")
async def get_analytics():
    conn = sqlite3.connect('analytics.db')
    stats = conn.execute('''
        SELECT 
            DATE(timestamp) as date,
            COUNT(*) as requests,
            AVG(response_time) as avg_response_time,
            COUNT(DISTINCT user_agent) as unique_agents
        FROM api_requests
        GROUP BY DATE(timestamp)
        ORDER BY date DESC
        LIMIT 30
    ''').fetchall()
    
    return {"daily_stats": stats}
```

### Option 2: Integration with Posthole.io (Lightweight)

```bash
# Post request data to Posthole endpoint
curl -X POST https://api.posthole.io/logs \
  -H "Content-Type: application/json" \
  -d '{
    "project": "openfeeder",
    "event": "api_call",
    "endpoint": "/openfeeder",
    "response_time_ms": 145
  }'
```

---

## Recommended Setup (Starter)

**For now, implement this MVP:**

1. **Google Analytics 4** (website traffic)
   - Deployment: 30 minutes
   - Track: Page views, referral sources, geography
   - Goal: Understand who's discovering OpenFeeder

2. **GitHub API queries** (repository metrics)
   ```bash
   # Script to track daily stats
   #!/bin/bash
   gh api repos/jcviau81/openfeeder --jq \
     '.stargazers_count, .forks_count, .watchers_count' \
     > analytics/github-stats-$(date +%Y-%m-%d).json
   ```
   - Cron job: Daily at 00:00 UTC
   - Track: Stars, forks, watchers growth

3. **npm/PyPI download tracking** (adapter adoption)
   ```bash
   # Check npm weekly downloads
   curl https://api.npmjs.org/downloads/point/last-week/openfeeder
   
   # Check PyPI stats (if applicable)
   curl https://libraries.io/api/pypi/openfeeder/stats
   ```
   - Update: Weekly
   - Track: Downloads per adapter

---

## Tracking Checklist

**Week 1 (Launch):**
- [ ] GA4 account created
- [ ] Tracking code installed on openfeeder.dev
- [ ] Custom events configured (GitHub clicks, npm clicks)
- [ ] Goals set up (star, download, newsletter)
- [ ] Real-time dashboard open during launch

**Week 2:**
- [ ] GitHub API script deployed (cron job)
- [ ] npm download tracking set up
- [ ] Initial baseline metrics captured
- [ ] Dashboard shared with team

**Ongoing:**
- [ ] Weekly summary generated (GA4 report)
- [ ] GitHub stats logged daily
- [ ] Monthly retrospective (What brought traffic? Where did people go?)

---

## Key Metrics to Monitor

### Traffic
- **Page views** (total)
- **Unique visitors** (per day)
- **Bounce rate** (should be <50%)
- **Avg. session duration** (aim for >2 min)
- **Top pages** (usually homepage + docs + GitHub)

### Conversion
- **GitHub repository** (% of visitors who click GitHub link)
- **npm package** (% who click npm link)
- **Docs engagement** (time spent on specific pages)
- **Newsletter signups** (if applicable)

### Growth
- **Week-over-week growth** in visitors
- **Stars per day** (GitHub)
- **Forks per day** (GitHub)
- **npm downloads per week** (per adapter)

### Traffic Sources
- **Organic** (Google, Bing)
- **Social** (Twitter, Reddit, Dev.to, LinkedIn)
- **Direct** (people typing URL)
- **Referral** (other sites linking to you)

**Healthy metrics for Week 1:**
- 500–1000 total visitors (from launch promotion)
- 50–100 GitHub stars
- 20–50 npm downloads
- 2–5 minutes average session duration
- >30% click-through to GitHub

---

## Public Analytics Dashboard

**Optional:** Share weekly metrics publicly

Create a `METRICS.md` in the repo that updates automatically:

```markdown
# OpenFeeder Metrics

Last updated: 2026-03-12

## GitHub
- ⭐ Stars: 23 (↑4 this week)
- 🍴 Forks: 2 (↑1 this week)
- 👀 Watchers: 23

## npm
- 📦 Weekly downloads: 156
- 📦 Monthly downloads: 487

## Website
- 👥 Unique visitors (this month): 2,341
- 📊 Page views: 5,692
- ⏱️ Avg session duration: 2m 34s

## Adapters
- Astro: 45 downloads
- Express: 32 downloads
- FastAPI: 28 downloads
- Next.js: 22 downloads

---

*Data is public and updated weekly. See [ANALYTICS_SETUP.md](ANALYTICS_SETUP.md) for details.*
```

---

## Troubleshooting

**GA4 not showing data?**
- Verify tracking code is on correct domain
- Check browser console for JS errors
- Allow 24–48 hours for data to populate
- Exclude your IP from analytics (Admin → Data Settings → Exclude traffic)

**Custom events not firing?**
- Check event names match exactly (case-sensitive)
- Verify gtag() function is available in window
- Use browser DevTools → Network tab to see gtag requests

**GitHub stats script not running?**
- Verify gh CLI is authenticated: `gh auth status`
- Check cron job logs: `crontab -l`
- Test manually: `gh api repos/jcviau81/openfeeder`

---

## Next Steps

1. **Implement GA4** (this week)
2. **Add GitHub stats tracking** (this week)
3. **Set up npm download monitoring** (by end of Week 1)
4. **Review metrics weekly** (every Monday morning)
5. **Share with team** (Friday updates)

---

*Last updated: 2026-03-12*  
*OpenFeeder v1.1.0*

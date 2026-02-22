"""
Tests for JSON-LD + OpenGraph metadata extraction in chunker.py

Run: python test_chunker.py
"""

from __future__ import annotations

import sys

from chunker import chunk_html, extract_metadata, parse_iso_duration

# ---------------------------------------------------------------------------
# Test fixtures
# ---------------------------------------------------------------------------

RECIPE_HTML_SINGLE_QUOTE = """\
<html lang="fr-CA">
<head>
  <title>Pâté chinois classique - Ricardo</title>
  <script type='application/ld+json'>
  {
    "@context": "https://schema.org",
    "@type": "Recipe",
    "name": "Pâté chinois classique",
    "description": "La meilleure recette de pâté chinois, un classique québécois.",
    "author": {"@type": "Person", "name": "Ricardo Larrivée"},
    "datePublished": "2023-05-15",
    "keywords": "pâté chinois, québécois, classique",
    "recipeIngredient": [
      "1 lb boeuf haché",
      "1 boîte de maïs en crème",
      "4 pommes de terre"
    ],
    "recipeInstructions": [
      {
        "@type": "HowToSection",
        "name": "Préparation de la viande",
        "itemListElement": [
          {"@type": "HowToStep", "text": "Faire revenir le boeuf haché."},
          {"@type": "HowToStep", "text": "Assaisonner avec sel et poivre."}
        ]
      },
      {
        "@type": "HowToStep",
        "text": "Étaler le maïs en crème sur la viande."
      },
      {
        "@type": "HowToStep",
        "text": "Couvrir de purée de pommes de terre."
      }
    ],
    "prepTime": "PT20M",
    "cookTime": "PT45M",
    "totalTime": "PT1H5M",
    "aggregateRating": {
      "@type": "AggregateRating",
      "ratingValue": "4.8",
      "ratingCount": "1250"
    },
    "recipeCategory": "Plat principal",
    "recipeYield": "6 portions",
    "recipeSubCategories": ["Comfort food", "Traditionnel"]
  }
  </script>
</head>
<body>
  <main>
    <h1>Pâté chinois classique</h1>
    <p>La meilleure recette de pâté chinois, un classique québécois réconfortant pour toute la famille.</p>
  </main>
</body>
</html>
"""

ARTICLE_HTML_DOUBLE_QUOTE = """\
<html lang="en">
<head>
  <title>AI Revolution in 2025 - SketchyNews</title>
  <script type="application/ld+json">
  {
    "@context": "https://schema.org",
    "@type": "NewsArticle",
    "headline": "The AI Revolution Is Here and It's Weirder Than You Think",
    "description": "A deep dive into the latest AI developments.",
    "author": {"@type": "Person", "name": "Jane Doe"},
    "datePublished": "2025-03-10T14:00:00Z",
    "dateModified": "2025-03-11T09:30:00Z",
    "keywords": ["AI", "technology", "future"],
    "articleSection": "Technology"
  }
  </script>
</head>
<body>
  <article>
    <h1>The AI Revolution Is Here</h1>
    <p>Artificial intelligence is transforming every industry at an unprecedented pace, from healthcare to finance.</p>
    <p>Experts predict that by 2030, AI will be integrated into nearly every aspect of daily life.</p>
  </article>
</body>
</html>
"""

OPENGRAPH_ONLY_HTML = """\
<html lang="en">
<head>
  <title>OpenGraph Only Page</title>
  <meta property="og:title" content="The Real OG Title" />
  <meta property="og:description" content="This page only has OpenGraph tags." />
  <meta property="og:image" content="https://example.com/image.jpg" />
  <meta property="og:type" content="article" />
  <meta property="article:author" content="OG Author" />
  <meta property="article:published_time" content="2024-12-01T10:00:00Z" />
  <meta property="article:tag" content="test" />
  <meta property="article:tag" content="opengraph" />
  <meta name="twitter:title" content="Twitter Title Fallback" />
  <meta name="twitter:description" content="Twitter description fallback." />
</head>
<body>
  <main>
    <h1>OpenGraph Only Page</h1>
    <p>This page has no JSON-LD at all, only OpenGraph and Twitter Card meta tags.</p>
  </main>
</body>
</html>
"""

PLAIN_HTML = """\
<html>
<head>
  <title>Just a Plain Page</title>
  <meta name="description" content="A simple page with no structured metadata." />
  <meta name="author" content="Plain Author" />
</head>
<body>
  <h1>Welcome to the Plain Page</h1>
  <p>This is a completely plain HTML page with no JSON-LD and no OpenGraph tags. Only basic HTML metadata.</p>
</body>
</html>
"""


# ---------------------------------------------------------------------------
# Test runner
# ---------------------------------------------------------------------------

def _run_tests() -> tuple[int, int]:
    passed = 0
    failed = 0

    def check(name: str, condition: bool, detail: str = ""):
        nonlocal passed, failed
        if condition:
            print(f"  PASS  {name}")
            passed += 1
        else:
            print(f"  FAIL  {name}{' — ' + detail if detail else ''}")
            failed += 1

    # ── Test 1: Recipe with single-quote JSON-LD ──────────────────────
    print("\n[Test 1] Recipe JSON-LD (single-quote script tag, Ricardo-style)")
    meta = extract_metadata(RECIPE_HTML_SINGLE_QUOTE, "https://www.ricardo.ca/pate-chinois")
    check("type is recipe", meta.get("type") == "recipe", f"got {meta.get('type')}")
    check("title", meta.get("title") == "Pâté chinois classique", f"got {meta.get('title')!r}")
    check("author from Person object", meta.get("author") == "Ricardo Larrivée", f"got {meta.get('author')!r}")
    check("published", meta.get("published") == "2023-05-15", f"got {meta.get('published')!r}")
    check("keywords is list", isinstance(meta.get("keywords"), list) and len(meta["keywords"]) == 3,
          f"got {meta.get('keywords')!r}")
    check("schema_type", meta.get("schema_type") == "Recipe", f"got {meta.get('schema_type')!r}")

    extra = meta.get("extra", {})
    check("ingredients count", len(extra.get("ingredients", [])) == 3, f"got {extra.get('ingredients')!r}")
    check("instructions flattened",
          isinstance(extra.get("instructions"), list) and len(extra["instructions"]) >= 4,
          f"got {len(extra.get('instructions', []))} instructions")
    check("section header in instructions",
          any("Préparation de la viande" in s for s in extra.get("instructions", [])),
          f"got {extra.get('instructions')!r}")
    check("prepTime parsed", extra.get("prepTime") == "20 min", f"got {extra.get('prepTime')!r}")
    check("cookTime parsed", extra.get("cookTime") == "45 min", f"got {extra.get('cookTime')!r}")
    check("totalTime parsed", extra.get("totalTime") == "1h 5 min", f"got {extra.get('totalTime')!r}")
    check("rating", extra.get("rating") == "4.8", f"got {extra.get('rating')!r}")
    check("rating_count", extra.get("rating_count") == "1250", f"got {extra.get('rating_count')!r}")
    check("category", extra.get("category") == "Plat principal", f"got {extra.get('category')!r}")
    check("yield", extra.get("yield") == "6 portions", f"got {extra.get('yield')!r}")
    check("sub_categories (Ricardo ext)", extra.get("sub_categories") == ["Comfort food", "Traditionnel"],
          f"got {extra.get('sub_categories')!r}")

    # chunk_html should produce ingredients + instructions chunks
    page = chunk_html("https://www.ricardo.ca/pate-chinois", RECIPE_HTML_SINGLE_QUOTE)
    chunk_types = [c.chunk_type for c in page.chunks]
    check("ingredients chunk exists", "ingredients" in chunk_types, f"types: {chunk_types}")
    check("instructions chunk exists", "instructions" in chunk_types, f"types: {chunk_types}")
    check("ParsedPage.metadata populated", page.metadata.get("type") == "recipe",
          f"got {page.metadata.get('type')!r}")

    # ── Test 2: Article with double-quote JSON-LD ─────────────────────
    print("\n[Test 2] Article JSON-LD (double-quote script tag, NewsArticle)")
    meta = extract_metadata(ARTICLE_HTML_DOUBLE_QUOTE, "https://sketchynews.snaf.foo/ai-revolution")
    check("type is article", meta.get("type") == "article", f"got {meta.get('type')}")
    check("title from headline", meta.get("title") == "The AI Revolution Is Here and It's Weirder Than You Think",
          f"got {meta.get('title')!r}")
    check("author", meta.get("author") == "Jane Doe", f"got {meta.get('author')!r}")
    check("published", meta.get("published") == "2025-03-10T14:00:00Z", f"got {meta.get('published')!r}")
    check("modified", meta.get("modified") == "2025-03-11T09:30:00Z", f"got {meta.get('modified')!r}")
    check("keywords is list of 3", isinstance(meta.get("keywords"), list) and len(meta["keywords"]) == 3,
          f"got {meta.get('keywords')!r}")
    check("schema_type is NewsArticle", meta.get("schema_type") == "NewsArticle",
          f"got {meta.get('schema_type')!r}")
    check("articleSection in extra", meta.get("extra", {}).get("articleSection") == "Technology",
          f"got {meta.get('extra')!r}")

    page = chunk_html("https://sketchynews.snaf.foo/ai-revolution", ARTICLE_HTML_DOUBLE_QUOTE)
    check("chunk_html title from JSON-LD",
          page.title == "The AI Revolution Is Here and It's Weirder Than You Think",
          f"got {page.title!r}")
    check("chunk_html author", page.author == "Jane Doe", f"got {page.author!r}")

    # ── Test 3: OpenGraph only (no JSON-LD) ───────────────────────────
    print("\n[Test 3] OpenGraph tags only (no JSON-LD)")
    meta = extract_metadata(OPENGRAPH_ONLY_HTML, "https://example.com/og-page")
    check("title from og:title", meta.get("title") == "The Real OG Title", f"got {meta.get('title')!r}")
    check("description from og:description",
          meta.get("description") == "This page only has OpenGraph tags.",
          f"got {meta.get('description')!r}")
    check("image", meta.get("image") == "https://example.com/image.jpg", f"got {meta.get('image')!r}")
    check("author from article:author", meta.get("author") == "OG Author", f"got {meta.get('author')!r}")
    check("published from article:published_time",
          meta.get("published") == "2024-12-01T10:00:00Z",
          f"got {meta.get('published')!r}")
    check("keywords from article:tag",
          meta.get("keywords") == ["test", "opengraph"],
          f"got {meta.get('keywords')!r}")
    check("schema_type is None (no JSON-LD)", meta.get("schema_type") is None,
          f"got {meta.get('schema_type')!r}")

    page = chunk_html("https://example.com/og-page", OPENGRAPH_ONLY_HTML)
    check("chunk_html uses OG title", page.title == "The Real OG Title", f"got {page.title!r}")

    # ── Test 4: No metadata at all (pure HTML) ────────────────────────
    print("\n[Test 4] Plain HTML (no JSON-LD, no OpenGraph)")
    meta = extract_metadata(PLAIN_HTML, "https://example.com/plain")
    check("title from h1", meta.get("title") == "Welcome to the Plain Page", f"got {meta.get('title')!r}")
    check("description from meta", meta.get("description") == "A simple page with no structured metadata.",
          f"got {meta.get('description')!r}")
    check("author from meta", meta.get("author") == "Plain Author", f"got {meta.get('author')!r}")
    check("type is page", meta.get("type") == "page", f"got {meta.get('type')!r}")
    check("keywords is empty list", meta.get("keywords") == [], f"got {meta.get('keywords')!r}")

    page = chunk_html("https://example.com/plain", PLAIN_HTML)
    check("chunk_html backward compat — has chunks", len(page.chunks) > 0, f"got {len(page.chunks)} chunks")
    check("chunk_html backward compat — title", page.title == "Welcome to the Plain Page",
          f"got {page.title!r}")
    check("chunk_html backward compat — author", page.author == "Plain Author", f"got {page.author!r}")

    # ── Test 5: parse_iso_duration ────────────────────────────────────
    print("\n[Test 5] parse_iso_duration()")
    check("PT25M → '25 min'", parse_iso_duration("PT25M") == "25 min",
          f"got {parse_iso_duration('PT25M')!r}")
    check("PT1H30M → '1h 30 min'", parse_iso_duration("PT1H30M") == "1h 30 min",
          f"got {parse_iso_duration('PT1H30M')!r}")
    check("P1DT2H → '1d 2h'", parse_iso_duration("P1DT2H") == "1d 2h",
          f"got {parse_iso_duration('P1DT2H')!r}")
    check("PT1H → '1h'", parse_iso_duration("PT1H") == "1h",
          f"got {parse_iso_duration('PT1H')!r}")
    check("PT45S → '45s'", parse_iso_duration("PT45S") == "45s",
          f"got {parse_iso_duration('PT45S')!r}")
    check("PT1H5M → '1h 5 min'", parse_iso_duration("PT1H5M") == "1h 5 min",
          f"got {parse_iso_duration('PT1H5M')!r}")
    check("empty → ''", parse_iso_duration("") == "",
          f"got {parse_iso_duration('')!r}")

    return passed, failed


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    passed, failed = _run_tests()
    total = passed + failed
    print(f"\n{'='*60}")
    print(f"Results: {passed}/{total} passed, {failed} failed")
    print(f"{'='*60}")
    sys.exit(0 if failed == 0 else 1)

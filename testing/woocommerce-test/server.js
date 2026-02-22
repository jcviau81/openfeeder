/**
 * OpenFeeder WooCommerce Mock Test Server
 *
 * Simulates the OpenFeeder WooCommerce adapter endpoints for validation.
 * Serves /openfeeder/products and /.well-known/openfeeder.json with mock data.
 *
 * Usage:
 *   npm install && node server.js
 *   # Then validate:
 *   cd ../../validator && .venv/bin/python validator.py http://localhost:3005
 */

const express = require('express');
const app = express();
const PORT = 3005;

// ── Mock product data ──────────────────────────────────────────────────────────

const MOCK_PRODUCTS = [
  {
    url: '/product/alpine-waterproof-jacket',
    title: 'Alpine Waterproof Jacket',
    sku: 'AWJ-001',
    price: '89.99',
    regular_price: '129.99',
    sale_price: '89.99',
    on_sale: true,
    availability: 'in_stock',
    stock_quantity: 24,
    categories: ['Jackets', 'Men', 'Outdoor'],
    tags: ['waterproof', 'windproof', 'hiking', 'outdoor'],
    summary: 'Lightweight 3-layer waterproof jacket with taped seams, perfect for mountain hikes and rainy commutes.',
    chunks: [
      {
        id: 'AWJ-001_0',
        text: 'The Alpine Waterproof Jacket is built for serious outdoor adventures. Its 3-layer construction combines a durable face fabric, waterproof-breathable membrane, and a soft inner lining for all-day comfort.\n\nFully taped seams prevent water ingress even in heavy rain. The helmet-compatible hood adjusts in three points for a secure fit. Two hand pockets and one chest pocket with waterproof zippers provide ample storage.',
        type: 'paragraph',
        relevance: null,
      },
      {
        id: 'AWJ-001_1',
        text: 'Available in sizes S through XXL. Machine washable at 30°C. Do not tumble dry. Suitable for hiking, trail running, skiing, and daily urban use.',
        type: 'paragraph',
        relevance: null,
      },
    ],
    variants: [
      { sku: 'AWJ-001-S-BLU', attributes: { size: 'S', color: 'Navy Blue' }, price: '89.99', availability: 'in_stock' },
      { sku: 'AWJ-001-M-BLU', attributes: { size: 'M', color: 'Navy Blue' }, price: '89.99', availability: 'in_stock' },
      { sku: 'AWJ-001-L-BLU', attributes: { size: 'L', color: 'Navy Blue' }, price: '89.99', availability: 'in_stock' },
      { sku: 'AWJ-001-XL-BLU', attributes: { size: 'XL', color: 'Navy Blue' }, price: '89.99', availability: 'out_of_stock' },
      { sku: 'AWJ-001-M-RED', attributes: { size: 'M', color: 'Crimson Red' }, price: '89.99', availability: 'in_stock' },
    ],
    images: ['/wp-content/uploads/alpine-jacket-front.jpg', '/wp-content/uploads/alpine-jacket-back.jpg'],
  },
  {
    url: '/product/merino-wool-sweater',
    title: 'Merino Wool Crew Neck Sweater',
    sku: 'MWS-042',
    price: '119.00',
    regular_price: '119.00',
    sale_price: null,
    on_sale: false,
    availability: 'in_stock',
    stock_quantity: 15,
    categories: ['Sweaters', 'Women', 'Knitwear'],
    tags: ['merino', 'wool', 'sustainable', 'warm'],
    summary: 'Premium 100% merino wool crew neck sweater — naturally temperature-regulating, odour-resistant, and machine washable.',
    chunks: [
      {
        id: 'MWS-042_0',
        text: 'Crafted from 100% New Zealand merino wool, this sweater delivers exceptional softness and performance. Merino fibres are finer than human hair, making this sweater itch-free even for sensitive skin.\n\nNaturally temperature-regulating: warm in cold weather, cool when it\'s mild. Merino wool also has natural odour-resistant properties, keeping you fresh through long days.',
        type: 'paragraph',
        relevance: null,
      },
    ],
    variants: [
      { sku: 'MWS-042-XS-IVO', attributes: { size: 'XS', color: 'Ivory' }, price: '119.00', availability: 'in_stock' },
      { sku: 'MWS-042-S-IVO', attributes: { size: 'S', color: 'Ivory' }, price: '119.00', availability: 'in_stock' },
      { sku: 'MWS-042-M-CHA', attributes: { size: 'M', color: 'Charcoal' }, price: '119.00', availability: 'in_stock' },
      { sku: 'MWS-042-L-CHA', attributes: { size: 'L', color: 'Charcoal' }, price: '119.00', availability: 'out_of_stock' },
    ],
    images: ['/wp-content/uploads/merino-sweater-ivory.jpg'],
  },
  {
    url: '/product/noise-cancelling-headphones',
    title: 'ProSound ANC Headphones',
    sku: 'PSH-990',
    price: '249.00',
    regular_price: '329.00',
    sale_price: '249.00',
    on_sale: true,
    availability: 'in_stock',
    stock_quantity: 7,
    categories: ['Electronics', 'Audio', 'Headphones'],
    tags: ['noise-cancelling', 'wireless', 'bluetooth', 'premium'],
    summary: 'Over-ear wireless headphones with 40dB active noise cancellation, 30-hour battery, and premium sound tuned by acoustic engineers.',
    chunks: [
      {
        id: 'PSH-990_0',
        text: 'ProSound ANC Headphones deliver industry-leading 40dB active noise cancellation — enough to silence a busy office, airplane cabin, or city street. Three ANC modes let you adjust the level of isolation to your environment.\n\nHigh-resolution audio certified drivers reproduce the full range from deep bass to crisp highs. Custom EQ via the ProSound app (iOS and Android).',
        type: 'paragraph',
        relevance: null,
      },
      {
        id: 'PSH-990_1',
        text: 'Battery life: 30 hours with ANC on, 45 hours with ANC off. Fast charge: 10 minutes for 3 hours of playback. USB-C charging. Folds flat for travel. Includes premium carrying case and 3.5mm cable for wired use.',
        type: 'paragraph',
        relevance: null,
      },
    ],
    variants: [],
    images: ['/wp-content/uploads/prosound-headphones-black.jpg', '/wp-content/uploads/prosound-headphones-white.jpg'],
  },
  {
    url: '/product/yoga-mat-eco',
    title: 'EcoGrip Natural Rubber Yoga Mat',
    sku: 'YM-ECO-5',
    price: '68.00',
    regular_price: '68.00',
    sale_price: null,
    on_sale: false,
    availability: 'in_stock',
    stock_quantity: 42,
    categories: ['Sports', 'Yoga', 'Fitness'],
    tags: ['yoga', 'eco-friendly', 'natural-rubber', 'non-slip'],
    summary: 'Professional-grade yoga mat made from natural rubber with microfibre top surface — exceptional grip wet or dry, 4mm thick for joint support.',
    chunks: [
      {
        id: 'YM-ECO-5_0',
        text: 'The EcoGrip mat combines a natural rubber base with a microfibre top layer that gets grippier as you sweat — no more sliding in downward dog. At 4mm thickness it provides enough cushioning for joints without sacrificing ground feel.\n\nFree from PVC, phthalates, and heavy metals. The natural rubber is sustainably harvested. Dimensions: 183cm × 61cm.',
        type: 'paragraph',
        relevance: null,
      },
    ],
    variants: [
      { sku: 'YM-ECO-5-GRN', attributes: { color: 'Forest Green' }, price: '68.00', availability: 'in_stock' },
      { sku: 'YM-ECO-5-PUR', attributes: { color: 'Deep Purple' }, price: '68.00', availability: 'in_stock' },
      { sku: 'YM-ECO-5-GRY', attributes: { color: 'Slate Grey' }, price: '68.00', availability: 'in_stock' },
    ],
    images: ['/wp-content/uploads/ecogrip-mat.jpg'],
  },
  {
    url: '/product/stainless-water-bottle',
    title: 'HydroKeep 32oz Insulated Water Bottle',
    sku: 'HK-32-SS',
    price: '34.99',
    regular_price: '34.99',
    sale_price: null,
    on_sale: false,
    availability: 'in_stock',
    stock_quantity: 63,
    categories: ['Accessories', 'Kitchen', 'Outdoor'],
    tags: ['insulated', 'stainless-steel', 'bpa-free', 'leak-proof'],
    summary: 'Double-wall vacuum insulated 32oz stainless steel bottle — keeps drinks cold 24 hours, hot 12 hours. Leak-proof lid, BPA-free.',
    chunks: [
      {
        id: 'HK-32-SS_0',
        text: 'HydroKeep\'s double-wall vacuum insulation keeps your water ice-cold for 24 hours and coffee hot for 12. Made from premium 18/8 food-grade stainless steel with a powder-coated exterior that resists sweat and slipping.\n\nThe twist-and-lock lid is fully leak-proof — toss it in your bag without worry. Wide mouth fits ice cubes and is compatible with most filters. Fits most car cup holders.',
        type: 'paragraph',
        relevance: null,
      },
    ],
    variants: [
      { sku: 'HK-32-SS-BLK', attributes: { color: 'Midnight Black' }, price: '34.99', availability: 'in_stock' },
      { sku: 'HK-32-SS-WHT', attributes: { color: 'Arctic White' }, price: '34.99', availability: 'in_stock' },
      { sku: 'HK-32-SS-TRQ', attributes: { color: 'Turquoise' }, price: '34.99', availability: 'out_of_stock' },
    ],
    images: ['/wp-content/uploads/hydrokeep-bottle.jpg'],
  },
  {
    url: '/product/mechanical-keyboard',
    title: 'TactileType Pro Mechanical Keyboard',
    sku: 'TTK-PRO-75',
    price: '159.00',
    regular_price: '189.00',
    sale_price: '159.00',
    on_sale: true,
    availability: 'on_backorder',
    stock_quantity: 0,
    categories: ['Electronics', 'Computer Accessories', 'Keyboards'],
    tags: ['mechanical', 'keyboard', 'rgb', 'gaming', 'typing'],
    summary: 'Compact 75% layout mechanical keyboard with hot-swappable switches, per-key RGB, and CNC aluminium case — the enthusiast\'s daily driver.',
    chunks: [
      {
        id: 'TTK-PRO-75_0',
        text: 'The TactileType Pro delivers the typing experience keyboard enthusiasts demand. The CNC-machined aluminium case reduces vibration and provides a premium heft. Hot-swappable switch sockets let you change switches in seconds without soldering.\n\nPer-key RGB with 16.8 million colours. NKRO (N-key rollover) ensures every keystroke registers even during fast typing or gaming.',
        type: 'paragraph',
        relevance: null,
      },
    ],
    variants: [
      { sku: 'TTK-PRO-75-BRN', attributes: { switches: 'Tactile Brown' }, price: '159.00', availability: 'on_backorder' },
      { sku: 'TTK-PRO-75-RED', attributes: { switches: 'Linear Red' }, price: '159.00', availability: 'on_backorder' },
      { sku: 'TTK-PRO-75-BLU', attributes: { switches: 'Clicky Blue' }, price: '159.00', availability: 'out_of_stock' },
    ],
    images: ['/wp-content/uploads/tactiletype-keyboard.jpg'],
  },
];

// ── Helper: apply filters ──────────────────────────────────────────────────────

function applyFilters(products, query) {
  let filtered = [...products];

  if (query.sku) {
    const sku = query.sku.toLowerCase();
    filtered = filtered.filter(p =>
      p.sku.toLowerCase() === sku ||
      p.variants.some(v => v.sku.toLowerCase() === sku)
    );
  }

  if (query.category) {
    const cat = query.category.toLowerCase();
    filtered = filtered.filter(p =>
      p.categories.some(c => c.toLowerCase().includes(cat))
    );
  }

  if (query.q) {
    const q = query.q.toLowerCase();
    filtered = filtered.filter(p =>
      p.title.toLowerCase().includes(q) ||
      p.summary.toLowerCase().includes(q) ||
      p.tags.some(t => t.toLowerCase().includes(q)) ||
      p.categories.some(c => c.toLowerCase().includes(q))
    );
  }

  if (query.min_price) {
    const min = parseFloat(query.min_price);
    filtered = filtered.filter(p => parseFloat(p.price) >= min);
  }

  if (query.max_price) {
    const max = parseFloat(query.max_price);
    filtered = filtered.filter(p => parseFloat(p.price) <= max);
  }

  if (query.in_stock === 'true' || query.in_stock === '1') {
    filtered = filtered.filter(p => p.availability === 'in_stock');
  }

  if (query.on_sale === 'true' || query.on_sale === '1') {
    filtered = filtered.filter(p => p.on_sale === true);
  }

  return filtered;
}

// ── Standard OpenFeeder headers ────────────────────────────────────────────────

function setOpenFeederHeaders(res) {
  res.set('Content-Type', 'application/json; charset=utf-8');
  res.set('X-OpenFeeder', '1.0');
  res.set('X-OpenFeeder-Extension', 'ecommerce/1.0');
  res.set('Access-Control-Allow-Origin', '*');
}

// ── Routes ─────────────────────────────────────────────────────────────────────

// Discovery document (base OpenFeeder — passes standard validator)
app.get('/.well-known/openfeeder.json', (req, res) => {
  setOpenFeederHeaders(res);
  res.json({
    version: '1.0',
    site: {
      name: 'OpenFeeder WooCommerce Mock Store',
      url: `http://localhost:${PORT}/`,
      language: 'en',
      description: 'A mock WooCommerce store for testing the OpenFeeder ecommerce adapter.',
    },
    feed: {
      endpoint: '/openfeeder',
      type: 'paginated',
    },
    capabilities: ['search', 'products'],
    ecommerce: {
      products_endpoint: '/openfeeder/products',
      currencies: ['USD'],
      supports_variants: true,
      supports_availability: true,
    },
    contact: 'test@example.com',
  });
});

// Base content endpoint (required by standard validator)
app.get('/openfeeder', (req, res) => {
  setOpenFeederHeaders(res);

  if (req.query.url) {
    const chunks = [
      {
        id: 'mock_0',
        text: 'This is a mock article used for OpenFeeder validator testing. The real content comes from the WooCommerce products endpoint.',
        type: 'paragraph',
        relevance: null,
      },
    ];
    res.json({
      schema: 'openfeeder/1.0',
      type: 'content',
      url: req.query.url,
      title: 'Mock Article',
      author: 'Mock Author',
      published: '2025-01-01T00:00:00Z',
      updated: '2025-01-01T00:00:00Z',
      summary: 'This is a mock article for OpenFeeder validation.',
      chunks,
      meta: {
        total_chunks: chunks.length,
        cached: false,
      },
    });
  } else {
    res.json({
      schema: 'openfeeder/1.0',
      type: 'index',
      page: 1,
      total_pages: 1,
      items: [
        {
          url: '/mock-article',
          title: 'Mock Article',
          published: '2025-01-01T00:00:00Z',
          summary: 'A mock article for validation purposes.',
        },
      ],
    });
  }
});

// Products endpoint
app.get('/openfeeder/products', (req, res) => {
  setOpenFeederHeaders(res);

  // Single product lookup
  if (req.query.url || req.query.sku) {
    let product = null;

    if (req.query.url) {
      product = MOCK_PRODUCTS.find(p => p.url === req.query.url);
    } else if (req.query.sku) {
      product = MOCK_PRODUCTS.find(p =>
        p.sku === req.query.sku ||
        p.variants.some(v => v.sku === req.query.sku)
      );
    }

    if (!product) {
      return res.status(404).json({
        schema: 'openfeeder/1.0+ecommerce',
        error: { code: 'NOT_FOUND', message: 'Product not found.' },
      });
    }

    return res.json({
      schema: 'openfeeder/1.0+ecommerce',
      type: 'product',
      currency: 'USD',
      item: product,
    });
  }

  // Paginated / filtered list
  const page  = Math.max(1, parseInt(req.query.page  || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit || '10', 10)));

  const filtered   = applyFilters(MOCK_PRODUCTS, req.query);
  const total      = filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / limit));
  const start      = (page - 1) * limit;
  const items      = filtered.slice(start, start + limit);

  res.json({
    schema: 'openfeeder/1.0+ecommerce',
    type: 'products',
    page,
    total_pages: totalPages,
    total_items: total,
    currency: 'USD',
    items,
  });
});

// Ecommerce discovery doc
app.get('/.well-known/openfeeder-ecommerce.json', (req, res) => {
  setOpenFeederHeaders(res);
  res.json({
    version: '1.0',
    site: {
      name: 'OpenFeeder WooCommerce Mock Store',
      url: `http://localhost:${PORT}/`,
      language: 'en',
      description: 'A mock WooCommerce store for testing the OpenFeeder ecommerce adapter.',
    },
    feed: { endpoint: '/openfeeder', type: 'paginated' },
    capabilities: ['search', 'products'],
    ecommerce: {
      products_endpoint: '/openfeeder/products',
      currencies: ['USD'],
      supports_variants: true,
      supports_availability: true,
    },
    contact: 'test@example.com',
  });
});

// ── Start ──────────────────────────────────────────────────────────────────────

app.listen(PORT, () => {
  console.log(`\nOpenFeeder WooCommerce Mock Server running at http://localhost:${PORT}`);
  console.log('\nEndpoints:');
  console.log(`  Discovery:         http://localhost:${PORT}/.well-known/openfeeder.json`);
  console.log(`  Products:          http://localhost:${PORT}/openfeeder/products`);
  console.log(`  Single product:    http://localhost:${PORT}/openfeeder/products?sku=AWJ-001`);
  console.log(`  Filter by category: http://localhost:${PORT}/openfeeder/products?category=Electronics`);
  console.log(`  Sale items:        http://localhost:${PORT}/openfeeder/products?on_sale=true`);
  console.log('\nValidate:');
  console.log(`  cd ../../validator && .venv/bin/python validator.py http://localhost:${PORT}\n`);
});

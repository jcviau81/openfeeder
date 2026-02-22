'use strict';

const express = require('express');
const { openFeederMiddleware } = require('openfeeder-express');

// ── Sample posts database ────────────────────────────────────────────────────

const POSTS = [
  {
    url: '/posts/introduction-to-llm-content-delivery',
    title: 'Introduction to LLM Content Delivery',
    published: '2024-01-15T10:00:00Z',
    content: `
<p>Large Language Models (LLMs) have fundamentally changed the way we think about information retrieval and content consumption. Unlike traditional search engines that return links and snippets, LLMs can synthesize, summarize, and reason about content in ways that feel almost human. This shift creates new opportunities — and new challenges — for content publishers who want their material to be accessible to AI systems.</p>

<p>The OpenFeeder protocol was designed to address exactly this problem. By providing a standardized, machine-readable feed of your website's content, you make it easy for LLMs and other AI agents to discover, index, and understand your material without resorting to fragile HTML scraping or unreliable crawling heuristics.</p>

<p>At its core, OpenFeeder is simple: two HTTP endpoints. The first, the discovery document at <code>/.well-known/openfeeder.json</code>, tells clients where to find your content feed and some basic metadata about your site. The second, the <code>/openfeeder</code> endpoint, serves paginated content with rich metadata, search capabilities, and pre-chunked text that is ready for embedding or retrieval-augmented generation.</p>

<p>In this post, we will explore the motivation behind OpenFeeder, how it differs from existing formats like RSS or Atom, and why the chunked content model is particularly well-suited for LLM workflows.</p>

<p>One key insight behind OpenFeeder is that LLMs do not consume content the same way humans do. A human reader scans a page, picks out what is relevant, and moves on. An LLM often needs to process the entire text, or at minimum a well-chosen excerpt, to answer a question accurately. Providing pre-chunked content removes the burden of chunking from the AI system and ensures consistency across different consumers of the feed.</p>
    `.trim(),
  },
  {
    url: '/posts/building-express-middleware',
    title: 'Building Express.js Middleware from Scratch',
    published: '2024-02-08T09:30:00Z',
    content: `
<p>Express.js has been the backbone of Node.js web development for well over a decade. Its middleware model is deceptively simple: a function that receives a request, a response, and a <em>next</em> callback. Yet this simple primitive is powerful enough to build everything from authentication layers to full REST APIs.</p>

<p>When building a middleware package for distribution, there are a few principles worth keeping in mind. First, zero dependencies. Every dependency you add is a liability — a version conflict waiting to happen, a security vulnerability, a maintenance burden. If you can solve the problem with Node.js built-ins, do so. For OpenFeeder, everything we need is in the <code>crypto</code> module (for chunk IDs) and standard string operations.</p>

<p>Second, be a good citizen of the middleware chain. Always call <code>next()</code> when your middleware does not handle the request. An Express middleware that swallows requests it is not responsible for will cause mysterious bugs that are extremely hard to debug. In the OpenFeeder middleware, we check the request path and only intercept the two OpenFeeder-specific routes.</p>

<p>Third, handle errors gracefully. Throwing uncaught exceptions in a middleware will crash the request or, worse, the entire Node.js process. Use try/catch around async operations and send meaningful error responses with appropriate HTTP status codes. The OpenFeeder protocol defines a simple error format: a JSON object with a <code>code</code> and <code>message</code> field.</p>

<p>The Express adapter for OpenFeeder follows these principles closely. The main export is a factory function — <code>openFeederMiddleware(config)</code> — that validates its config at startup and returns a standard Express middleware function. This pattern gives consumers clear error messages at initialization time rather than mysterious failures at runtime.</p>

<p>CommonJS and ESM compatibility is achieved simply by using <code>module.exports</code> and adding an <code>exports</code> field to <code>package.json</code>. Modern bundlers and Node.js will use the exports map; legacy <code>require()</code> callers fall back to <code>main</code>.</p>
    `.trim(),
  },
  {
    url: '/posts/chunking-strategies-for-rag',
    title: 'Chunking Strategies for Retrieval-Augmented Generation',
    published: '2024-03-20T14:00:00Z',
    content: `
<p>Retrieval-Augmented Generation (RAG) is a technique that combines the broad knowledge of a pre-trained language model with the precision of a retrieval system. Instead of relying solely on what the model learned during training, RAG systems retrieve relevant documents or passages at inference time and include them in the context window. The quality of retrieval — and therefore the quality of the final answer — depends heavily on how documents are chunked.</p>

<p>The simplest chunking strategy is fixed-size chunking: split the text every N tokens or characters, regardless of content structure. This is easy to implement and works reasonably well, but it has a significant flaw: it can split sentences or even words across chunk boundaries, producing chunks that lack sufficient context to be meaningful on their own.</p>

<p>Paragraph-based chunking, the approach used by OpenFeeder, is a substantial improvement. HTML documents are naturally structured around paragraphs, headings, and lists. These boundaries tend to correspond to semantic units of meaning. A paragraph about one topic will generally not run into the middle of a paragraph about a different topic. By chunking at paragraph boundaries, we preserve the coherence of each piece of text.</p>

<p>The OpenFeeder chunker extends this with a size limit: if accumulating paragraphs into a single chunk would exceed approximately 500 words, a new chunk is started. This balances two competing concerns. Chunks that are too small lack context; chunks that are too large may contain too much irrelevant information for a retrieval system to rank them highly against a specific query.</p>

<p>Each chunk is assigned a deterministic ID based on an MD5 hash of the item URL, combined with its index within the item. This means chunk IDs are stable across re-fetches of the same content, which can be useful for caching and incremental indexing workflows.</p>

<p>Type detection — classifying chunks as paragraphs, headings, lists, or code — is done with simple heuristics. A single short line is likely a heading. A set of lines where more than half begin with bullet or number patterns is likely a list. This metadata can help retrieval systems apply different weighting strategies to different content types.</p>
    `.trim(),
  },
  {
    url: '/posts/open-standards-for-ai',
    title: 'Open Standards and the Future of AI-Readable Web',
    published: '2024-04-05T11:00:00Z',
    content: `
<p>The history of the web is a history of standards. HTML gave us a common language for documents. HTTP gave us a common protocol for transferring them. RSS gave blogs and news sites a common format for syndication. Each of these standards, in its time, unlocked an ecosystem of tools, services, and workflows that would not have been possible if every site had done things differently.</p>

<p>We are at a similar inflection point today. LLMs are increasingly being used to read, summarize, and reason about web content. But there is no standard for making content LLM-friendly. Each AI system that crawls the web has to deal with the full complexity of HTML: navigation menus, cookie banners, ads, and all the other cruft that surrounds the actual content of a page. This is wasteful and error-prone.</p>

<p>OpenFeeder is a proposal for a minimal standard that can co-exist with existing web infrastructure. It does not require sites to change their HTML or their CMS. It adds two endpoints that return clean, structured JSON. AI systems that speak OpenFeeder can consume content efficiently and accurately. Humans using browsers see nothing different.</p>

<p>The comparison to robots.txt is instructive. robots.txt is a trivially simple file — a few lines of text telling crawlers what they can and cannot access. Yet it became a universal standard adopted by virtually every website, because it solved a real problem for both site owners and crawlers. OpenFeeder aspires to the same role: a lightweight convention that solves the real problem of AI-accessible content.</p>
    `.trim(),
  },
];

// ── Middleware setup ─────────────────────────────────────────────────────────

const app = express();

app.use(openFeederMiddleware({
  siteName: 'OpenFeeder Express Test Blog',
  siteUrl: 'http://localhost:3002',
  llmGateway: true,
  language: 'en',
  siteDescription: 'A test blog demonstrating the OpenFeeder Express.js adapter.',

  getItems: async (page, limit) => {
    const total = POSTS.length;
    const start = (page - 1) * limit;
    const items = POSTS.slice(start, start + limit);
    return { items, total };
  },

  getItem: async (url) => {
    const post = POSTS.find((p) => p.url === url);
    return post || null;
  },
}));

// ── Default route ─────────────────────────────────────────────────────────

app.get('/', (req, res) => {
  res.json({
    message: 'OpenFeeder Express Test Server',
    endpoints: [
      'GET /.well-known/openfeeder.json',
      'GET /openfeeder',
      'GET /openfeeder?url=/posts/introduction-to-llm-content-delivery',
      'GET /openfeeder?q=chunking',
    ],
  });
});

// ── Start ─────────────────────────────────────────────────────────────────

const PORT = 3002;
app.listen(PORT, () => {
  console.log(`OpenFeeder Express test server running on http://localhost:${PORT}`);
  console.log(`  Discovery: http://localhost:${PORT}/.well-known/openfeeder.json`);
  console.log(`  Feed:      http://localhost:${PORT}/openfeeder`);
});

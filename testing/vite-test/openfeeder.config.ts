import type { OpenFeederPluginConfig } from "./lib/openfeeder/src/types";

const config: OpenFeederPluginConfig = {
  siteName: "OpenFeeder Vite Test",
  siteUrl: "http://localhost:5174",
  siteDescription: "Test site for the OpenFeeder Vite adapter",
  language: "en",

  content: [
    {
      url: "/hello-world",
      title: "Hello World",
      published: "2024-01-15T10:00:00Z",
      content: `
        <p>Welcome to the OpenFeeder Vite test site!</p>
        <p>This is the first paragraph of the hello world post. OpenFeeder exposes
        your Vite site's content in a structured, paginated JSON format that
        large language models can consume efficiently and reliably.</p>
        <p>The Vite plugin works both in dev mode (as dev server middleware) and
        at build time (generating static JSON files in your output directory).</p>
      `,
    },
    {
      url: "/about",
      title: "About This Test Site",
      published: "2024-01-10T08:00:00Z",
      content: `
        <h2>About</h2>
        <p>This is a minimal Vite test app used to validate the OpenFeeder
        Vite adapter against the official OpenFeeder validator.</p>
        <p>The two endpoints exposed are:</p>
        <ul>
          <li>GET /.well-known/openfeeder.json — discovery document</li>
          <li>GET /openfeeder — paginated content feed with chunking support</li>
        </ul>
      `,
    },
    {
      url: "/getting-started",
      title: "Getting Started with OpenFeeder",
      published: "2024-02-01T12:00:00Z",
      content: `
        <p>Getting started with the OpenFeeder Vite plugin is easy.
        Add the plugin to your vite.config.ts, provide your content,
        and you're done.</p>
        <p>In dev mode, endpoints are served live by the Vite dev server.
        At build time, static JSON files are generated in your dist/ directory.</p>
        <p>The plugin handles content chunking, pagination, CORS headers, and the
        discovery document automatically.</p>
      `,
    },
  ],
};

export default config;

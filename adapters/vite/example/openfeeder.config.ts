/**
 * OpenFeeder content config for the example Vite project.
 *
 * In a real project you would fetch content from an API, filesystem, CMS, etc.
 */

import type { OpenFeederPluginConfig } from "../src/types.js";

const config: OpenFeederPluginConfig = {
  siteName: "My Vite Site",
  siteUrl: "http://localhost:5174",
  siteDescription: "An example Vite site powered by OpenFeeder",
  language: "en",

  content: [
    {
      url: "/hello-world",
      title: "Hello World",
      published: "2024-01-15T10:00:00Z",
      content: `
        <p>Welcome to my Vite site powered by OpenFeeder!</p>
        <p>This is the first paragraph of the hello world post. OpenFeeder
        makes it easy for LLM-powered tools to consume your site's content
        in a structured, paginated JSON format.</p>
        <p>The Vite plugin works both in dev mode (as a middleware) and at
        build time (generating static JSON files).</p>
      `,
    },
    {
      url: "/about",
      title: "About This Site",
      published: "2024-01-10T08:00:00Z",
      content: `
        <h2>About</h2>
        <p>This is an example Vite site using the OpenFeeder adapter.</p>
        <p>The adapter exposes two endpoints:</p>
        <ul>
          <li>/.well-known/openfeeder.json — discovery document</li>
          <li>/openfeeder — paginated content feed</li>
        </ul>
        <p>Both endpoints follow the OpenFeeder 1.0 specification.</p>
      `,
    },
    {
      url: "/getting-started",
      title: "Getting Started with OpenFeeder",
      published: "2024-02-01T12:00:00Z",
      content: `
        <p>Getting started with the OpenFeeder Vite plugin is easy.</p>
        <p>Add the plugin to your vite.config.ts, provide your content,
        and you're done. The plugin handles chunking, pagination, CORS
        headers, and the discovery document automatically.</p>
        <p>In development, endpoints are served live by the Vite dev server.
        At build time, static JSON files are generated for deployment.</p>
      `,
    },
  ],
};

export default config;

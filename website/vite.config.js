import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { downloadBase, repoUrl, siteUrl } from '../scripts/project.mjs';

const here = (file) => fileURLToPath(new URL(file, import.meta.url));

const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

function siteMetadata() {
  return {
    name: 'site-metadata',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        const filled = html
          .replaceAll('%SITE_URL%', siteUrl)
          .replaceAll('%REPO_URL%', repoUrl)
          .replaceAll('%RELEASE_URL%', downloadBase);
        // The dev server injects inline styles, so the policy is only for production builds.
        if (context.server) return filled;
        return filled.replace(
          '<meta charset="utf-8">',
          `<meta charset="utf-8">\n    <meta http-equiv="Content-Security-Policy" content="${CSP}">`,
        );
      },
    },
    generateBundle() {
      const pages = [siteUrl, `${siteUrl}privacy.html`].map((url) => `  <url><loc>${url}</loc></url>`).join('\n');
      this.emitFile({
        type: 'asset',
        fileName: 'sitemap.xml',
        source: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages}\n</urlset>\n`,
      });
      this.emitFile({
        type: 'asset',
        fileName: 'robots.txt',
        source: `User-agent: *\nAllow: /\n\nSitemap: ${siteUrl}sitemap.xml\n`,
      });
    },
  };
}

export default defineConfig({
  root: here('.'),
  base: './', // works both in /<repository>/ on GitHub Pages and at the root of other hosts
  plugins: [siteMetadata()],
  server: { fs: { allow: [here('..')] } },
  build: {
    target: 'es2022',
    modulePreload: { polyfill: false },
    emptyOutDir: true,
    rolldownOptions: { input: { main: here('index.html'), privacy: here('privacy.html') } },
  },
});

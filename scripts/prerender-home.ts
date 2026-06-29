/**
 * Post-build step (npm `postbuild`): inject the static homepage summary into the
 * built dist/index.html from dist/feed.json. Runs after `vite build` copies
 * public/ → dist/, before the Pages artifact is uploaded. Fails soft so a
 * missing feed/index never breaks a build.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Feed } from '../src/lib/types';
import { injectHomeSummary } from './lib/prerender';

export function prerenderHome(distDir = 'dist'): boolean {
  const indexPath = join(distDir, 'index.html');
  const feedPath = join(distDir, 'feed.json');
  let html: string;
  let feed: Feed;
  try {
    html = readFileSync(indexPath, 'utf8');
    feed = JSON.parse(readFileSync(feedPath, 'utf8')) as Feed;
  } catch {
    console.warn(`prerender: ${indexPath} or ${feedPath} not found — skipped`);
    return false;
  }
  const briefed = feed.markets.filter((m) => m.generatedAt).length;
  writeFileSync(indexPath, injectHomeSummary(html, feed));
  console.log(`prerender: injected homepage summary (${briefed} briefed stories available)`);
  return true;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  prerenderHome();
}

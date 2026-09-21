import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { renderDemoSvg, sanitize, type Frame } from './demo.ts';

const frames: Frame[] = [
  { command: 'clip registry search git', output: 'git\tInspect <changes> & history' },
  { command: 'clip sync', output: 'clip-git' },
];

test('renders each command and escapes terminal output as XML', () => {
  const svg = renderDemoSvg(frames);
  assert.match(svg, /^<svg [^>]*xmlns="http:\/\/www.w3.org\/2000\/svg"/);
  assert.match(svg, /clip registry search git/);
  assert.match(svg, /Inspect &lt;changes&gt; &amp; history/);
  assert.doesNotMatch(svg, /\t/);
});

test('shows frames one after another on a loop', () => {
  const svg = renderDemoSvg(frames);
  assert.equal(svg.match(/class="frame"/g)?.length, 2);
  assert.match(svg, /animation: frame-1 [\d.]+s infinite/);
  assert.match(svg, /@keyframes frame-1 \{ 0%, [\d.]+% \{ opacity: 1 \}/);
  assert.match(svg, /@keyframes frame-2 \{ 0%, [\d.]+% \{ opacity: 0 \}/);
});

test('truncates long output with an ellipsis line', () => {
  const svg = renderDemoSvg([{ command: 'clip list', output: 'a\nb\nc\nd', maxLines: 2 }]);
  assert.match(svg, />a</);
  assert.match(svg, />b</);
  assert.doesNotMatch(svg, />c</);
  assert.match(svg, />…</);
});

test('sanitize replaces machine-specific paths', () => {
  assert.equal(sanitize('Skills: /tmp/x/.agents at /opt/homebrew/bin/git', { '/tmp/x': '~/app', '/opt/homebrew/bin/git': '/usr/bin/git' }),
    'Skills: ~/app/.agents at /usr/bin/git');
});

test('the README embeds the committed demo', () => {
  const readme = readFileSync(new URL('../README.md', import.meta.url), 'utf8');
  assert.match(readme, /!\[[^\]]+\]\(docs\/demo\.svg\)/);
  assert.ok(existsSync(new URL('../docs/demo.svg', import.meta.url)));
});

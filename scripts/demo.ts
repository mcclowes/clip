// Records a real CLIP session in a throwaway project and renders it as an animated SVG for the README.
// Run with `npm run demo` after changing CLI output.
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export type Frame = { command: string; output: string; maxLines?: number };

const FONT_SIZE = 14;
const CHAR_WIDTH = FONT_SIZE * 0.6;
const LINE_HEIGHT = 20;
const PADDING = 20;
const TITLE_BAR = 32;
const MIN_COLUMNS = 72;
const MAX_COLUMNS = 96;
const SECONDS_PER_CHAR = 0.04;
const HOLD_SECONDS = 2.5;
const SECONDS_PER_LINE = 0.12;

export function sanitize(text: string, replacements: Record<string, string>): string {
  return Object.entries(replacements).reduce((result, [from, to]) => result.split(from).join(to), text);
}

const escapeXml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const percent = (value: number) => `${Number(value.toFixed(2))}%`;
const expandTabs = (line: string) => line.split('\t').reduce((out, cell) => out + ' '.repeat(8 - (out.length % 8)) + cell);

function outputLines(frame: Frame): string[] {
  if (!frame.output) return [];
  const lines = frame.output.replace(/\n+$/, '').split('\n').map(expandTabs);
  if (frame.maxLines === undefined || lines.length <= frame.maxLines) return lines;
  return [...lines.slice(0, frame.maxLines), '…'];
}

function fit(line: string, columns: number): string {
  return line.length > columns ? `${line.slice(0, columns - 1)}…` : line;
}

export function renderDemoSvg(frames: Frame[]): string {
  const screens = frames.map(frame => ({ command: frame.command, lines: outputLines(frame) }));
  const longest = Math.max(...screens.flatMap(s => [s.command.length + 2, ...s.lines.map(l => l.length)]));
  const columns = Math.min(MAX_COLUMNS, Math.max(MIN_COLUMNS, longest));
  const rows = Math.max(...screens.map(s => s.lines.length + 1));
  const width = Math.ceil(columns * CHAR_WIDTH + PADDING * 2);
  const height = TITLE_BAR + rows * LINE_HEIGHT + PADDING * 2;

  const timings = screens.map(s => {
    const typing = s.command.length * SECONDS_PER_CHAR;
    return { typing, total: typing + HOLD_SECONDS + s.lines.length * SECONDS_PER_LINE };
  });
  const duration = timings.reduce((sum, t) => sum + t.total, 0);

  let elapsed = 0;
  const styles: string[] = [];
  const groups = screens.map((screen, index) => {
    const n = index + 1;
    const start = (elapsed / duration) * 100;
    const typed = ((elapsed + timings[index].typing) / duration) * 100;
    elapsed += timings[index].total;
    const end = (elapsed / duration) * 100;
    const commandWidth = Math.ceil(screen.command.length * CHAR_WIDTH);

    const visible = [
      start > 0 ? `0%, ${percent(start - 0.01)} { opacity: 0 }` : '',
      `${start > 0 ? `${percent(start)}, ` : '0%, '}${percent(end - 0.01)} { opacity: 1 }`,
      end < 100 ? `${percent(end)}, 100% { opacity: 0 }` : '',
    ].filter(Boolean).join(' ');
    styles.push(
      `#frame-${n} { animation: frame-${n} ${duration.toFixed(2)}s infinite }`,
      `@keyframes frame-${n} { ${visible} }`,
      `#type-${n} { animation: type-${n} ${duration.toFixed(2)}s infinite }`,
      `@keyframes type-${n} { 0%, ${percent(start)} { transform: translateX(0); animation-timing-function: steps(${screen.command.length}, end) } ${percent(typed)}, 100% { transform: translateX(${commandWidth}px) } }`,
      `#output-${n} { animation: output-${n} ${duration.toFixed(2)}s infinite }`,
      `@keyframes output-${n} { 0%, ${percent(typed)} { opacity: 0 } ${percent(typed + 0.01)}, 100% { opacity: 1 } }`,
    );

    const top = TITLE_BAR + PADDING;
    const commandX = PADDING + 2 * CHAR_WIDTH;
    const lines = screen.lines.map((line, i) =>
      `<text x="${PADDING}" y="${top + (i + 2) * LINE_HEIGHT - 6}">${escapeXml(fit(line, columns))}</text>`).join('');
    return `<g class="frame" id="frame-${n}">`
      + `<text x="${PADDING}" y="${top + LINE_HEIGHT - 6}"><tspan class="prompt">$</tspan> ${escapeXml(fit(screen.command, columns - 2))}</text>`
      + `<rect id="type-${n}" x="${commandX}" y="${top}" width="${commandWidth + CHAR_WIDTH}" height="${LINE_HEIGHT}" class="bg"/>`
      + `<g id="output-${n}" class="output">${lines}</g></g>`;
  });

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="CLIP terminal demo">`
    + `<style>text { font: ${FONT_SIZE}px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; fill: #e6e6e6; white-space: pre }`
    + ' .bg { fill: #1b1d23 } .prompt { fill: #7fd88f } .output text { fill: #b8bcc6 } .frame { opacity: 0 }'
    + ` ${styles.join(' ')}</style>`
    + `<rect width="${width}" height="${height}" rx="8" class="bg"/>`
    + `<circle cx="20" cy="16" r="6" fill="#ff5f57"/><circle cx="40" cy="16" r="6" fill="#febc2e"/><circle cx="60" cy="16" r="6" fill="#28c840"/>`
    + `${groups.join('')}</svg>\n`;
}

type Step = { command: string; run: (dir: string) => string; maxLines?: number };

function record(steps: Step[]): Frame[] {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'clip-demo-')));
  try {
    spawnSync('git', ['init', '-q'], { cwd: dir });
    const git = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim();
    const replacements = { [dir]: '~/my-app', [git]: '/usr/bin/git' };
    return steps.map(step => ({ command: step.command, output: sanitize(step.run(dir), replacements), maxLines: step.maxLines }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

const main = fileURLToPath(new URL('../packages/cli/src/main.ts', import.meta.url));
const clip = (dir: string, ...args: string[]) => {
  const result = spawnSync(process.execPath, [main, ...args, '--output', 'text'], {
    cwd: dir, encoding: 'utf8', env: { ...process.env, CLIP_HOME: join(dir, '.clip-home') },
  });
  if (result.status !== 0) throw new Error(`clip ${args.join(' ')} failed: ${result.stderr}`);
  return result.stdout;
};

const STEPS: Step[] = [
  { command: 'clip registry search git', run: dir => clip(dir, 'registry', 'search', 'git') },
  {
    command: 'clip registry add git --purpose "Review repository changes" && clip sync',
    run: dir => { clip(dir, 'registry', 'add', 'git', '--purpose', 'Review repository changes'); return clip(dir, 'sync'); },
  },
  {
    command: 'head -n 17 .agents/skills/clip-git/SKILL.md',
    run: dir => readFileSync(join(dir, '.agents/skills/clip-git/SKILL.md'), 'utf8').split('\n').slice(0, 17).join('\n'),
  },
];

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const out = fileURLToPath(new URL('../docs/demo.svg', import.meta.url));
  writeFileSync(out, renderDemoSvg(record(STEPS)));
  console.log(`Wrote ${out}`);
}

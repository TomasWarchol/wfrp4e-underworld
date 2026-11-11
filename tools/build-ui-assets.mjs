#!/usr/bin/env node
/*
 * build-ui-assets.mjs
 * Validates the SVG UI assets in assets/ui/<group>/ and builds:
 *   assets/ui/sprite.svg    hidden <svg> with one <symbol> per valid asset
 *   assets/ui/preview.html  static gallery with inlined SVG content
 * Run from the repository root:  node tools/build-ui-assets.mjs
 * Exit code 1 when there are validation errors. Assets with errors are left out
 * of the sprite and the preview (the preview lists them as excluded).
 * Standard library only (fs, path). No network, no dependencies.
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const UI_DIR = path.join(ROOT, 'assets', 'ui');
const SPRITE_FILE = path.join(UI_DIR, 'sprite.svg');
const PREVIEW_FILE = path.join(UI_DIR, 'preview.html');
const KB = 1024;

const GROUPS = [
  { name: 'roles', prefix: 'role', kind: 'icon', title: 'Roles' },
  { name: 'jobs', prefix: 'job', kind: 'icon', title: 'Jobs' },
  { name: 'orders', prefix: 'order', kind: 'icon', title: 'Combat orders' },
  { name: 'interface', prefix: 'ui', kind: 'icon', title: 'Interface' },
  { name: 'ornaments', prefix: 'orn', kind: 'art', title: 'Ornaments' },
  { name: 'heraldry', prefix: 'her', kind: 'art', title: 'Heraldry and skylines' },
];

const ICON_VIEWBOX = '0 0 64 64';
const CREST_VIEWBOX = '0 0 64 64';
const SKYLINE_VIEWBOX = '0 0 1000 140';
const ORNAMENT_VIEWBOX = {
  frame_corner: '0 0 96 96',
  divider: '0 0 480 24',
  ribbon: '0 0 400 72',
  seal: '0 0 96 96',
  seal_success: '0 0 96 96',
  seal_failure: '0 0 96 96',
  bookmark: '0 0 48 128',
  shield: '0 0 100 120',
  card_corner: '0 0 48 48',
  deckle_edge: '0 0 400 12',
  hatch: '0 0 64 64',
  pip_flag: '0 0 24 32',
  pip_seal: '0 0 32 32',
};

const FORBIDDEN_TAGS = new Set(['style', 'script', 'text', 'image', 'foreignobject', 'iframe', 'object', 'embed']);
const COLOUR_PROPS = new Set(['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color', 'color']);
const ALLOWED_PAINT = new Set(['currentcolor', 'none', 'inherit']);
const SKIP_ROOT_ATTRS = new Set(['viewBox', 'width', 'height', 'id', 'class', 'version']);

const issues = []; // { level: 'error' | 'warn', group, where, msg }

function report(level, group, where, msg) {
  issues.push({ level, group, where, msg });
}

function isDir(p) {
  try {
    return fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normVB(v) {
  return v.trim().split(/[\s,]+/).join(' ');
}

function expectedViewBox(group, id) {
  if (group.kind === 'icon') return ICON_VIEWBOX;
  if (group.name === 'ornaments') {
    return Object.prototype.hasOwnProperty.call(ORNAMENT_VIEWBOX, id) ? ORNAMENT_VIEWBOX[id] : null;
  }
  if (id.startsWith('skyline_')) return SKYLINE_VIEWBOX;
  if (id.startsWith('crest_')) return CREST_VIEWBOX;
  return null;
}

function sizeLimit(group, id) {
  if (group.kind === 'icon') return 3 * KB;
  if (group.name === 'ornaments') return 8 * KB;
  return id.startsWith('skyline_') ? 12 * KB : 4 * KB;
}

function parseAttrs(s) {
  const out = {};
  const re = /([A-Za-z_:][-\w:.]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(s)) !== null) {
    out[m[1]] = m[2] !== undefined ? m[2] : m[3];
  }
  return out;
}

// Validates one SVG file. Returns { errors, warnings, asset }.
function validateAsset(group, entry, text, byteLength) {
  const errors = [];
  const warnings = [];

  if (/<!\s*(DOCTYPE|ENTITY)/i.test(text)) errors.push('DOCTYPE/ENTITY declaration not allowed');
  if (/<!--/.test(text)) warnings.push('comment present (art bible: no comments)');

  const src = text
    .replace(/^﻿/, '')
    .replace(/<\?xml[\s\S]*?\?>/g, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .trim();

  const m = /^<svg\b([^>]*)>([\s\S]*)<\/svg>$/i.exec(src);
  if (!m) {
    errors.push('root element must be a single <svg>...</svg>');
    return { errors, warnings, asset: null };
  }
  const rootAttrs = parseAttrs(m[1]);
  const inner = m[2];
  const has = k => Object.prototype.hasOwnProperty.call(rootAttrs, k);

  // Root element
  if (rootAttrs.xmlns !== 'http://www.w3.org/2000/svg') warnings.push('root xmlns is not http://www.w3.org/2000/svg');
  const expected = expectedViewBox(group, entry.id);
  if (!has('viewBox')) {
    errors.push('root viewBox missing');
  } else if (expected) {
    if (normVB(rootAttrs.viewBox) !== expected) {
      errors.push(`viewBox "${rootAttrs.viewBox}" should be "${expected}"`);
    }
  } else {
    warnings.push(`no expected viewBox known for id "${entry.id}" (presence only checked)`);
  }
  if (has('width')) errors.push('root has width');
  if (has('height')) errors.push('root has height');
  if (has('id')) errors.push('root has id (art bible: none)');
  if (has('class')) errors.push('root has class (art bible: none)');

  // Elements
  const tags = new Set([...src.matchAll(/<\s*([A-Za-z][\w:.-]*)/g)].map(x => x[1]));
  for (const t of tags) {
    const l = t.toLowerCase();
    if (FORBIDDEN_TAGS.has(l)) errors.push(`forbidden element <${t}>`);
    if (l === 'lineargradient' || l === 'radialgradient') errors.push(`gradients not allowed (<${t}>)`);
  }
  if (!/<[A-Za-z]/.test(inner)) errors.push('no drawing content');

  // External references
  for (const x of src.matchAll(/(?:xlink:)?href\s*=\s*(["'])(.*?)\1/gi)) {
    if (!x[2].trim().startsWith('#')) errors.push(`external href "${x[2]}"`);
  }
  if (/\ssrc\s*=/i.test(' ' + src)) errors.push('src attribute not allowed');
  for (const x of src.matchAll(/url\(\s*(["']?)(.*?)\1\s*\)/gi)) {
    if (!x[2].trim().startsWith('#')) errors.push(`external url(${x[2]})`);
  }

  // Colours: attributes
  for (const x of src.matchAll(/(?:^|\s)(fill|stroke|stop-color|flood-color|lighting-color|color)\s*=\s*(["'])(.*?)\2/gi)) {
    const v = x[3].trim().toLowerCase();
    if (!ALLOWED_PAINT.has(v)) errors.push(`colour ${x[1]}="${x[3]}" (only currentColor or none)`);
  }
  // Colours: inline style
  for (const x of src.matchAll(/(?:^|\s)style\s*=\s*(["'])(.*?)\1/gi)) {
    for (const decl of x[2].split(';')) {
      const i = decl.indexOf(':');
      if (i < 0) continue;
      const prop = decl.slice(0, i).trim().toLowerCase();
      const val = decl.slice(i + 1).trim().toLowerCase();
      if (COLOUR_PROPS.has(prop) && !ALLOWED_PAINT.has(val)) errors.push(`inline style colour ${prop}:${val}`);
    }
  }
  // Colours: any other literal colour (hex / rgb / hsl), ignoring id references
  const scrub = src
    .replace(/(?:xlink:)?href\s*=\s*(["'])#.*?\1/gi, '')
    .replace(/url\(\s*(["']?)#.*?\1\s*\)/gi, '');
  if (/#[0-9a-f]{3,8}\b/i.test(scrub)) errors.push('hex colour found');
  if (/\b(rgba?|hsla?)\s*\(/i.test(scrub)) errors.push('rgb()/hsl() colour found');

  // Ids
  const ids = [...inner.matchAll(/(?:^|\s)id\s*=\s*(["'])(.*?)\1/gi)].map(x => x[2]);
  for (const d of new Set(ids.filter((x, i) => ids.indexOf(x) !== i))) {
    errors.push(`duplicate id "${d}"`);
  }
  const idSet = new Set(ids);
  for (const x of src.matchAll(/url\(\s*(["']?)#(.*?)\1\s*\)/gi)) {
    if (!idSet.has(x[2].trim())) errors.push(`url(#${x[2]}) refers to a missing id`);
  }
  for (const x of src.matchAll(/(?:xlink:)?href\s*=\s*(["'])#(.*?)\1/gi)) {
    if (!idSet.has(x[2])) errors.push(`href="#${x[2]}" refers to a missing id`);
  }

  if (/(?:^|\s)opacity\s*=/i.test(src)) warnings.push('opacity attribute (art bible allows only fill-opacity)');

  const limit = sizeLimit(group, entry.id);
  if (byteLength > limit) warnings.push(`size ${byteLength} B exceeds ${limit} B`);

  const asset = {
    group: group.name,
    prefix: group.prefix,
    id: entry.id,
    symId: `${group.prefix}-${entry.id}`,
    file: entry.file,
    subject: typeof entry.subject === 'string' ? entry.subject : '',
    viewBox: has('viewBox') ? normVB(rootAttrs.viewBox) : (expected || ''),
    rootAttrs,
    inner,
  };
  return { errors, warnings, asset };
}

function loadManifests(dir, names, group) {
  const entries = [];
  for (const mf of names) {
    let data;
    try {
      data = JSON.parse(fs.readFileSync(path.join(dir, mf), 'utf8').replace(/^﻿/, ''));
    } catch (e) {
      report('error', group.name, mf, `invalid JSON (${e.message})`);
      continue;
    }
    if (!Array.isArray(data)) {
      report('error', group.name, mf, 'manifest is not a JSON array');
      continue;
    }
    data.forEach((e, i) => {
      if (!e || typeof e.id !== 'string' || typeof e.file !== 'string') {
        report('error', group.name, `${mf}[${i}]`, 'entry needs string "id" and "file"');
        return;
      }
      entries.push({ ...e, manifest: mf });
    });
  }
  return entries;
}

function processGroup(group) {
  const dir = path.join(UI_DIR, group.name);
  const res = { group, present: isDir(dir), svgCount: 0, manifestCount: 0, assets: [], excluded: [] };
  if (!res.present) return res;

  const names = fs.readdirSync(dir).sort();
  const svgFiles = names.filter(n => /\.svg$/i.test(n));
  const manifestNames = names.filter(n => /^manifest(-[\w-]+)?\.json$/i.test(n));
  res.svgCount = svgFiles.length;

  for (const n of names) {
    if (!svgFiles.includes(n) && !manifestNames.includes(n)) {
      report('warn', group.name, `${group.name}/${n}`, 'unexpected file (not .svg or manifest)');
    }
  }
  if (manifestNames.length === 0) {
    report('error', group.name, `${group.name}/`, 'no manifest.json or manifest-*.json');
  }

  const entries = loadManifests(dir, manifestNames, group);
  res.manifestCount = entries.length;

  const seen = new Set();
  const listed = new Set();
  for (const e of entries) {
    const where = `${group.name}/${e.id}`;
    if (seen.has(e.id)) {
      report('error', group.name, where, `duplicate id in manifests (${e.manifest})`);
      continue;
    }
    seen.add(e.id);
    if (!/^[a-z0-9_]+$/.test(e.id)) report('error', group.name, where, 'id must match [a-z0-9_]+');
    listed.add(e.file);
    if (e.file !== `${e.id}.svg`) {
      report('error', group.name, where, `file "${e.file}" must be "${e.id}.svg"`);
      res.excluded.push(e.id);
      continue;
    }
    const fp = path.join(dir, e.file);
    if (!fs.existsSync(fp)) {
      report('error', group.name, where, `listed in ${e.manifest} but ${e.file} is missing`);
      res.excluded.push(e.id);
      continue;
    }
    const bytes = fs.readFileSync(fp);
    const r = validateAsset(group, e, bytes.toString('utf8'), bytes.length);
    for (const msg of r.errors) report('error', group.name, where, msg);
    for (const msg of r.warnings) report('warn', group.name, where, msg);
    if (r.errors.length === 0 && r.asset) {
      res.assets.push(r.asset);
    } else {
      res.excluded.push(e.id);
    }
  }

  for (const f of svgFiles) {
    if (!listed.has(f)) report('error', group.name, `${group.name}/${f}`, 'file is not listed in any manifest');
  }
  return res;
}

// Renames element ids inside an asset so they stay unique in the sprite and preview.
function renameIds(inner, prefix) {
  const ids = new Set([...inner.matchAll(/(\sid\s*=\s*)(["'])(.*?)\2/gi)].map(x => x[3]));
  if (ids.size === 0) return inner;
  const map = id => `${prefix}--${id}`;
  let out = inner.replace(/(\sid\s*=\s*)(["'])(.*?)\2/gi, (m, pre, q, v) => `${pre}${q}${map(v)}${q}`);
  out = out.replace(/url\(\s*(["']?)#(.*?)\1\s*\)/gi, (m, q, v) => {
    const id = v.trim();
    return ids.has(id) ? `url(${q}#${map(id)}${q})` : m;
  });
  out = out.replace(/((?:xlink:)?href\s*=\s*(["']))#(.*?)\2/gi, (m, pre, q, v) => (ids.has(v) ? `${pre}#${map(v)}${q}` : m));
  return out;
}

// Body of a symbol or svg: root presentation attributes go on a <g>, so fill/currentColor carry over.
function gBody(a, prefix) {
  const attrs = Object.keys(a.rootAttrs)
    .filter(k => !SKIP_ROOT_ATTRS.has(k) && !k.startsWith('xmlns'))
    .map(k => ` ${k}="${esc(a.rootAttrs[k])}"`)
    .join('');
  return `<g${attrs}>${renameIds(a.inner, prefix)}</g>`;
}

function buildSprite(included) {
  const symbols = included.map(a => `<symbol id="${a.symId}" viewBox="${a.viewBox}">${gBody(a, a.symId)}</symbol>`);
  return [
    '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" aria-hidden="true" focusable="false" style="position:absolute;width:0;height:0;overflow:hidden">',
    '<!-- Generated by tools/build-ui-assets.mjs. Do not edit by hand. -->',
    ...symbols,
    '</svg>',
    '',
  ].join('\n');
}

const PREVIEW_CSS = `
:root{--ink:#2b1f15;--parch:#f1ebd9;--muted:#b3a587;--card:#f8f3e4}
*{box-sizing:border-box}
body{margin:0;padding:16px;background:var(--parch);color:var(--ink);font:14px/1.45 Georgia,"Times New Roman",serif}
h1{font-size:22px;margin:0 0 4px}
h2{font-size:18px;margin:28px 0 12px;padding-bottom:4px;border-bottom:2px solid var(--ink)}
h2 small{font-size:13px;font-weight:normal;opacity:.8}
.meta{font-size:13px;opacity:.85;margin:0 0 8px}
nav ul{list-style:none;padding:0;margin:8px 0 0;display:flex;flex-wrap:wrap;gap:8px 14px;font-size:13px}
nav a{color:var(--ink)}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.card{margin:0;padding:8px;border:1px solid var(--ink);background:var(--card);min-width:0}
figcaption{margin-bottom:6px}
figcaption code{display:block;font-weight:bold;word-break:break-all}
figcaption span{font-size:12px}
.pair{display:grid;grid-template-columns:1fr 1fr;gap:6px}
.bg{display:flex;align-items:center;justify-content:center;gap:10px;padding:8px 4px;min-height:80px}
.bg-light{background:var(--parch);color:var(--ink);border:1px solid var(--ink)}
.bg-dark{background:var(--ink);color:var(--parch)}
.s64 svg{display:block;width:64px;height:64px}
.s20 svg{display:block;width:20px;height:20px}
.art{color:var(--ink);padding:6px 0}
.art svg{display:block;width:100%;max-width:480px;height:auto;margin:0 auto}
.composite{position:relative;width:100%;max-width:480px;margin:0 auto;aspect-ratio:100/120}
.composite .shield,.composite .crest{position:absolute}
.composite .shield{inset:0;color:var(--muted)}
.composite .crest{left:50%;top:46%;width:50%;aspect-ratio:1;transform:translate(-50%,-50%);color:var(--ink)}
.composite svg{display:block;width:100%;height:100%}
.empty{font-style:italic;margin:6px 0}
.bad{color:#7a1f14;font-size:13px}
@media (max-width:420px){body{padding:12px}}
`;

function buildPreview(results) {
  let uniq = 0;
  const key = a => `${a.symId}-p${++uniq}`;
  const inline = (a, cls) =>
    `<svg class="${cls}" viewBox="${a.viewBox}" role="img" aria-label="${esc(a.id)}">${gBody(a, key(a))}</svg>`;
  const caption = a =>
    `<figcaption><code>${esc(a.group)}/${esc(a.id)}</code><span>${esc(a.subject)}</span></figcaption>`;

  const iconCard = a => `<figure class="card">${caption(a)}<div class="pair">` +
    `<div class="bg bg-light"><span class="s64">${inline(a, 'ico')}</span><span class="s20">${inline(a, 'ico')}</span></div>` +
    `<div class="bg bg-dark"><span class="s64">${inline(a, 'ico')}</span><span class="s20">${inline(a, 'ico')}</span></div>` +
    `</div></figure>`;
  const artCard = a => `<figure class="card">${caption(a)}<div class="art">${inline(a, 'art-svg')}</div></figure>`;
  const crestCard = (c, shield) => `<figure class="card">${caption(c)}<div class="composite">` +
    `<div class="shield">${inline(shield, 'shield-svg')}</div>` +
    `<div class="crest">${inline(c, 'crest-svg')}</div></div></figure>`;

  const byName = {};
  for (const r of results) byName[r.group.name] = r;
  const shield = byName.ornaments ? byName.ornaments.assets.find(a => a.id === 'shield') : undefined;

  const nav = results
    .map(r => `<li><a href="#${r.group.name}">${esc(r.group.title)}</a> (${r.assets.length})</li>`)
    .join('');

  const sections = results.map(r => {
    const name = r.group.name;
    const countText = !r.present
      ? 'folder not present yet'
      : `${r.assets.length} ok${r.excluded.length ? `, ${r.excluded.length} excluded` : ''}`;
    let body;
    if (!r.present) {
      body = `<p class="empty">assets/ui/${esc(name)}/ does not exist yet. Nothing to show.</p>`;
    } else if (r.assets.length === 0) {
      body = `<p class="empty">No valid assets in this group.</p>`;
    } else if (r.group.kind === 'icon') {
      body = `<div class="grid">${r.assets.map(iconCard).join('')}</div>`;
    } else if (name === 'heraldry') {
      body = `<div class="grid">${r.assets.map(a =>
        a.id.startsWith('crest_') && shield ? crestCard(a, shield) : artCard(a)).join('')}</div>`;
    } else {
      body = `<div class="grid">${r.assets.map(artCard).join('')}</div>`;
    }
    const excluded = r.excluded.length
      ? `<p class="bad">Excluded because of validation errors: ${r.excluded.map(id => esc(`${name}/${id}`)).join(', ')}</p>`
      : '';
    return `<section id="${name}"><h2>${esc(r.group.title)} <small>${countText}</small></h2>${body}${excluded}</section>`;
  }).join('\n');

  const errs = issues.filter(i => i.level === 'error').length;
  const warns = issues.filter(i => i.level === 'warn').length;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>UI asset preview</title>
<style>${PREVIEW_CSS}</style>
</head>
<body>
<header>
<h1>UI asset preview</h1>
<p class="meta">Generated by tools/build-ui-assets.mjs. Do not edit by hand. Validation: ${errs} error(s), ${warns} warning(s).</p>
<nav><ul>${nav}</ul></nav>
</header>
<main>
${sections}
</main>
</body>
</html>
`;
}

function printReport(results) {
  console.log('UI asset validation report');
  for (const r of results) {
    const name = r.group.name;
    if (!r.present) {
      console.log(`\n[${name}] folder not present, skipped`);
      continue;
    }
    const mine = issues.filter(i => i.group === name);
    console.log(`\n[${name}] ${r.svgCount} svg, ${r.manifestCount} manifest entries, ${r.assets.length} valid, ${r.excluded.length} excluded`);
    if (mine.length === 0) console.log('  no errors, no warnings');
    for (const i of mine) {
      console.log(`  ${i.level === 'error' ? 'ERROR' : 'WARN '}  ${i.where}: ${i.msg}`);
    }
  }
  const e = issues.filter(i => i.level === 'error').length;
  const w = issues.filter(i => i.level === 'warn').length;
  console.log(`\nTotal: ${e} error(s), ${w} warning(s)`);
}

function main() {
  if (!isDir(UI_DIR)) {
    console.error(`Cannot find assets/ui under ${ROOT}. Run this from the repository root.`);
    process.exitCode = 1;
    return;
  }
  const results = GROUPS.map(processGroup);
  printReport(results);

  const included = results.flatMap(r => r.assets);
  const symIds = new Set();
  for (const a of included) {
    if (symIds.has(a.symId)) throw new Error(`duplicate symbol id ${a.symId}`);
    symIds.add(a.symId);
  }

  fs.writeFileSync(SPRITE_FILE, buildSprite(included), 'utf8');
  fs.writeFileSync(PREVIEW_FILE, buildPreview(results), 'utf8');
  console.log(`\nWrote ${path.relative(ROOT, SPRITE_FILE)} (${included.length} symbols)`);
  console.log(`Wrote ${path.relative(ROOT, PREVIEW_FILE)}`);

  const errors = issues.filter(i => i.level === 'error').length;
  console.log(errors ? `FAILED: ${errors} error(s)` : 'OK: no errors');
  process.exitCode = errors ? 1 : 0;
}

main();

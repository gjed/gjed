// Renders the profile cards as self-contained SVGs in the gjed brand.
//
// The cards have no ground: GitHub shows README images on #ffffff (light) or
// #0d1117 (dark), so everything is drawn straight onto the page with the brand
// ink, hairline and accent tokens. GitHub embeds them as <img>, which never
// loads web fonts, so every font stack falls back to system fonts.

export const WIDTH = 800;
const HEADER = 64; // title baseline 28, perch line 40-42, content starts below

export const THEMES = {
  light: {
    ink: "#13181D",
    muted: "#4F5B66",
    hairline: "#D6CFC2",
    accent: "#55305F", // Plum
    perch: "#55305F",
    sea: "#1F3A4D",
    seaMid: "#6B8BA0",
    // Language ramp: the top language takes the accent, the rest step down Sea.
    ramp: ["#55305F", "#1F3A4D", "#3D5E74", "#5F8299", "#87A5B8", "#AFC4D2"],
    other: "#B5AC9C",
  },
  dark: {
    ink: "#ECE6DA",
    muted: "#A3ADB5",
    hairline: "#2E3740",
    accent: "#C990E0", // Orchid
    perch: "#8A57A0", // Plum-mid, the mark's shade on dark grounds
    sea: "#8FB4C8",
    seaMid: "#4A6E84",
    ramp: ["#C990E0", "#8FB4C8", "#6D93A8", "#53778C", "#456A80", "#3A5568"],
    other: "#4F5B66",
  },
};

const FONT_DISPLAY = `Newsreader, 'Source Serif 4', Georgia, 'Times New Roman', serif`;
const FONT_SANS = `'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif`;
const FONT_MONO = `'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`;

export function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const fmt = (n) => Number(n || 0).toLocaleString("en-US");

/** 72400 -> "72.4k"; small numbers stay exact. */
function compact(n) {
  if (n < 1000) return String(n);
  if (n < 10000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k`;
  if (n < 1e6) return `${Math.round(n / 1000)}k`;
  return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
}

/** Rough width of `text` in px; good enough to truncate, not to align. */
function textWidth(text, size, mono = false) {
  return String(text).length * size * (mono ? 0.6 : 0.55);
}

function truncate(text, maxWidth, size, mono = false) {
  let s = String(text);
  if (textWidth(s, size, mono) <= maxWidth) return s;
  while (s.length > 1 && textWidth(`${s}…`, size, mono) > maxWidth) s = s.slice(0, -1);
  return `${s}…`;
}

// No entrance animation: a rasteriser that snapshots the first frame (or a
// reader who never sees it run) would otherwise get an empty card.
const STYLE = `
    .t { font-family: ${FONT_SANS}; }
    .d { font-family: ${FONT_DISPLAY}; }
    .m { font-family: ${FONT_MONO}; }`;

/**
 * The shared frame: a serif title, a right-aligned note on the same baseline,
 * and the horizon below them in the perch colour, as on the README banner.
 */
function frame({ theme, title, note, height, body, desc }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${WIDTH}" height="${height}" viewBox="0 0 ${WIDTH} ${height}" role="img" aria-labelledby="title desc">
  <title id="title">${escapeXml(title)}</title>
  <desc id="desc">${escapeXml(desc)}</desc>
  <style>${STYLE}
  </style>
  <text class="d" x="1" y="28" font-size="24" font-weight="500" fill="${theme.ink}">${escapeXml(title)}</text>
  <text class="t" x="${WIDTH}" y="28" font-size="13" text-anchor="end" fill="${theme.muted}">${escapeXml(note)}</text>
  <rect x="0" y="40" width="${WIDTH}" height="2" fill="${theme.perch}"/>${body}
</svg>
`;
}

// ---------------------------------------------------------------------------
// At a glance
// ---------------------------------------------------------------------------

/**
 * GitHub's "Activity overview" cross: four axes (Code review up, Issues right,
 * Pull requests down, Commits left), each point at its share of the last
 * year's commits + pull requests + issues + reviews, joined into a shape.
 */
function activityCross(lastYear, cx, cy, r, theme) {
  const parts = [
    { key: "reviews", label: "Code review", dx: 0, dy: -1 },
    { key: "issues", label: "Issues", dx: 1, dy: 0 },
    { key: "pullRequests", label: "Pull requests", dx: 0, dy: 1 },
    { key: "commits", label: "Commits", dx: -1, dy: 0 },
  ];
  const total = parts.reduce((s, p) => s + (lastYear[p.key] || 0), 0);
  const share = (p) => (total ? (lastYear[p.key] || 0) / total : 0);
  // A floor keeps a 0-4% axis from collapsing the shape onto the centre.
  const points = parts.map((p) => {
    const d = Math.max(share(p) * r, 3);
    return [cx + p.dx * d, cy + p.dy * d];
  });
  const poly = points.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" ");

  let out = `
  <g stroke="${theme.muted}" stroke-opacity="0.8" stroke-width="1">
    <line x1="${cx - r}" y1="${cy}" x2="${cx + r}" y2="${cy}"/>
    <line x1="${cx}" y1="${cy - r}" x2="${cx}" y2="${cy + r}"/>
  </g>
  <polygon points="${poly}" fill="${theme.accent}" fill-opacity="0.16" stroke="${theme.accent}" stroke-width="2" stroke-linejoin="round"/>`;
  for (const [x, y] of points) {
    out += `
  <circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3.5" fill="${theme.accent}"/>`;
  }

  parts.forEach((p) => {
    const pct = `${Math.round(share(p) * 100)}%`;
    let px; let py; let anchor;
    if (p.dy === -1) [px, py, anchor] = [cx, cy - r - 24, "middle"];
    else if (p.dy === 1) [px, py, anchor] = [cx, cy + r + 18, "middle"];
    else if (p.dx === 1) [px, py, anchor] = [cx + r + 8, cy - 3, "start"];
    else [px, py, anchor] = [cx - r - 8, cy - 3, "end"];
    out += `
  <text class="t" x="${px}" y="${py}" font-size="13" font-weight="600" text-anchor="${anchor}" fill="${theme.ink}">${pct}</text>
  <text class="t" x="${px}" y="${py + 15}" font-size="12" text-anchor="${anchor}" fill="${theme.muted}">${p.label}</text>`;
  });
  return out;
}

export function renderStats(data, theme) {
  const t = data.totals;
  const tiles = [
    [fmt(t.commits), "Commits"],
    [fmt(t.pullRequests), "Pull requests"],
    [fmt(t.reviews), "Code reviews"],
    [fmt(t.issues), "Issues"],
    [fmt(t.mergedUpstream), "Merged upstream"],
    [fmt(t.publicRepos), "Public repositories"],
    [fmt(t.stars), "Stars earned"],
    [fmt(t.followers), "Followers"],
  ];

  // Three columns: the headline number, the activity cross, the totals.
  const top = HEADER + 6;
  const height = 232;
  const heroW = 224;
  const gridX = 540;
  const gridColW = (WIDTH - gridX) / 2;
  const rowH = height / 4;
  const crossCx = heroW + (gridX - heroW) / 2;
  const crossCy = top + height / 2 + 2;

  let body = `
  <text class="d" x="0" y="${top + 58}" font-size="60" font-weight="500" fill="${theme.ink}">${fmt(t.contributions)}</text>
  <text class="t" x="0" y="${top + 86}" font-size="14" fill="${theme.ink}">contributions since ${t.firstYear}</text>
  <text class="t" x="0" y="${top + 108}" font-size="13" fill="${theme.muted}">${fmt(t.contributionsThisYear)} so far in ${data.years.at(-1).year}</text>
  <text class="t" x="0" y="${top + 128}" font-size="13" fill="${theme.muted}">${t.yearsOnGitHub} years on GitHub</text>
  <text class="t" x="0" y="${top + height - 18}" font-size="12" fill="${theme.muted}">Activity overview, last 12 months</text>
  <text class="t" x="0" y="${top + height - 2}" font-size="12" fill="${theme.muted}">as GitHub draws it on the profile</text>
  <rect x="${heroW}" y="${top + 6}" width="1" height="${height - 12}" fill="${theme.hairline}"/>
  <rect x="${gridX - 16}" y="${top + 6}" width="1" height="${height - 12}" fill="${theme.hairline}"/>${activityCross(data.lastYear, crossCx, crossCy, 74, theme)}`;

  tiles.forEach(([value, label], i) => {
    const x = gridX + (i % 2) * gridColW + (i % 2 ? 12 : 0);
    const y = top + Math.floor(i / 2) * rowH;
    body += `
  <text class="d" x="${x}" y="${y + 30}" font-size="26" font-weight="500" fill="${theme.ink}">${value}</text>
  <text class="t" x="${x}" y="${y + 47}" font-size="12.5" fill="${theme.muted}">${label}</text>`;
    if (i < tiles.length - 2 && i % 2 === 0) {
      body += `
  <rect x="${gridX}" y="${(y + rowH - 1).toFixed(1)}" width="${WIDTH - gridX}" height="1" fill="${theme.hairline}"/>`;
    }
  });

  const ly = data.lastYear;
  return frame({
    theme,
    title: "At a glance",
    note: `@${data.login} on GitHub`,
    height: top + height + 4,
    body,
    desc:
      `${fmt(t.contributions)} contributions since ${t.firstYear}: ${tiles.map(([v, l]) => `${v} ${l.toLowerCase()}`).join(", ")}. ` +
      `Last 12 months: ${fmt(ly.commits)} commits, ${fmt(ly.pullRequests)} pull requests, ${fmt(ly.issues)} issues, ${fmt(ly.reviews)} code reviews.`,
  });
}

// ---------------------------------------------------------------------------
// Contributions per year
// ---------------------------------------------------------------------------

export function renderActivity(data, theme) {
  const years = data.years;
  // Bottom to top: commits, the collaboration work, then private contributions
  // (GitHub only reports them as a count, so they are hatched, never named).
  const series = [
    { label: "Commits", value: (y) => y.commits, fill: theme.sea },
    { label: "Pull requests, issues and code reviews", value: (y) => y.pullRequests + y.issues + y.reviews, fill: theme.seaMid },
    { label: "Private, counted but not named", value: (y) => y.private, fill: "url(#hatch)" },
  ];
  const stackOf = (y) => series.reduce((s, se) => s + se.value(y), 0);
  const max = Math.max(1, ...years.map(stackOf));
  const chartTop = HEADER + 28; // room for the value label over the tallest bar
  const chartH = 160;
  const base = chartTop + chartH;
  const slot = WIDTH / years.length;
  const barW = Math.min(36, slot * 0.56);
  const current = years.at(-1).year;

  let body = `
  <defs>
    <pattern id="hatch" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="5" height="5" fill="${theme.muted}" fill-opacity="0.14"/>
      <rect width="1.6" height="5" fill="${theme.muted}" fill-opacity="0.75"/>
    </pattern>
  </defs>`;
  years.forEach((y, i) => {
    const cx = slot * i + slot / 2;
    const x = (cx - barW / 2).toFixed(1);
    const isCurrent = y.year === current;
    let top = base;
    for (const se of series) {
      const v = se.value(y);
      if (v <= 0) continue;
      // Any non-zero segment gets at least 2px so it does not vanish.
      const h = Math.max((v / max) * chartH, 2);
      top -= h;
      body += `
  <rect x="${x}" y="${top.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${se.fill}"/>`;
    }
    if (y.total > 0) {
      body += `
  <text class="t" x="${cx.toFixed(1)}" y="${(top - 8).toFixed(1)}" font-size="12" text-anchor="middle" fill="${isCurrent ? theme.accent : theme.muted}"${isCurrent ? ' font-weight="600"' : ""}>${fmt(y.total)}</text>`;
    }
    body += `
  <text class="t" x="${cx.toFixed(1)}" y="${base + 22}" font-size="12.5" text-anchor="middle" fill="${isCurrent ? theme.ink : theme.muted}"${isCurrent ? ' font-weight="600"' : ""}>${y.year}</text>`;
  });

  body += `
  <rect x="0" y="${base}" width="${WIDTH}" height="1" fill="${theme.hairline}"/>`;

  // Legend: swatch, label, all-time count, laid out left to right.
  const legendY = base + 54;
  let lx = 0;
  body += `
  <g class="t" font-size="12.5">`;
  for (const se of series) {
    const sum = years.reduce((s, y) => s + se.value(y), 0);
    body += `
    <rect x="${lx}" y="${legendY - 10}" width="12" height="12" fill="${se.fill}"/>
    <text x="${lx + 18}" y="${legendY}" fill="${theme.muted}">${se.label} <tspan fill="${theme.ink}" font-weight="600">${fmt(sum)}</tspan></text>`;
    lx += 18 + textWidth(`${se.label} ${fmt(sum)}`, 12.5) + 28;
  }
  body += `
  </g>`;

  const total = years.reduce((s, y) => s + y.total, 0);
  return frame({
    theme,
    title: "Contributions per year",
    note: `${fmt(total)} since ${years[0].year}`,
    height: legendY + 6,
    body,
    desc: years
      .map((y) => `${y.year}: ${fmt(y.total)} (${series.map((se) => `${fmt(se.value(y))} ${se.label.toLowerCase()}`).join(", ")})`)
      .join("; "),
  });
}

// ---------------------------------------------------------------------------
// Most used languages
// ---------------------------------------------------------------------------

export function renderLanguages(data, theme) {
  const langs = data.languages;
  const barY = HEADER + 4;
  const barH = 14;
  const gap = 3;
  const usable = WIDTH - gap * (langs.length - 1);

  let body = "";
  let x = 0;
  langs.forEach((lang, i) => {
    const w = Math.max(2, lang.share * usable);
    const fill = lang.name === "Other" ? theme.other : theme.ramp[i] || theme.other;
    body += `
  <rect x="${x.toFixed(1)}" y="${barY}" width="${w.toFixed(1)}" height="${barH}" fill="${fill}"/>`;
    x += w + gap;
  });

  // Legend: two columns, name left, share right-aligned in tabular mono.
  const cols = 2;
  const colGap = 48;
  const colW = (WIDTH - colGap) / cols;
  const rowH = 30;
  const rows = Math.ceil(langs.length / cols);
  const listTop = barY + barH + 22;
  langs.forEach((lang, i) => {
    const col = Math.floor(i / rows);
    const row = i % rows;
    const lx = col * (colW + colGap);
    const ly = listTop + row * rowH;
    const fill = lang.name === "Other" ? theme.other : theme.ramp[i] || theme.other;
    const pct = lang.share >= 0.1 ? Math.round(lang.share * 100) : (lang.share * 100).toFixed(1);
    body += `
  <g>
    <rect x="${lx}" y="${ly + 7}" width="10" height="10" fill="${fill}"/>
    <text class="t" x="${lx + 20}" y="${ly + 16.5}" font-size="14" fill="${theme.ink}"${i === 0 ? ' font-weight="600"' : ""}>${escapeXml(lang.name)}</text>
    <text class="m" x="${lx + colW}" y="${ly + 16.5}" font-size="13" text-anchor="end" fill="${theme.muted}">${pct}%</text>
    <rect x="${lx}" y="${ly + rowH - 2}" width="${colW}" height="1" fill="${theme.hairline}"/>
  </g>`;
  });

  return frame({
    theme,
    title: "Most used languages",
    note: `by code size across ${data.languageRepos} public repositories`,
    height: listTop + rows * rowH,
    body,
    desc: langs.map((l) => `${l.name} ${(l.share * 100).toFixed(1)}%`).join(", "),
  });
}

// ---------------------------------------------------------------------------
// Upstream contributions
// ---------------------------------------------------------------------------

export function renderUpstream(data, theme) {
  const entries = data.upstream;
  const top = HEADER - 4;
  if (entries.length === 0) {
    return frame({
      theme,
      title: "Upstream contributions",
      note: "merged pull requests in other people's projects",
      height: top + 40,
      body: `
  <text class="t" x="0" y="${top + 24}" font-size="14" fill="${theme.muted}">No merged pull requests found yet.</text>`,
      desc: "No merged pull requests found yet.",
    });
  }

  const cols = 2;
  const colGap = 48;
  const colW = (WIDTH - colGap) / cols;
  const rowH = 56;
  const avatar = 32;
  const rows = Math.ceil(entries.length / cols);

  let body = `
  <defs><clipPath id="avatar" clipPathUnits="objectBoundingBox"><circle cx="0.5" cy="0.5" r="0.5"/></clipPath></defs>`;
  entries.forEach((e, i) => {
    // Fill down the first column, then the second, so the ranking reads like a list.
    const col = Math.floor(i / rows);
    const row = i % rows;
    const x = col * (colW + colGap);
    const y = top + row * rowH;
    const ay = y + (rowH - avatar) / 2;
    const tx = x + avatar + 14;
    const [owner, repo] = e.fullName.split("/");
    // Owner in the muted ink, repository in full ink: the name is what matters.
    const repoName = truncate(repo, colW - avatar - 14 - 72 - textWidth(`${owner}/`, 13, true), 13, true);
    const prs = `${e.mergedPrCount} merged PR${e.mergedPrCount === 1 ? "" : "s"}`;
    const avatarMarkup = e.avatarDataUri
      ? `<image x="${x}" y="${ay}" width="${avatar}" height="${avatar}" href="${e.avatarDataUri}" clip-path="url(#avatar)"/>
    <circle cx="${x + avatar / 2}" cy="${ay + avatar / 2}" r="${avatar / 2 - 0.5}" fill="none" stroke="${theme.hairline}"/>`
      : `<circle cx="${x + avatar / 2}" cy="${ay + avatar / 2}" r="${avatar / 2}" fill="${theme.hairline}"/>`;
    body += `
  <g>
    ${avatarMarkup}
    <text class="m" x="${tx}" y="${y + 25}" font-size="13" fill="${theme.muted}">${escapeXml(owner)}/<tspan fill="${theme.ink}">${escapeXml(repoName)}</tspan></text>
    <text class="t" x="${tx}" y="${y + 43}" font-size="12.5" fill="${theme.muted}">${prs}</text>
    <text class="d" x="${x + colW}" y="${y + 33}" font-size="20" text-anchor="end" fill="${i === 0 ? theme.accent : theme.ink}">${compact(e.stargazersCount)}<tspan class="t" font-size="12" fill="${theme.muted}" dx="4">stars</tspan></text>
  </g>
  <rect x="${x}" y="${y + rowH - 1}" width="${colW}" height="1" fill="${theme.hairline}"/>`;
  });

  return frame({
    theme,
    title: "Upstream contributions",
    note: "merged pull requests in other people's projects, by stars",
    height: top + rows * rowH + 2,
    body,
    desc: entries.map((e) => `${e.fullName} (${e.stargazersCount} stars, ${e.mergedPrCount} merged)`).join(", "),
  });
}

export const CARDS = {
  stats: renderStats,
  activity: renderActivity,
  languages: renderLanguages,
  upstream: renderUpstream,
};

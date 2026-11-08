#!/usr/bin/env node
// Finds merged PRs authored by GITHUB_LOGIN on other people's/orgs' repos, going
// back through GitHub's full history (via the Search API, which is not subject to
// the ~1-year lookback window that lowlighter/metrics' `notable` plugin is bound
// by), renders them as self-contained light and dark SVG cards in the gjed brand
// palette, and writes the most recently merged ones into README.md between the
// recent-prs markers.
//
// Zero npm dependencies: Node's built-in global `fetch` only.

import fs from "node:fs";
import path from "node:path";

const API_ROOT = "https://api.github.com";
const USER_AGENT = "notable-historical-script";
const MAX_SEARCH_RESULTS = 1000;
const SEARCH_PER_PAGE = 100;
const MAX_RENDERED_ROWS = 20;
const MAX_RECENT_PRS = 6;

const GITHUB_LOGIN = process.env.GITHUB_LOGIN || "gjed";
const OUTPUT_DIR = process.env.OUTPUT_DIR || "metrics";
const README_PATH = process.env.README_PATH || "README.md";

/**
 * Query the Search API for merged PRs authored by `login` on repos not owned by
 * `login` and not in the `zextras` org, paginating up to the API's 1000-result
 * ceiling. Returns a Map of "owner/repo" -> number of merged PRs found, and the
 * list of PRs themselves.
 *
 * SIMPLIFIED: the Search API caps any query at 1000 results; past that, older PRs
 * are silently dropped. Switch to GraphQL contributionsCollection, one year at a
 * time, if the account ever gets there.
 */
async function searchMergedPRs(login, token) {
  const query = `is:pr is:merged author:${login} -user:${login} -org:zextras`;
  const prCountByRepo = new Map();
  const prs = [];

  for (let page = 1; page <= MAX_SEARCH_RESULTS / SEARCH_PER_PAGE; page++) {
    const url = new URL(`${API_ROOT}/search/issues`);
    url.searchParams.set("q", query);
    url.searchParams.set("per_page", String(SEARCH_PER_PAGE));
    url.searchParams.set("page", String(page));

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": USER_AGENT,
      },
    });

    if (!res.ok) {
      const body = await res.text();
      throw new Error(`GitHub search failed: ${res.status} ${res.statusText}: ${body}`);
    }

    const data = await res.json();
    const items = data.items || [];

    for (const item of items) {
      const match = /^https:\/\/api\.github\.com\/repos\/(.+)$/.exec(item.repository_url || "");
      if (!match) continue;
      const fullName = match[1];
      prCountByRepo.set(fullName, (prCountByRepo.get(fullName) || 0) + 1);
      prs.push({
        fullName,
        number: item.number,
        title: item.title,
        url: item.html_url,
        mergedAt: item.pull_request?.merged_at || item.closed_at,
      });
    }

    if (items.length < SEARCH_PER_PAGE) break;
  }

  return { prCountByRepo, prs };
}

/**
 * Fetch repo metadata needed to filter/sort/render. Returns null (caller should
 * skip) on any request failure or if the repo is a fork.
 */
async function fetchRepoMeta(fullName, token) {
  try {
    const res = await fetch(`${API_ROOT}/repos/${fullName}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": USER_AGENT,
      },
    });
    if (!res.ok) return null;

    const data = await res.json();
    if (data.fork) return null;

    return {
      fullName,
      stargazersCount: data.stargazers_count || 0,
      ownerLogin: data.owner?.login,
      avatarUrl: data.owner?.avatar_url,
    };
  } catch {
    return null;
  }
}

/** Fetch an image and base64-encode it as a data: URI using its real content-type. */
async function toDataUri(url) {
  const res = await fetch(url, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`Failed to fetch avatar ${url}: ${res.status} ${res.statusText}`);
  const mime = res.headers.get("content-type") || "image/png";
  const buffer = Buffer.from(await res.arrayBuffer());
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const SVG_WIDTH = 480;
const HEADER_HEIGHT = 56;
const ROW_HEIGHT = 44;
const ROW_GAP = 4;
const PADDING_X = 12;
const PADDING_BOTTOM = 12;
const AVATAR_SIZE = 28;

// gjed brand tokens (tokens.css in the brand kit). GitHub renders README images
// as <img>, so web fonts never load: the font stacks fall back to system fonts.
const THEMES = {
  light: {
    surface: "#f4f1ea",
    surfaceRaised: "#fbf9f4",
    ink: "#13181d",
    inkMuted: "#4f5b66",
    hairline: "#d6cfc2",
    markShade: "#55305f",
  },
  dark: {
    surface: "#13181d",
    surfaceRaised: "#1a2127",
    ink: "#ece6da",
    inkMuted: "#a3adb5",
    hairline: "#2e3740",
    markShade: "#8a57a0",
  },
};

const FONT_DISPLAY = `Newsreader, 'Source Serif 4', Georgia, serif`;
const FONT_SANS = `'IBM Plex Sans', system-ui, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif`;
const FONT_MONO = `'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, monospace`;

function renderHeader(theme) {
  // The horizon: the perch line of the mark, edge to edge under the title.
  return `
  <text x="${PADDING_X}" y="30" font-family="${FONT_DISPLAY}" font-size="20" font-weight="500" fill="${theme.ink}">Notable contributions</text>
  <rect x="0" y="42" width="${SVG_WIDTH}" height="2" fill="${theme.markShade}" />`;
}

function renderRow(entry, index, theme) {
  const rowY = HEADER_HEIGHT + index * (ROW_HEIGHT + ROW_GAP);
  const avatarX = PADDING_X + 8;
  const avatarY = rowY + (ROW_HEIGHT - AVATAR_SIZE) / 2;
  const avatarCx = avatarX + AVATAR_SIZE / 2;
  const avatarCy = avatarY + AVATAR_SIZE / 2;
  const textX = avatarX + AVATAR_SIZE + 12;
  const clipId = `avatar-clip-${index}`;

  const avatarMarkup = entry.avatarDataUri
    ? `
      <clipPath id="${clipId}">
        <circle cx="${avatarCx}" cy="${avatarCy}" r="${AVATAR_SIZE / 2}" />
      </clipPath>
      <image x="${avatarX}" y="${avatarY}" width="${AVATAR_SIZE}" height="${AVATAR_SIZE}" href="${entry.avatarDataUri}" clip-path="url(#${clipId})" />`
    : `
      <circle cx="${avatarCx}" cy="${avatarCy}" r="${AVATAR_SIZE / 2}" fill="${theme.hairline}" />`;

  const prLabel = entry.mergedPrCount === 1 ? "pull request" : "pull requests";
  const [owner, repo] = entry.fullName.split("/");

  return `
    <g>
      <rect x="${PADDING_X}" y="${rowY}" width="${SVG_WIDTH - PADDING_X * 2}" height="${ROW_HEIGHT}" rx="6" fill="${theme.surfaceRaised}" stroke="${theme.hairline}" stroke-width="1" />${avatarMarkup}
      <text x="${textX}" y="${rowY + 19}" font-family="${FONT_MONO}" font-size="13" fill="${theme.ink}">${escapeXml(`${owner} / ${repo}`)}</text>
      <text x="${textX}" y="${rowY + 34}" font-family="${FONT_SANS}" font-size="11" fill="${theme.inkMuted}">${entry.stargazersCount} stars · ${entry.mergedPrCount} merged ${prLabel}</text>
    </g>`;
}

/** Render the full SVG for one theme, or a small empty-state SVG when `entries` is empty. */
function renderSvg(entries, theme) {
  const body =
    entries.length === 0
      ? `
  <text x="${PADDING_X}" y="${HEADER_HEIGHT + 18}" font-family="${FONT_SANS}" font-size="13" fill="${theme.inkMuted}">No merged pull requests found</text>`
      : entries.map((entry, index) => renderRow(entry, index, theme)).join("");
  const height =
    entries.length === 0
      ? HEADER_HEIGHT + 24 + PADDING_BOTTOM
      : HEADER_HEIGHT + entries.length * (ROW_HEIGHT + ROW_GAP) - ROW_GAP + PADDING_BOTTOM;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${SVG_WIDTH}" height="${height}" viewBox="0 0 ${SVG_WIDTH} ${height}">
  <title>Notable contributions</title>
  <rect x="0" y="0" width="${SVG_WIDTH}" height="${height}" rx="6" fill="${theme.surface}" />${renderHeader(theme)}${body}
</svg>
`;
}

function escapeMarkdown(value) {
  return String(value).replace(/[\\[\]<>*_`]/g, "\\$&");
}

/** Replace the lines between the recent-prs markers in the README with the newest merged PRs. */
function updateReadme(prs) {
  const startMarker = "<!-- recent-prs:start -->";
  const endMarker = "<!-- recent-prs:end -->";
  const readme = fs.readFileSync(README_PATH, "utf8");
  const start = readme.indexOf(startMarker);
  const end = readme.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`${README_PATH}: recent-prs markers missing or out of order`);
  }

  const lines = [...prs]
    .sort((a, b) => String(b.mergedAt).localeCompare(String(a.mergedAt)))
    .slice(0, MAX_RECENT_PRS)
    .map(
      (pr) =>
        `- [${pr.fullName}#${pr.number}](${pr.url}): ${escapeMarkdown(pr.title)} · ${String(pr.mergedAt).slice(0, 10)}`,
    );

  // Blank lines around the list keep the block stable under mdformat.
  const block = lines.length > 0 ? `\n\n${lines.join("\n")}\n\n` : "\n\n";
  const updated = readme.slice(0, start + startMarker.length) + block + readme.slice(end);
  fs.writeFileSync(README_PATH, updated);
  return lines.length;
}

async function main() {
  const token = process.env.GITHUB_TOKEN;
  if (!token) {
    console.error("GITHUB_TOKEN environment variable is required.");
    process.exit(1);
  }

  const login = GITHUB_LOGIN;

  const { prCountByRepo, prs } = await searchMergedPRs(login, token);
  const uniqueRepoNames = [...prCountByRepo.keys()];

  const metas = [];
  for (const fullName of uniqueRepoNames) {
    const meta = await fetchRepoMeta(fullName, token);
    if (meta) metas.push(meta);
  }

  metas.sort((a, b) => b.stargazersCount - a.stargazersCount);
  const topMetas = metas.slice(0, MAX_RENDERED_ROWS);

  const avatarCache = new Map();
  const entries = [];
  for (const meta of topMetas) {
    let avatarDataUri = null;
    if (meta.avatarUrl) {
      if (avatarCache.has(meta.avatarUrl)) {
        avatarDataUri = avatarCache.get(meta.avatarUrl);
      } else {
        try {
          avatarDataUri = await toDataUri(meta.avatarUrl);
        } catch (err) {
          console.error(`Warning: could not fetch avatar for ${meta.fullName}: ${err.message}`);
          avatarDataUri = null;
        }
        avatarCache.set(meta.avatarUrl, avatarDataUri);
      }
    }

    entries.push({
      fullName: meta.fullName,
      stargazersCount: meta.stargazersCount,
      mergedPrCount: prCountByRepo.get(meta.fullName) || 0,
      avatarDataUri,
    });
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const [name, theme] of Object.entries(THEMES)) {
    const outputPath = path.join(OUTPUT_DIR, `notable-historical-${name}.svg`);
    fs.writeFileSync(outputPath, renderSvg(entries, theme));
    console.log(`notable-historical: ${entries.length} entry(ies) rendered to ${outputPath}`);
  }

  const recentCount = updateReadme(prs);
  console.log(
    `notable-historical: ${uniqueRepoNames.length} unique repo(s), ${prs.length} merged PR(s) found; ${recentCount} written to ${README_PATH}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.stack || String(err));
    process.exit(1);
  });
}

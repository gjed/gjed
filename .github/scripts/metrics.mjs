#!/usr/bin/env node
// Collects GITHUB_LOGIN's GitHub activity and renders the profile cards
// (metrics/{stats,activity,languages,upstream}-{light,dark}.svg), then rewrites
// the recent-prs and updated blocks of README.md.
//
// Privacy: the token can see private repositories. Private work only ever
// shows up as aggregate counts; repository names, languages and stars come
// from public repositories only.
//
// Zero npm dependencies: Node's built-in global `fetch` only.
//
//   GITHUB_TOKEN=... GITHUB_LOGIN=gjed node .github/scripts/metrics.mjs
//   METRICS_DUMP=data.json ...      also write the collected data
//   METRICS_FIXTURE=data.json ...   render from saved data, no network

import fs from "node:fs";
import path from "node:path";
import { CARDS, THEMES } from "./cards.mjs";

const API_ROOT = "https://api.github.com";
const USER_AGENT = "gjed-profile-metrics";
const MAX_SEARCH_RESULTS = 1000;
const SEARCH_PER_PAGE = 100;
const MAX_UPSTREAM = 14;
const MAX_RECENT_PRS = 6;
const MAX_LANGUAGES = 6;
// Work at Zextras is the day job, not upstream contribution.
const EXCLUDED_OWNERS = ["zextras"];

const LOGIN = process.env.GITHUB_LOGIN || "gjed";
const OUTPUT_DIR = process.env.OUTPUT_DIR || "metrics";
const README_PATH = process.env.README_PATH || "README.md";

function headers(token) {
  return {
    Authorization: `Bearer ${token}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "User-Agent": USER_AGENT,
  };
}

async function rest(url, token) {
  const res = await fetch(url, { headers: headers(token) });
  if (!res.ok) throw new Error(`GET ${url}: ${res.status} ${res.statusText}: ${await res.text()}`);
  return res.json();
}

async function graphql(query, variables, token) {
  const res = await fetch(`${API_ROOT}/graphql`, {
    method: "POST",
    headers: { ...headers(token), "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const body = await res.json();
  if (!res.ok || body.errors) {
    throw new Error(`GraphQL: ${res.status} ${JSON.stringify(body.errors || body)}`);
  }
  return body.data;
}

/** Account basics plus every public, non-fork repository the user owns. */
async function fetchProfile(login, token) {
  const query = `query ($login: String!, $after: String) {
    user(login: $login) {
      createdAt
      followers { totalCount }
      lastYear: contributionsCollection {
        totalCommitContributions
        totalPullRequestContributions
        totalIssueContributions
        totalPullRequestReviewContributions
      }
      repositories(first: 100, after: $after, ownerAffiliations: OWNER, privacy: PUBLIC, isFork: false) {
        pageInfo { hasNextPage endCursor }
        nodes {
          stargazerCount
          languages(first: 20, orderBy: { field: SIZE, direction: DESC }) { edges { size node { name } } }
        }
      }
    }
  }`;
  const repos = [];
  let after = null;
  let user;
  do {
    user = (await graphql(query, { login, after }, token)).user;
    if (!user) throw new Error(`user ${login} not found`);
    repos.push(...user.repositories.nodes);
    after = user.repositories.pageInfo.hasNextPage ? user.repositories.pageInfo.endCursor : null;
  } while (after);
  const y = user.lastYear;
  return {
    createdAt: user.createdAt,
    followers: user.followers.totalCount,
    // The window GitHub's own "Activity overview" uses: the last year to now.
    lastYear: {
      commits: y.totalCommitContributions,
      pullRequests: y.totalPullRequestContributions,
      issues: y.totalIssueContributions,
      reviews: y.totalPullRequestReviewContributions,
    },
    repos,
  };
}

/**
 * One contributionsCollection per calendar year since the account was created,
 * all aliased into a single request (a collection may span at most a year).
 */
async function fetchYears(login, firstYear, now, token) {
  const thisYear = now.getUTCFullYear();
  const fields = [];
  for (let year = firstYear; year <= thisYear; year++) {
    const to = year === thisYear ? now.toISOString() : `${year}-12-31T23:59:59Z`;
    fields.push(`y${year}: contributionsCollection(from: "${year}-01-01T00:00:00Z", to: "${to}") {
      contributionCalendar { totalContributions }
      totalCommitContributions
      totalPullRequestContributions
      totalIssueContributions
      totalPullRequestReviewContributions
      restrictedContributionsCount
    }`);
  }
  const data = await graphql(`query ($login: String!) { user(login: $login) { ${fields.join("\n")} } }`, { login }, token);
  return Object.entries(data.user).map(([key, y]) => ({
    year: Number(key.slice(1)),
    total: y.contributionCalendar.totalContributions,
    private: y.restrictedContributionsCount,
    commits: y.totalCommitContributions,
    pullRequests: y.totalPullRequestContributions,
    issues: y.totalIssueContributions,
    reviews: y.totalPullRequestReviewContributions,
  }));
}

/**
 * Merged PRs authored by `login` on repositories it does not own, through the
 * Search API (not bound to the one-year contributionsCollection window).
 *
 * SIMPLIFIED: search caps any query at 1000 results; older PRs past that are
 * dropped. Walk contributionsCollection year by year if the account gets there.
 */
async function searchMergedPRs(login, token) {
  const q = [`is:pr is:merged author:${login} -user:${login}`, ...EXCLUDED_OWNERS.map((o) => `-org:${o}`)].join(" ");
  const prs = [];
  for (let page = 1; page <= MAX_SEARCH_RESULTS / SEARCH_PER_PAGE; page++) {
    const url = new URL(`${API_ROOT}/search/issues`);
    url.searchParams.set("q", q);
    url.searchParams.set("per_page", String(SEARCH_PER_PAGE));
    url.searchParams.set("page", String(page));
    const items = (await rest(url, token)).items || [];
    for (const item of items) {
      const match = /^https:\/\/api\.github\.com\/repos\/(.+)$/.exec(item.repository_url || "");
      if (!match) continue;
      prs.push({
        fullName: match[1],
        number: item.number,
        title: item.title,
        url: item.html_url,
        mergedAt: item.pull_request?.merged_at || item.closed_at,
      });
    }
    if (items.length < SEARCH_PER_PAGE) break;
  }
  return prs;
}

/** Public, non-fork repository metadata, or null when the repo should not be shown. */
async function fetchRepoMeta(fullName, token) {
  try {
    const data = await rest(`${API_ROOT}/repos/${fullName}`, token);
    if (data.private || data.fork) return null;
    return { fullName, stargazersCount: data.stargazers_count || 0, avatarUrl: data.owner?.avatar_url };
  } catch {
    return null;
  }
}

async function toDataUri(url) {
  const sized = new URL(url);
  sized.searchParams.set("s", "64");
  const res = await fetch(sized, { headers: { "User-Agent": USER_AGENT } });
  if (!res.ok) throw new Error(`avatar ${url}: ${res.status}`);
  const mime = res.headers.get("content-type") || "image/png";
  return `data:${mime};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
}

/** Share of code bytes per language across the given repositories, top N plus "Other". */
function aggregateLanguages(repos) {
  const bytes = new Map();
  let total = 0;
  for (const repo of repos) {
    for (const { size, node } of repo.languages.edges) {
      bytes.set(node.name, (bytes.get(node.name) || 0) + size);
      total += size;
    }
  }
  if (total === 0) return [];
  const sorted = [...bytes].map(([name, b]) => ({ name, share: b / total })).sort((a, b) => b.share - a.share);
  const top = sorted.slice(0, MAX_LANGUAGES);
  const rest = sorted.slice(MAX_LANGUAGES).reduce((s, l) => s + l.share, 0);
  if (rest > 0.0005) top.push({ name: "Other", share: rest });
  return top;
}

function yearsSince(iso, now) {
  const created = new Date(iso);
  let years = now.getUTCFullYear() - created.getUTCFullYear();
  if (now < new Date(Date.UTC(now.getUTCFullYear(), created.getUTCMonth(), created.getUTCDate()))) years -= 1;
  return Math.max(0, years);
}

async function collect(login, token, now) {
  const profile = await fetchProfile(login, token);
  const firstYear = new Date(profile.createdAt).getUTCFullYear();
  const years = await fetchYears(login, firstYear, now, token);

  const prs = await searchMergedPRs(login, token);
  const metas = new Map();
  for (const fullName of new Set(prs.map((pr) => pr.fullName))) {
    const meta = await fetchRepoMeta(fullName, token);
    if (meta) metas.set(fullName, meta);
  }
  // Only PRs into public, non-fork repositories are named or counted.
  const publicPrs = prs.filter((pr) => metas.has(pr.fullName));
  const prCount = new Map();
  for (const pr of publicPrs) prCount.set(pr.fullName, (prCount.get(pr.fullName) || 0) + 1);

  const avatars = new Map();
  const upstream = [];
  for (const meta of [...metas.values()].sort((a, b) => b.stargazersCount - a.stargazersCount).slice(0, MAX_UPSTREAM)) {
    if (meta.avatarUrl && !avatars.has(meta.avatarUrl)) {
      try {
        avatars.set(meta.avatarUrl, await toDataUri(meta.avatarUrl));
      } catch (err) {
        console.error(`Warning: ${err.message}`);
        avatars.set(meta.avatarUrl, null);
      }
    }
    upstream.push({
      fullName: meta.fullName,
      stargazersCount: meta.stargazersCount,
      mergedPrCount: prCount.get(meta.fullName) || 0,
      avatarDataUri: avatars.get(meta.avatarUrl) || null,
    });
  }

  const sum = (key) => years.reduce((s, y) => s + y[key], 0);
  const languageRepos = profile.repos.filter((r) => r.languages.edges.length > 0);
  return {
    login,
    generatedAt: now.toISOString(),
    totals: {
      contributions: sum("total"),
      contributionsThisYear: years.at(-1).total,
      commits: sum("commits"),
      pullRequests: sum("pullRequests"),
      issues: sum("issues"),
      reviews: sum("reviews"),
      mergedUpstream: publicPrs.length,
      publicRepos: profile.repos.length,
      stars: profile.repos.reduce((s, r) => s + r.stargazerCount, 0),
      followers: profile.followers,
      firstYear,
      yearsOnGitHub: yearsSince(profile.createdAt, now),
    },
    years,
    lastYear: profile.lastYear,
    languages: aggregateLanguages(languageRepos),
    languageRepos: languageRepos.length,
    upstream,
    recentPrs: publicPrs
      .sort((a, b) => String(b.mergedAt).localeCompare(String(a.mergedAt)))
      .slice(0, MAX_RECENT_PRS),
  };
}

function escapeMarkdown(value) {
  return String(value).replace(/[\\[\]<>*_`]/g, "\\$&");
}

/** Replace what sits between `<!-- name:start -->` and `<!-- name:end -->`. */
function replaceBlock(readme, name, content) {
  const startMarker = `<!-- ${name}:start -->`;
  const endMarker = `<!-- ${name}:end -->`;
  const start = readme.indexOf(startMarker);
  const end = readme.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) {
    throw new Error(`${README_PATH}: ${name} markers missing or out of order`);
  }
  // Blank lines around the content keep the block stable under mdformat.
  const block = content ? `\n\n${content}\n\n` : "\n\n";
  return readme.slice(0, start + startMarker.length) + block + readme.slice(end);
}

function updateReadme(data) {
  const recent = data.recentPrs
    .map((pr) => `- [${pr.fullName}#${pr.number}](${pr.url}): ${escapeMarkdown(pr.title)} · ${String(pr.mergedAt).slice(0, 10)}`)
    .join("\n");
  const updated = `<p align="center"><sub>Cards regenerated daily by a GitHub Actions workflow · last run ${data.generatedAt.slice(0, 10)}</sub></p>`;
  let readme = fs.readFileSync(README_PATH, "utf8");
  readme = replaceBlock(readme, "recent-prs", recent);
  readme = replaceBlock(readme, "updated", updated);
  fs.writeFileSync(README_PATH, readme);
}

async function main() {
  let data;
  if (process.env.METRICS_FIXTURE) {
    data = JSON.parse(fs.readFileSync(process.env.METRICS_FIXTURE, "utf8"));
  } else {
    const token = process.env.GITHUB_TOKEN;
    if (!token) throw new Error("GITHUB_TOKEN environment variable is required.");
    data = await collect(LOGIN, token, new Date());
  }
  if (process.env.METRICS_DUMP) fs.writeFileSync(process.env.METRICS_DUMP, JSON.stringify(data, null, 2));

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  for (const [card, render] of Object.entries(CARDS)) {
    for (const [mode, theme] of Object.entries(THEMES)) {
      fs.writeFileSync(path.join(OUTPUT_DIR, `${card}-${mode}.svg`), render(data, theme));
    }
  }
  updateReadme(data);

  const t = data.totals;
  console.log(
    `metrics: ${t.contributions} contributions since ${t.firstYear}, ${data.languages.length} languages, ` +
      `${data.upstream.length} upstream repos, ${data.recentPrs.length} recent PRs written to ${README_PATH}`,
  );
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.stack || String(err));
    process.exit(1);
  });
}

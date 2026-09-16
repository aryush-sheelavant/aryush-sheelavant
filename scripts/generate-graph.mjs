// scripts/generate-graph.mjs
//
// Fetches the authenticated user's real GitHub contribution calendar via the
// GraphQL API, then generates three animated SVGs (runner / blob / tetris)
// using the real per-day colors instead of random data.
//
// Requires Node 18+ (built-in fetch). Reads config from environment:
//   GH_USERNAME   - GitHub username whose calendar to fetch (required)
//   GH_TOKEN      - token with access to read the user's contribution data (required)
//
// Usage: node scripts/generate-graph.mjs

const USERNAME = process.env.GH_USERNAME;
const TOKEN = process.env.GH_TOKEN;

if (!USERNAME || !TOKEN) {
  console.error("Missing GH_USERNAME or GH_TOKEN environment variables.");
  process.exit(1);
}

const CELL = 11;
const GAP = 3;
const PITCH = CELL + GAP;
const EMPTY_COLOR = "#161b22";

async function fetchContributions(username, token) {
  const query = `
    query($userName: String!) {
      user(login: $userName) {
        contributionsCollection {
          contributionCalendar {
            totalContributions
            weeks {
              contributionDays {
                date
                color
                contributionCount
              }
            }
          }
        }
      }
    }
  `;

  const res = await fetch("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables: { userName: username } }),
  });

  if (!res.ok) {
    throw new Error(`GitHub API request failed: ${res.status} ${await res.text()}`);
  }

  const json = await res.json();
  if (json.errors) {
    throw new Error(`GraphQL errors: ${JSON.stringify(json.errors)}`);
  }

  return json.data.user.contributionsCollection.contributionCalendar.weeks;
}

// Build a 7-row (Sun..Sat) x N-col (weeks) grid of hex colors from the raw API weeks.
function buildGrid(weeks) {
  const cols = weeks.length;
  const grid = Array.from({ length: 7 }, () => Array(cols).fill(EMPTY_COLOR));

  weeks.forEach((week, wi) => {
    week.contributionDays.forEach((day) => {
      const dow = new Date(`${day.date}T00:00:00Z`).getUTCDay(); // 0=Sun..6=Sat
      grid[dow][wi] = day.color || EMPTY_COLOR;
    });
  });

  return grid;
}

function svgHeader(w, h) {
  return `<svg viewBox="0 0 ${w} ${h}" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><rect width="${w}" height="${h}" fill="#0d1117"/>`;
}

// ---------- 1. Runner: hops along the top row, flashing cells as it passes ----------
function generateRunnerSVG(grid) {
  const rows = grid.length;
  const cols = grid[0].length;
  const leftPad = 20;
  const topPadGrid = 46;
  const runnerY = 20;
  const totalDur = Math.max(8, Math.round(cols / 5));

  const gridW = cols * PITCH - GAP;
  const gridH = rows * PITCH - GAP;
  const svgW = leftPad * 2 + gridW;
  const svgH = topPadGrid + gridH + 10;

  let out = svgHeader(svgW, svgH);

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = leftPad + c * PITCH;
      const y = topPadGrid + r * PITCH;
      const base = grid[r][c];
      if (r === 0) {
        const frac = c / cols;
        const t0 = Math.max(0, frac - 0.015).toFixed(4);
        const t1 = frac.toFixed(4);
        const t2 = Math.min(1, frac + 0.06).toFixed(4);
        const bright = "#7ee787";
        out += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${base}"><animate attributeName="fill" values="${base};${base};${bright};${base};${base}" keyTimes="0;${t0};${t1};${t2};1" dur="${totalDur}s" repeatCount="indefinite"/></rect>`;
      } else {
        out += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${base}"/>`;
      }
    }
  }

  const xStart = leftPad;
  const xEnd = leftPad + gridW;
  const runnerSvg = `
    <rect x="-6" y="-10" width="4" height="10" fill="#2b2b2b"><animate attributeName="height" values="10;4;10" keyTimes="0;0.5;1" dur="0.28s" repeatCount="indefinite"/><animate attributeName="y" values="-10;-4;-10" keyTimes="0;0.5;1" dur="0.28s" repeatCount="indefinite"/></rect>
    <rect x="2" y="-10" width="4" height="10" fill="#2b2b2b"><animate attributeName="height" values="4;10;4" keyTimes="0;0.5;1" dur="0.28s" repeatCount="indefinite"/><animate attributeName="y" values="-4;-10;-4" keyTimes="0;0.5;1" dur="0.28s" repeatCount="indefinite"/></rect>
    <rect x="-8" y="-24" width="16" height="16" rx="3" fill="#3fb950"/>
    <rect x="-6" y="-34" width="12" height="12" rx="2" fill="#e3b341"/>
    <rect x="-1" y="-38" width="2" height="4" fill="#e3b341"/>
    <circle cx="0" cy="-39" r="1.6" fill="#ff7b72"/>
    <rect x="-5" y="-31" width="10" height="4" rx="1" fill="#0d1117"/>
    <rect x="6" y="-22" width="4" height="9" rx="1" fill="#e3b341"/>
  `;
  out += `<g>${runnerSvg}<animateMotion dur="${totalDur}s" repeatCount="indefinite" path="M${xStart},${runnerY} L${xEnd},${runnerY} L${xStart},${runnerY}"/></g>`;
  out += "</svg>";
  return out;
}

// ---------- 2. Blob: sweeps the grid boustrophedon-style, absorbing colors ----------
function generateBlobSVG(grid) {
  const rows = grid.length;
  const cols = grid[0].length;
  const leftPad = 20;
  const topPad = 22;

  const gridW = cols * PITCH - GAP;
  const gridH = rows * PITCH - GAP;
  const svgW = leftPad * 2 + gridW;
  const svgH = topPad + gridH + 14;

  const pathCells = [];
  for (let r = 0; r < rows; r++) {
    const colRange = r % 2 === 0 ? [...Array(cols).keys()] : [...Array(cols).keys()].reverse();
    for (const c of colRange) pathCells.push([r, c]);
  }
  const n = pathCells.length;
  const totalDur = Math.max(10, Math.round(n / 18));

  const center = (r, c) => [leftPad + c * PITCH + CELL / 2, topPad + r * PITCH + CELL / 2];

  let out = svgHeader(svgW, svgH);

  pathCells.forEach(([r, c], idx) => {
    const x = leftPad + c * PITCH;
    const y = topPad + r * PITCH;
    const base = grid[r][c];
    const tHit = Math.min(0.999, Math.max(0.001, idx / n));
    const eps = 0.001;
    const kt = `0;${tHit.toFixed(4)};${Math.min(1, tHit + eps).toFixed(4)};1`;
    const vals = `${base};${base};${EMPTY_COLOR};${EMPTY_COLOR}`;
    out += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="3" fill="${base}"><animate attributeName="fill" values="${vals}" keyTimes="${kt}" dur="${totalDur}s" repeatCount="indefinite"/></rect>`;
  });

  const pts = pathCells.map(([r, c]) => center(r, c));
  const pathD = "M" + pts.map(([x, y]) => `${x.toFixed(1)},${y.toFixed(1)}`).join(" L");

  const colorKeytimes = [];
  const colorValues = [];
  pathCells.forEach(([r, c], idx) => {
    const tHit = idx / n;
    colorKeytimes.push(Math.max(0, tHit - 0.001).toFixed(4));
    colorValues.push(grid[r][c]);
  });
  colorKeytimes[0] = "0";
  colorKeytimes.push("1");
  colorValues.push(colorValues[colorValues.length - 1]);

  const blob = `
    <ellipse cx="0" cy="0" rx="${(CELL * 0.62).toFixed(1)}" ry="${(CELL * 0.62).toFixed(1)}" fill="${grid[0][0]}" fill-opacity="0.9" stroke="#ffffff" stroke-opacity="0.25" stroke-width="1">
      <animate attributeName="fill" values="${colorValues.join(";")}" keyTimes="${colorKeytimes.join(";")}" dur="${totalDur}s" repeatCount="indefinite"/>
      <animateTransform attributeName="transform" type="scale" values="1,1;1.25,0.75;0.85,1.15;1,1" keyTimes="0;0.3;0.6;1" dur="0.45s" repeatCount="indefinite" additive="sum"/>
    </ellipse>
    <circle cx="${(-CELL * 0.18).toFixed(1)}" cy="${(-CELL * 0.12).toFixed(1)}" r="1.3" fill="#0d1117"/>
    <circle cx="${(CELL * 0.18).toFixed(1)}" cy="${(-CELL * 0.12).toFixed(1)}" r="1.3" fill="#0d1117"/>
  `;

  out += `<g>${blob}<animateMotion dur="${totalDur}s" repeatCount="indefinite" path="${pathD}"/></g>`;
  out += "</svg>";
  return out;
}

// ---------- 3. Tetris: columns cascade in from the top with a bounce ----------
function generateTetrisSVG(grid) {
  const rows = grid.length;
  const cols = grid[0].length;
  const leftPad = 20;
  const topPad = 14;

  const gridW = cols * PITCH - GAP;
  const gridH = rows * PITCH - GAP;
  const svgW = leftPad * 2 + gridW;
  const svgH = topPad + gridH + 10;

  const totalDur = Math.max(8, cols * 0.12 + 3);
  const stagger = 0.12;
  const fallDur = 0.9;
  const dropHeight = topPad + gridH + 20;

  let out = svgHeader(svgW, svgH);

  for (let c = 0; c < cols; c++) {
    const x = leftPad + c * PITCH;
    const tStart = c * stagger;
    const tOver = tStart + fallDur * 0.45;
    const tBack = tStart + fallDur * 0.7;
    const tSettle = tStart + fallDur;

    const keytimes = [0, tStart / totalDur, tOver / totalDur, tBack / totalDur, tSettle / totalDur, 1].map((k) =>
      Math.max(0, Math.min(1, k)).toFixed(4)
    );
    const yVals = [-dropHeight, -dropHeight, 6, -3, 0, 0];
    const translateVals = yVals.map((v) => `0,${v.toFixed(2)}`).join(";");

    let rects = "";
    for (let r = 0; r < rows; r++) {
      const y = topPad + r * PITCH;
      rects += `<rect x="${x}" y="${y}" width="${CELL}" height="${CELL}" rx="2" fill="${grid[r][c]}"/>`;
    }

    out += `<g>${rects}<animateTransform attributeName="transform" type="translate" values="${translateVals}" keyTimes="${keytimes.join(";")}" dur="${totalDur}s" repeatCount="indefinite"/></g>`;
  }

  out += "</svg>";
  return out;
}

async function main() {
  console.log(`Fetching contribution calendar for ${USERNAME}...`);
  const weeks = await fetchContributions(USERNAME, TOKEN);
  const grid = buildGrid(weeks);
  console.log(`Built grid: ${grid.length} rows x ${grid[0].length} cols`);

  const fs = await import("fs");
  fs.mkdirSync("dist", { recursive: true });
  fs.writeFileSync("dist/runner.svg", generateRunnerSVG(grid));
  fs.writeFileSync("dist/blob.svg", generateBlobSVG(grid));
  fs.writeFileSync("dist/tetris.svg", generateTetrisSVG(grid));

  console.log("Wrote dist/runner.svg, dist/blob.svg, dist/tetris.svg");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

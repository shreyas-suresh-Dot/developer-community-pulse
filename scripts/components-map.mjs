// Writes public/components-map.svg: the Components Map of one Friday run (who does what at each
// stage), in the course's answer-key format. Rows are actors, columns are stages, dashed arrows are
// hand-offs (green dot = sender), and the orange dashed lane is the gate before anything reaches Sumit.
// Run: node scripts/components-map.mjs
import { writeFileSync } from "node:fs";

const COLUMNS = ["Trigger", "Input", "Context", "Processing", "AI", "Output"];
const [TRIGGER, INPUT, CONTEXT, PROCESSING, AI, OUTPUT] = COLUMNS.keys();

const ROWS = [
  { actor: "Vercel Cron", role: "(Scheduler)" },
  { actor: "Community APIs", role: "(HN · Stack Overflow · DEV)" },
  { actor: "Supabase", role: "(Topic config)" },
  { actor: "Pipeline code", role: "(Vercel Function)" },
  { actor: "Gemini Flash", role: "(Classify · Write)" },
  { actor: "Quality Gate", role: "(Code checks)", gate: true },
  { actor: "Sumit", role: "(PM)" },
];

const CARDS = {
  cron: { row: 0, col: TRIGGER, lines: ["Fires Friday 07:00 IST", "and starts the run", "(or Sumit: Run now)"] },
  fetch: { row: 1, col: INPUT, lines: ["Fetch 4 weeks of posts", "for every keyword & tag", "(each source isolated)"] },
  topics: { row: 2, col: CONTEXT, lines: ["Sumit's categories,", "keywords & context terms", "edited without code"] },
  count: { row: 3, col: PROCESSING, lines: ["Match keywords → threads", "Count per week + trend", "rules (numbers by code)"] },
  classify: { row: 4, col: PROCESSING, lines: ["Per thread: on-topic?", "category · pain point ·", "unresolved? (cached)"] },
  write: { row: 4, col: AI, lines: ["Writes pain points this", "vs last week, underserved,", "objections, sprint ideas"] },
  gate: { row: 5, col: OUTPUT, lines: ["Drops invented threads", "& non-verbatim quotes", "→ saves brief (Supabase)"] },
  deliver: { row: 6, col: OUTPUT, lines: ["Email (Resend) + web", "brief, every claim linked", "→ Monday sprint planning"] },
};

/**
 * [from, to, route]. elbow: out of the bottom, across, then down into the top. over: out of the right
 * edge, across, then down into the top. side: out of the bottom, down, then into the left edge.
 * down: straight down the same column. across: same row.
 */
const FLOWS = [
  ["cron", "fetch", "elbow"],
  ["fetch", "count", "over"],
  ["topics", "count", "over"],
  ["topics", "classify", "side"],
  ["count", "classify", "down"],
  ["classify", "write", "across"],
  ["write", "gate", "over"],
  ["gate", "deliver", "down"],
];

/** Card colours follow the stage, as in the answer key: AI steps stand out in pink. */
const STAGE_TONES = [
  { fill: "#ffffff", line: "#3b82f6" },
  { fill: "#ffffff", line: "#3b82f6" },
  { fill: "#ffffff", line: "#4caf50" },
  { fill: "#eef8e9", line: "#5cb85c" },
  { fill: "#fbeef6", line: "#b0538a" },
  { fill: "#f1faec", line: "#5cb85c" },
];

const M = 48;
const ACTOR_W = 200;
const COL_W = 216;
const HEAD_H = 56;
const ROW_H = 104;
const CARD_W = 194;
const CARD_H = 76;
const TABLE_X = M;
const TABLE_Y = 84;
const TABLE_W = ACTOR_W + COL_W * COLUMNS.length;
const TABLE_H = HEAD_H + ROW_H * ROWS.length;
const W = TABLE_W + 2 * M;
const H = TABLE_Y + TABLE_H + 96;
const FONT = "Arial, Helvetica, sans-serif";
const HEADER = "#3f55a0";
const ACTOR_HEADER = "#6c6992";
const ACTOR_CELL = "#77749b";
const ARROW = "#6b7fa8";
const GATE = "#f97316";

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const rowY = (r) => TABLE_Y + HEAD_H + r * ROW_H;
const colX = (c) => TABLE_X + ACTOR_W + c * COL_W;
const box = (id) => {
  const { row, col } = CARDS[id];
  const x = colX(col) + (COL_W - CARD_W) / 2;
  const y = rowY(row) + (ROW_H - CARD_H) / 2;
  return { x, y, cx: x + CARD_W / 2, cy: y + CARD_H / 2, right: x + CARD_W, bottom: y + CARD_H };
};

const out = [];
out.push(
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-labelledby="map-title map-desc" font-family="${FONT}">`,
  `<title id="map-title">Developer Community Pulse · Sumit — Components Map</title>`,
  `<desc id="map-desc">Every Friday at 07:00 IST Vercel Cron (or Sumit, with a passcode) starts a run. Hacker News, Stack Overflow and DEV supply four weeks of posts and Supabase supplies Sumit's topic config. Pipeline code matches keywords into threads and counts them per week with fixed trend rules. Gemini Flash classifies each thread, then writes pain points, underserved problems, objections and sprint ideas. A code quality gate drops invented threads and quotes that are not verbatim and saves the brief in Supabase; Sumit gets it by email and on the dashboard.</desc>`,
  `<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0L10 5L0 10z" fill="${ARROW}"/></marker></defs>`,
  `<rect width="${W}" height="${H}" fill="#ffffff"/>`,
  `<text x="${W / 2}" y="52" text-anchor="middle" font-size="22" font-weight="600" fill="#334155">Developer Community Pulse · Sumit — Components Map</text>`,
);

// Body, grid, header and actor column.
out.push(`<rect x="${colX(0)}" y="${rowY(0)}" width="${COL_W * COLUMNS.length}" height="${ROW_H * ROWS.length}" fill="#f3f7fd"/>`);
for (let c = 1; c < COLUMNS.length; c++) {
  out.push(`<line x1="${colX(c)}" y1="${rowY(0)}" x2="${colX(c)}" y2="${rowY(ROWS.length)}" stroke="#e1e8f4"/>`);
}
for (let r = 1; r < ROWS.length; r++) {
  out.push(`<line x1="${colX(0)}" y1="${rowY(r)}" x2="${colX(COLUMNS.length)}" y2="${rowY(r)}" stroke="#e1e8f4"/>`);
}
out.push(`<rect x="${TABLE_X}" y="${TABLE_Y}" width="${ACTOR_W}" height="${HEAD_H}" fill="${ACTOR_HEADER}"/>`);
out.push(`<rect x="${colX(0)}" y="${TABLE_Y}" width="${COL_W * COLUMNS.length}" height="${HEAD_H}" fill="${HEADER}"/>`);
out.push(`<text x="${TABLE_X + ACTOR_W / 2}" y="${TABLE_Y + 34}" text-anchor="middle" font-size="15" font-weight="700" fill="#ffffff">Actor</text>`);
COLUMNS.forEach((label, c) => {
  if (c > 0) out.push(`<line x1="${colX(c)}" y1="${TABLE_Y}" x2="${colX(c)}" y2="${TABLE_Y + HEAD_H}" stroke="#ffffff" stroke-opacity="0.35"/>`);
  out.push(`<text x="${colX(c) + COL_W / 2}" y="${TABLE_Y + 34}" text-anchor="middle" font-size="15" font-weight="700" fill="#ffffff">${label}</text>`);
});
ROWS.forEach((row, r) => {
  out.push(`<rect x="${TABLE_X}" y="${rowY(r)}" width="${ACTOR_W}" height="${ROW_H}" fill="${ACTOR_CELL}" stroke="#ffffff" stroke-width="2"/>`);
  const cy = rowY(r) + ROW_H / 2;
  out.push(`<text x="${TABLE_X + ACTOR_W / 2}" y="${cy - 3}" text-anchor="middle" font-size="15" font-weight="700" fill="#ffffff">${esc(row.actor)}</text>`);
  out.push(`<text x="${TABLE_X + ACTOR_W / 2}" y="${cy + 17}" text-anchor="middle" font-size="12.5" fill="#e4e2f3">${esc(row.role)}</text>`);
});

// The gate lane: nothing reaches Sumit without passing it.
ROWS.forEach((row, r) => {
  if (!row.gate) return;
  out.push(`<rect x="${colX(0) + 3}" y="${rowY(r) + 3}" width="${COL_W * COLUMNS.length - 6}" height="${ROW_H - 6}" rx="4" fill="none" stroke="${GATE}" stroke-width="1.8" stroke-dasharray="7 5"/>`);
});

// Cards.
for (const [id, c] of Object.entries(CARDS)) {
  const b = box(id);
  const tone = STAGE_TONES[c.col];
  out.push(`<rect x="${b.x}" y="${b.y}" width="${CARD_W}" height="${CARD_H}" rx="8" fill="${tone.fill}" stroke="${tone.line}" stroke-width="1.8"/>`);
  const lineH = 18;
  const top = b.cy - ((c.lines.length - 1) * lineH) / 2 + 5;
  c.lines.forEach((line, i) => {
    out.push(`<text x="${b.cx}" y="${top + i * lineH}" text-anchor="middle" font-size="13.5" fill="#334155">${esc(line)}</text>`);
  });
}

// Hand-offs. Arrows that land on the same card's top sit side by side, the higher sender further
// right, so their lines never cross.
const landings = new Map();
for (const [from, to, route] of FLOWS) {
  if (route === "over") landings.set(to, [...(landings.get(to) ?? []), from]);
}
const landX = (from, to) => {
  const senders = [...landings.get(to)].sort((a, b) => CARDS[a].row - CARDS[b].row);
  if (senders.length === 1) return box(to).cx;
  return box(to).cx + 24 - (48 * senders.indexOf(from)) / (senders.length - 1);
};
for (const [from, to, route] of FLOWS) {
  const a = box(from);
  const b = box(to);
  let start;
  let d;
  if (route === "elbow") {
    start = [a.cx, a.bottom];
    const midY = (a.bottom + b.y) / 2;
    d = `M${a.cx} ${a.bottom}V${midY}H${b.cx}V${b.y - 1}`;
  } else if (route === "over") {
    start = [a.right, a.cy];
    const x = landX(from, to);
    d = `M${a.right} ${a.cy}H${x}V${b.y - 1}`;
  } else if (route === "side") {
    start = [a.cx, a.bottom];
    d = `M${a.cx} ${a.bottom}V${b.cy}H${b.x - 1}`;
  } else if (route === "down") {
    start = [a.cx, a.bottom];
    d = `M${a.cx} ${a.bottom}V${b.y - 1}`;
  } else {
    start = [a.right, a.cy];
    d = `M${a.right} ${a.cy}H${b.x - 1}`;
  }
  out.push(`<path d="${d}" fill="none" stroke="${ARROW}" stroke-width="1.6" stroke-dasharray="5 4" marker-end="url(#arrow)"/>`);
  out.push(`<circle cx="${start[0]}" cy="${start[1]}" r="4" fill="#22c55e" stroke="#ffffff" stroke-width="1.5"/>`);
}

const noteY = TABLE_Y + TABLE_H + 36;
out.push(
  `<text x="${W / 2}" y="${noteY}" text-anchor="middle" font-size="13" fill="#475569">Every AI step uses Gemini Flash (gemini-3.6-flash → gemini-3-flash-preview → gemini-3.5-flash-lite fallback). Numbers come from code, words from the AI.</text>`,
  `<text x="${W / 2}" y="${noteY + 21}" text-anchor="middle" font-size="13" fill="#475569">If Gemini is unavailable, a keyword-only brief still ships, marked partial. If a source fails, the others carry on and the brief names it.</text>`,
);
out.push(`</svg>`);

writeFileSync(new URL("../public/components-map.svg", import.meta.url), `${out.join("\n")}\n`);
console.log(`public/components-map.svg written (${W}x${H})`);

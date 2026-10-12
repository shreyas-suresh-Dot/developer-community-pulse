import "server-only";
import type { BriefRecord, Delivery, PainPoint, Trend } from "../contracts";
import { appUrl, emailEnv } from "../env";
import { formatFriday } from "../weeks";

/*
 * Delivery step: emails the brief through Resend's HTTP API (no SDK needed). It never throws — a failed
 * or unconfigured email is recorded on the brief, and the brief is always published on the dashboard.
 * Everything interpolated into the HTML is escaped: summaries can quote community posts.
 */

const RESEND_URL = "https://api.resend.com/emails";
const TIMEOUT_MS = 10_000;
const TOP_PAIN_POINTS = 5;
const TOP_UNDERSERVED = 3;

const TREND_WORD: Record<Trend, string> = {
  new: "new this week",
  rising: "rising",
  steady: "steady",
  falling: "falling",
  quiet: "low volume",
};

export type DeliverOptions = {
  /** False for backfills and past weeks: the brief is stored but nobody is emailed. */
  send: boolean;
  /** Shown on the brief when send is false. */
  reason?: string;
};

export async function deliverBrief(brief: BriefRecord, options: DeliverOptions): Promise<Delivery> {
  const web = (detail: string): Delivery => ({ channel: "web", status: "skipped", to: [], at: null, detail });
  if (!options.send) return web(options.reason ?? "Email not sent for this run; brief published on the dashboard.");

  const env = emailEnv();
  if (!env) return web("Email not configured; brief published on the dashboard.");

  const link = `${appUrl()}/briefs/${brief.weekEnd}`;
  try {
    const res = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${env.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: env.from,
        to: env.to,
        subject: subject(brief),
        html: renderHtml(brief, link),
        text: renderText(brief, link),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
    if (!res.ok) {
      return { channel: "email", status: "failed", to: env.to, at: null, detail: `Resend ${res.status}: ${body.message ?? res.statusText}` };
    }
    return { channel: "email", status: "sent", to: env.to, at: new Date().toISOString(), detail: body.id ? `Resend id ${body.id}` : null };
  } catch (e) {
    const detail = e instanceof Error ? (e.name === "TimeoutError" ? "Resend did not answer within 10 s" : e.message) : String(e);
    return { channel: "email", status: "failed", to: env.to, at: null, detail };
  }
}

export function subject(brief: BriefRecord): string {
  const headline = brief.analysis?.headline.trim() ?? "";
  const short = headline.length > 90 ? `${headline.slice(0, 87).trimEnd()}…` : headline;
  return `Community Pulse · week ending ${formatFriday(brief.weekEnd)}${short ? ` · ${short}` : ""}`;
}

function countLine(p: PainPoint): string {
  const { current, previous, trend } = p.change;
  return `${current} thread${current === 1 ? "" : "s"} this week vs ${previous} last week (${TREND_WORD[trend]})`;
}

const escape = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

export function renderHtml(brief: BriefRecord, link: string): string {
  const { analysis, stats } = brief;
  const week = stats.weeks[3];
  const pains = analysis?.painPoints.slice(0, TOP_PAIN_POINTS) ?? [];
  const gaps = analysis?.underserved.slice(0, TOP_UNDERSERVED) ?? [];
  const fallback = analysis?.mode === "fallback";

  const painItems = pains
    .map(
      (p) => `<li style="margin:0 0 14px">
  <div style="font-weight:600;color:#191814">${escape(p.title)}${p.unresolved ? ` <span style="font-weight:500;color:#a3261f">· unresolved</span>` : ""}</div>
  <div style="font-size:13px;color:#4a473f;margin:2px 0 4px">${escape(countLine(p))}</div>
  <div style="font-size:14px;color:#191814">${escape(p.summary)}</div>
</li>`,
    )
    .join("");
  const gapItems = gaps
    .map(
      (g) => `<li style="margin:0 0 10px"><strong>${escape(g.problem)}</strong><br><span style="color:#4a473f">${escape(g.opportunity || g.whyUnderserved)}</span></li>`,
    )
    .join("");

  return `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f8f6f1;font-family:Georgia,'Times New Roman',serif;color:#191814">
<div style="max-width:600px;margin:0 auto;background:#fffdf9;border:1px solid #e3dfd4;border-radius:12px;padding:28px">
  <p style="margin:0 0 6px;font:600 11px/1.4 Arial,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:#2d45c8">Community Pulse · weekly brief</p>
  <h1 style="margin:0 0 4px;font-size:26px;font-weight:500">${escape(week.label)}</h1>
  <p style="margin:0 0 18px;font:13px Arial,sans-serif;color:#6b675e">Week ending ${escape(formatFriday(brief.weekEnd))} · Hacker News, Stack Overflow, DEV</p>
  ${fallback ? `<p style="margin:0 0 16px;padding:10px 12px;background:#fbefd3;border-radius:8px;font:13px Arial,sans-serif;color:#7a5200">The AI summary was unavailable this week, so this brief is built from keyword signals only.</p>` : ""}
  <p style="margin:0 0 22px;font-size:18px;line-height:1.45">${escape(analysis?.headline ?? "No summary available.")}</p>
  <h2 style="margin:0 0 10px;font:600 15px Arial,sans-serif">Top pain points</h2>
  ${pains.length ? `<ol style="margin:0 0 20px;padding-left:20px;font-family:Arial,sans-serif">${painItems}</ol>` : `<p style="font:14px Arial,sans-serif;color:#4a473f">No clear pain points this week.</p>`}
  ${gaps.length ? `<h2 style="margin:0 0 10px;font:600 15px Arial,sans-serif">Unresolved &amp; underserved</h2><ul style="margin:0 0 20px;padding-left:20px;font:14px Arial,sans-serif">${gapItems}</ul>` : ""}
  <p style="margin:24px 0"><a href="${escape(link)}" style="display:inline-block;background:#2d45c8;color:#fff;text-decoration:none;padding:11px 18px;border-radius:8px;font:600 14px Arial,sans-serif">Read the full brief, with every source thread →</a></p>
  <p style="margin:0;font:12px/1.5 Arial,sans-serif;color:#6b675e">Numbers are computed by code from public posts; summaries are written by Gemini and every claim links to the threads behind it.</p>
</div>
</body></html>`;
}

export function renderText(brief: BriefRecord, link: string): string {
  const { analysis, stats } = brief;
  const lines = [
    `Community Pulse · ${stats.weeks[3].label} (week ending ${formatFriday(brief.weekEnd)})`,
    "",
    analysis?.headline ?? "No summary available.",
    "",
    "Top pain points:",
    ...(analysis?.painPoints.slice(0, TOP_PAIN_POINTS).map((p, i) => `${i + 1}. ${p.title} - ${countLine(p)}\n   ${p.summary}`) ?? ["(none)"]),
  ];
  const gaps = analysis?.underserved.slice(0, TOP_UNDERSERVED) ?? [];
  if (gaps.length) lines.push("", "Unresolved & underserved:", ...gaps.map((g) => `- ${g.problem}: ${g.opportunity || g.whyUnderserved}`));
  lines.push("", `Full brief: ${link}`);
  return lines.join("\n");
}

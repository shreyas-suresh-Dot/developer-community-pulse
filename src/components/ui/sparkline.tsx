import { formatCount } from "@/lib/format";

/*
 * Four-week sparkline. Follows the data-viz spec: a 2px de-emphasised line from a zero baseline (so a
 * move from 31 to 36 looks as small as it is), the current week as an 8px accent dot with a 2px surface
 * ring, and a CSS-only hover layer (crosshair + readout per week). Values are also given as text for
 * screen readers, and each section offers a table view, so the hover never gates a number.
 */

type Props = {
  values: readonly number[];
  /** One label per value, e.g. "2 – 8 Oct". */
  labels: readonly string[];
  /** What is counted, e.g. "threads" — used in the readout and the accessible summary. */
  unit: string;
  width?: number;
  height?: number;
  /** Colour behind the sparkline, for the end-dot ring. */
  ring?: string;
};

export function Sparkline({ values, labels, unit, width = 88, height = 28, ring = "var(--surface)" }: Props) {
  const n = values.length;
  if (n === 0) return null;
  const pad = 5;
  const max = Math.max(1, ...values);
  const x = (i: number) => (n === 1 ? width / 2 : pad + (i * (width - 2 * pad)) / (n - 1));
  const y = (v: number) => height - pad - (v / max) * (height - 2 * pad);
  const points = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const last = n - 1;
  const edges = values.map((_, i) => ({
    left: i === 0 ? 0 : (x(i - 1) + x(i)) / 2,
    right: i === last ? width : (x(i) + x(i + 1)) / 2,
  }));

  const summary = `${unit} per week, oldest to newest: ${values.map((v, i) => `${labels[i] ?? `week ${i + 1}`}: ${v}`).join(", ")}`;

  return (
    <span className="spark" style={{ width, height }} role="img" aria-label={summary}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} aria-hidden="true" focusable="false" className="overflow-visible">
        <line x1={0} x2={width} y1={y(0)} y2={y(0)} stroke="var(--rule)" strokeWidth={1} />
        <polyline points={points} fill="none" stroke="var(--mark-muted)" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
        <circle cx={x(last)} cy={y(values[last])} r={4} fill="var(--accent)" stroke={ring} strokeWidth={2} />
      </svg>
      <span aria-hidden="true">
        {values.map((v, i) => {
          const { left, right } = edges[i];
          const tipSide = i === 0 ? { left: 0 } : i === last ? { right: 0 } : { left: "50%", transform: "translateX(-50%)" };
          return (
            <span key={i} className="spark-band" style={{ left, width: right - left }}>
              <span className="spark-hair" style={{ left: x(i) - left }} />
              <span className="spark-tip" style={tipSide}>
                {labels[i]} · <strong>{formatCount(v)}</strong> {unit}
              </span>
            </span>
          );
        })}
      </span>
    </span>
  );
}

import { fmt, profilePoints, type BendResult, type Item } from "@/lib/pli";

export function ProfileSvg({
  items,
  selected,
  onSelect,
}: {
  items: Item[];
  selected: number | null;
  onSelect: (i: number) => void;
}) {
  const pts = profilePoints(items);
  const xs = pts.map((p) => p.x);
  const ys = pts.map((p) => -p.y);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const span = Math.max(maxX - minX, maxY - minY, 20);
  const pad = span * 0.14;
  const fs = span * 0.038;
  const vb = `${minX - pad} ${minY - pad} ${maxX - minX + 2 * pad} ${maxY - minY + 2 * pad}`;

  return (
    <svg viewBox={vb} className="w-full h-[360px] lg:h-[460px]" role="img" aria-label="Aperçu du profil">
      {items.map((it, i) => {
        const a = pts[i], b = pts[i + 1];
        const x1 = a.x, y1 = -a.y, x2 = b.x, y2 = -b.y;
        const len = Math.hypot(x2 - x1, y2 - y1) || 1;
        // normale côté gauche du sens de parcours (repère écran)
        const nx = (y2 - y1) / len, ny = -(x2 - x1) / len;
        const off = fs * 1.4;
        const mx = (x1 + x2) / 2 + nx * off, my = (y1 + y2) / 2 + ny * off;
        const sel = selected === i;
        return (
          <g key={it.id} className="cursor-pointer" onClick={() => onSelect(i)}>
            <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="transparent" strokeWidth={fs * 1.6} />
            <line
              x1={x1} y1={y1} x2={x2} y2={y2}
              className={sel ? "stroke-primary" : "stroke-heading"}
              strokeWidth={sel ? 4 : 2.5}
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
            />
            <text
              x={mx} y={my} fontSize={fs} textAnchor="middle" dominantBaseline="middle"
              className={`font-mono ${sel ? "fill-primary" : "fill-muted-foreground"}`}
            >
              {fmt(it.length, 1)}
            </text>
          </g>
        );
      })}
      {pts.slice(1, -1).map((p, i) =>
        items[i].angle ? (
          <circle key={i} cx={p.x} cy={-p.y} r={fs * 0.22} className="fill-primary" />
        ) : null,
      )}
      <circle cx={pts[0].x} cy={-pts[0].y} r={fs * 0.3} className="fill-card stroke-heading" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

export function FlatSvg({ total, bends }: { total: number; bends: BendResult[] }) {
  if (!(total > 0)) return null;
  const W = total;
  const H = W * 0.12;
  const fs = W * 0.024;
  const pad = W * 0.04;
  const stops = [0, ...bends.filter((b) => b.angle > 0).map((b) => b.position), W];
  return (
    <svg viewBox={`${-pad} ${-fs * 3.5} ${W + 2 * pad} ${H + fs * 7}`} className="w-full h-auto" role="img" aria-label="Vue à plat">
      <rect x={0} y={0} width={W} height={H} className="fill-primary-soft stroke-primary" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
      {bends.filter((b) => b.angle > 0).map((b) => (
        <g key={b.index}>
          <line x1={b.position} y1={0} x2={b.position} y2={H} className="stroke-primary" strokeWidth={1.5} strokeDasharray="6 4" vectorEffect="non-scaling-stroke" />
          <text x={b.position} y={H + fs * 1.4} fontSize={fs * 0.9} textAnchor="middle" className="fill-heading font-mono">
            {b.dir === "G" ? "↑" : "↓"} {fmt(180 - b.angle, 1)}°
          </text>
          <text x={b.position} y={H + fs * 2.6} fontSize={fs * 0.75} textAnchor="middle" className="fill-muted-foreground">
            {b.dir === "G" ? "haut" : "bas"}
          </text>
        </g>
      ))}
      {stops.slice(0, -1).map((s, i) => (
        <text key={i} x={(s + stops[i + 1]) / 2} y={-fs * 0.8} fontSize={fs * 0.9} textAnchor="middle" className="fill-muted-foreground font-mono">
          {fmt(stops[i + 1] - s, 1)}
        </text>
      ))}
    </svg>
  );
}

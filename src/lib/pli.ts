// Cœur de calcul "Pli" : géométrie du profil, pertes au pli, facteur K.

export type Dir = "G" | "D";
export interface Item {
  id: string;
  length: number;
  angle: number; // angle du pli APRÈS ce segment (ignoré pour le dernier)
  dir: Dir;
}
export interface Profile {
  id: string;
  name: string;
  items: Item[];
  thickness: number;
  material: string;
  coteMode: "ext" | "int";
  method: "perte" | "k";
  radius: number;
  k: number;
}
export interface LossRow {
  material: string;
  thickness: number;
  angle: number | null;
  loss: number;
}

export interface BendResult {
  index: number;
  angle: number;
  dir: Dir;
  loss: number;
  source: "table" | "extrapolee" | "k";
  position: number;
}
export interface CalcResult {
  ok: boolean;
  error?: string;
  total: number;
  totalRounded: number;
  outerDims: number[];
  bends: BendResult[];
  warnings: string[];
}

export const uid = () => Math.random().toString(36).slice(2, 10);

export const round05 = (x: number) => Math.round(x * 2) / 2;

/** Retrait extérieur (cote extérieure -> tangente du pli) */
export function ossb(angle: number, r: number, e: number) {
  if (angle <= 0) return 0;
  if (angle <= 90) return (r + e) * Math.tan((angle * Math.PI) / 360);
  return r + e;
}
/** Longueur de pli sur la fibre neutre */
export function bendAllowance(angle: number, r: number, e: number, k: number) {
  return (Math.PI * (r + k * e) * angle) / 180;
}
/** Perte au pli théorique (cotes extérieures) */
export function lossFromK(angle: number, r: number, e: number, k: number) {
  if (angle <= 0) return 0;
  return 2 * ossb(angle, r, e) - bendAllowance(angle, r, e, k);
}
/** K équivalent à partir d'une perte mesurée à 90° (rayon intérieur = épaisseur) */
export function kFromLoss90(loss90: number, e: number) {
  const r = e;
  return ((2 * ossb(90, r, e) - loss90) / (Math.PI / 2) - r) / e;
}

const eq = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const norm = (s: string) => s.trim().toLowerCase();

export function findLoss(table: LossRow[], material: string, e: number, angle: number) {
  return table.find(
    (r) => norm(r.material) === norm(material) && eq(r.thickness, e) && eq(r.angle ?? 90, angle),
  );
}

export function compute(p: Profile, table: LossRow[]): CalcResult {
  const e = p.thickness;
  const n = p.items.length;
  const warnings: string[] = [];
  const empty = { total: 0, totalRounded: 0, outerDims: [], bends: [], warnings };
  if (n === 0) return { ok: false, error: "Le profil est vide.", ...empty };
  if (!(e > 0)) return { ok: false, error: "L'épaisseur doit être supérieure à 0.", ...empty };

  const angles = p.items.slice(0, n - 1).map((it) => it.angle);
  for (const a of angles) {
    if (a < 0 || a > 180)
      return { ok: false, error: `Angle ${a}° hors plage (0 à 180°).`, ...empty };
  }

  const r = p.method === "k" ? p.radius : e;
  const outerDims = p.items.map((it, i) => {
    if (p.coteMode === "ext") return it.length;
    let d = it.length;
    if (i > 0) d += ossb(angles[i - 1], r, e) - ossb(angles[i - 1], r, 0);
    if (i < n - 1) d += ossb(angles[i], r, e) - ossb(angles[i], r, 0);
    return d;
  });

  const losses: { loss: number; source: BendResult["source"] }[] = [];
  for (let i = 0; i < angles.length; i++) {
    const a = angles[i];
    if (a === 0) {
      losses.push({ loss: 0, source: p.method === "k" ? "k" : "table" });
      continue;
    }
    if (p.method === "k") {
      losses.push({ loss: lossFromK(a, p.radius, e, p.k), source: "k" });
      continue;
    }
    const exact = findLoss(table, p.material, e, a);
    if (exact) {
      losses.push({ loss: exact.loss, source: "table" });
      continue;
    }
    const at90 = findLoss(table, p.material, e, 90);
    if (!at90) {
      return {
        ok: false,
        error: `Aucune perte au pli dans la table pour ${p.material} ${fmt(e)} mm. Ajoutez au moins la valeur à 90° dans la table des pertes.`,
        ...empty,
      };
    }
    const k = kFromLoss90(at90.loss, e);
    losses.push({ loss: lossFromK(a, e, e, k), source: "extrapolee" });
  }

  // Avertissements ourlets
  angles.forEach((a, i) => {
    if (a === 180) {
      const next = p.items[i + 1]?.length ?? 0;
      if (next < 3 * e)
        warnings.push(`Ourlet au pli ${i + 1} : retour de ${fmt(next)} mm trop court (min. ≈ ${fmt(3 * e)} mm).`);
      if (i > 0 && angles[i - 1] === 180)
        warnings.push(`Plis ${i} et ${i + 1} : deux ourlets consécutifs, vérifiez le profil.`);
    }
  });
  p.items.forEach((it, i) => {
    if (!(it.length > 0)) warnings.push(`Segment ${i + 1} : longueur nulle ou négative.`);
  });

  let cum = 0;
  let cumLoss = 0;
  const bends: BendResult[] = losses.map((l, i) => {
    cum += outerDims[i];
    const position = cum - cumLoss - l.loss / 2;
    cumLoss += l.loss;
    return { index: i, angle: angles[i], dir: p.items[i].dir, loss: l.loss, source: l.source, position };
  });

  const total = outerDims.reduce((s, d) => s + d, 0) - cumLoss;
  return { ok: true, total, totalRounded: round05(total), outerDims, bends, warnings };
}

export function fmt(x: number, d = 2) {
  return Number(x.toFixed(d)).toLocaleString("fr-FR", { maximumFractionDigits: d });
}

/** Nombre saisi façon Excel : virgule ou point, apostrophe suisse, espaces */
export function parseNum(s: string): number {
  const c = s.replace(/['’\s\u00a0]/g, "").replace(",", ".");
  if (c === "") return NaN;
  return Number(c);
}

export function parseLossTable(text: string): { rows: LossRow[]; errors: string[] } {
  const rows: LossRow[] = [];
  const errors: string[] = [];
  text.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const cols = line.split(/\t|;/).map((c) => c.trim());
    if (cols.length < 3) {
      errors.push(`Ligne ${i + 1} : colonnes insuffisantes.`);
      return;
    }
    let [mat, ep, ang, loss] = cols;
    if (cols.length === 3) {
      loss = ang;
      ang = "";
    }
    const t = parseNum(ep);
    const l = parseNum(loss);
    const a = ang === "" ? null : parseNum(ang);
    if (isNaN(t) || isNaN(l) || (a !== null && isNaN(a))) {
      if (i === 0) return; // ligne d'en-tête
      errors.push(`Ligne ${i + 1} : valeur numérique illisible.`);
      return;
    }
    rows.push({ material: mat, thickness: t, angle: a, loss: l });
  });
  return { rows, errors };
}

/** Points du profil (repère mathématique, y vers le haut) */
export function profilePoints(items: Item[]) {
  const pts = [{ x: 0, y: 0 }];
  let h = 0;
  items.forEach((it, i) => {
    const p = pts[pts.length - 1];
    pts.push({ x: p.x + it.length * Math.cos(h), y: p.y + it.length * Math.sin(h) });
    if (i < items.length - 1) h += ((it.dir === "G" ? 1 : -1) * it.angle * Math.PI) / 180;
  });
  return pts;
}

/** Conversion d'une polyligne (sommets + bulges) en segments + plis */
export function polylineToItems(verts: { x: number; y: number; bulge?: number }[]): Item[] {
  const sharp: { x: number; y: number }[] = [];
  for (let i = 0; i < verts.length; i++) {
    const v = verts[i];
    const prevBulge = i > 0 ? verts[i - 1].bulge ?? 0 : 0;
    const b = v.bulge ?? 0;
    const hasArc = b !== 0 && i < verts.length - 1 && i > 0 && i < verts.length - 2;
    const prevArc = prevBulge !== 0 && i - 1 > 0 && i < verts.length - 1;
    if (prevArc) continue;
    if (hasArc) {
      const w = verts[i + 1];
      const dx = w.x - v.x;
      const dy = w.y - v.y;
      const c = Math.hypot(dx, dy);
      const th = 4 * Math.atan(Math.abs(b));
      const dist = (c / 2) * Math.tan(th / 2);
      const s = b > 0 ? 1 : -1;
      sharp.push({ x: (v.x + w.x) / 2 + (s * dy * dist) / c, y: (v.y + w.y) / 2 - (s * dx * dist) / c });
    } else sharp.push({ x: v.x, y: v.y });
  }
  const items: Item[] = [];
  for (let i = 0; i < sharp.length - 1; i++) {
    const a = sharp[i];
    const b = sharp[i + 1];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    let angle = 0;
    let dir: Dir = "G";
    if (i < sharp.length - 2) {
      const c = sharp[i + 2];
      const u = { x: b.x - a.x, y: b.y - a.y };
      const w = { x: c.x - b.x, y: c.y - b.y };
      const cross = u.x * w.y - u.y * w.x;
      const dot = u.x * w.x + u.y * w.y;
      angle = Math.round(((Math.abs(Math.atan2(cross, dot)) * 180) / Math.PI) * 10) / 10;
      dir = cross >= 0 ? "G" : "D";
    }
    items.push({ id: uid(), length: Math.round(len * 100) / 100, angle, dir });
  }
  return items.filter((it) => it.length > 1e-6);
}

export const DEFAULT_MATERIALS = ["Alu", "Acier", "Inox", "Zinc", "Cuivre"];

export const DEFAULT_TABLE: LossRow[] = [
  { material: "Alu", thickness: 1, angle: null, loss: 1.8 },
  { material: "Alu", thickness: 1.5, angle: null, loss: 2.7 },
  { material: "Alu", thickness: 2, angle: null, loss: 3.5 },
  { material: "Alu", thickness: 3, angle: null, loss: 5.3 },
  { material: "Acier", thickness: 1, angle: null, loss: 1.9 },
  { material: "Acier", thickness: 1.5, angle: null, loss: 2.8 },
  { material: "Acier", thickness: 2, angle: null, loss: 3.8 },
  { material: "Inox", thickness: 1, angle: null, loss: 2 },
  { material: "Inox", thickness: 1.5, angle: null, loss: 3 },
  { material: "Zinc", thickness: 0.65, angle: null, loss: 1.2 },
  { material: "Zinc", thickness: 0.8, angle: null, loss: 1.4 },
  { material: "Cuivre", thickness: 0.6, angle: null, loss: 1.1 },
  { material: "Cuivre", thickness: 0.8, angle: null, loss: 1.4 },
];

export function newProfile(): Profile {
  return {
    id: uid(),
    name: "Couvertine 300 alu 2 mm",
    items: [
      { id: uid(), length: 50, angle: 90, dir: "D" },
      { id: uid(), length: 300, angle: 90, dir: "D" },
      { id: uid(), length: 80, angle: 0, dir: "G" },
    ],
    thickness: 2,
    material: "Alu",
    coteMode: "ext",
    method: "perte",
    radius: 2,
    k: 0.33,
  };
}

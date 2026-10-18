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

/**
 * L'atelier parle en ANGLE INTERIEUR (90 = equerre, 135 = pli ouvert, 0 = ourlet).
 * En interne, Pli calcule avec l'angle de PLIAGE (deviation : 0 = pas de pli,
 * 90 = equerre, 180 = ourlet). Conversion dans les deux sens : interieur = 180 - pliage.
 */
export const toInterior = (bendAngle: number) => 180 - bendAngle;
export const fromInterior = (interior: number) => 180 - interior;

const eq = (a: number, b: number) => Math.abs(a - b) < 1e-6;
const norm = (s: string) => s.trim().toLowerCase();

export function findLoss(table: LossRow[], material: string, e: number, angle: number) {
  return table.find(
    // r.angle est saisi en angle INTERIEUR dans la table (vide = 90°) ; angle = angle de pliage
    (r) => norm(r.material) === norm(material) && eq(r.thickness, e) && eq(fromInterior(r.angle ?? 90), angle),
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
      return { ok: false, error: `Angle intérieur ${fmt(toInterior(a))}° hors plage (0 à 180°).`, ...empty };
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
    if (a >= 180) {
      // Ourlet : l'extrapolation depuis 90° n'est pas fiable (elle peut meme donner
      // une perte negative), on exige une vraie valeur d'atelier
      return {
        ok: false,
        error: `Pas de perte pour un ourlet en ${p.material} ${fmt(e)} mm. Ajoutez cette valeur dans la table des pertes (angle intérieur 0).`,
        ...empty,
      };
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

/** Nombre pour Excel : virgule decimale, SANS separateur de milliers (sinon Excel le lit comme du texte). */
export function fmtExcel(x: number, d = 2) {
  return String(Number(x.toFixed(d))).replace(".", ",");
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

/**
 * Conversion d'une polyligne (sommets + bulges) en segments + plis, selon la regle
 * de cotation de l'atelier :
 *  - pli ouvert (<= 90°) : cote jusqu'a l'INTERSECTION des faces ;
 *  - pli ferme (> 90°, ourlet compris) : cote jusqu'au BORD de la tole.
 * Un pli dessine avec un arc (conge) ajoute donc a chaque segment voisin
 * R x tan(angle/2) s'il est ouvert, ou seulement R s'il est ferme (R = rayon de
 * l'arc, donc de la face dessinee). Un coin vif n'ajoute rien : le coin dessine
 * est a la fois l'intersection et le bord.
 */
export function polylineToItems(verts: { x: number; y: number; bulge?: number }[]): Item[] {
  type Seg = { x1: number; y1: number; x2: number; y2: number };
  type Join = { angle: number; dir: Dir; allowance: number };
  const segs: Seg[] = [];
  const joins: Join[] = []; // joins[k] relie segs[k] et segs[k+1]
  let pendingArc: Join | null = null;

  for (let i = 0; i < verts.length - 1; i++) {
    const v = verts[i]!;
    const w = verts[i + 1]!;
    const b = v.bulge ?? 0;
    if (b !== 0) {
      // Arc entre v et w : angle au centre = deviation du pli
      if (segs.length === 0) throw new Error("Le profil commence par un arc : il doit commencer et finir par un segment droit.");
      if (pendingArc) throw new Error("Deux arcs se suivent : chaque pli doit être un seul arc entre deux segments droits.");
      const th = 4 * Math.atan(Math.abs(b));
      const c = Math.hypot(w.x - v.x, w.y - v.y);
      const R = c / (2 * Math.sin(th / 2));
      const deg = (th * 180) / Math.PI;
      const allowance = deg <= 90 + 1e-6 ? R * Math.tan(th / 2) : R;
      pendingArc = { angle: Math.round(deg * 10) / 10, dir: b > 0 ? "G" : "D", allowance };
      continue;
    }
    const seg = { x1: v.x, y1: v.y, x2: w.x, y2: w.y };
    if (Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1) < 1e-6) continue;
    if (segs.length > 0) {
      if (pendingArc) joins.push(pendingArc);
      else {
        // Coin vif : angle entre les deux directions
        const prev = segs[segs.length - 1]!;
        const u = { x: prev.x2 - prev.x1, y: prev.y2 - prev.y1 };
        const t = { x: seg.x2 - seg.x1, y: seg.y2 - seg.y1 };
        const cross = u.x * t.y - u.y * t.x;
        const dot = u.x * t.x + u.y * t.y;
        const deg = (Math.abs(Math.atan2(cross, dot)) * 180) / Math.PI;
        joins.push({ angle: Math.round(deg * 10) / 10, dir: cross >= 0 ? "G" : "D", allowance: 0 });
      }
    }
    pendingArc = null;
    segs.push(seg);
  }
  if (pendingArc) throw new Error("Le profil finit par un arc : il doit commencer et finir par un segment droit.");

  return segs.map((sg, k) => {
    let len = Math.hypot(sg.x2 - sg.x1, sg.y2 - sg.y1);
    if (k > 0) len += joins[k - 1]!.allowance;
    if (k < segs.length - 1) len += joins[k]!.allowance;
    const j = joins[k];
    return { id: uid(), length: Math.round(len * 100) / 100, angle: j ? j.angle : 0, dir: j ? j.dir : "G" };
  });
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

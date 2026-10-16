import { polylineToItems, type Item } from "./pli";

type V = { x: number; y: number; bulge?: number };
const AUTOCAD_HELP =
  "Dans AutoCAD : dessinez UNE seule polyligne ouverte (commande POLYLIGN ou JOIN sur les lignes) suivant une seule face de la tôle, en millimètres, puis supprimez tout le reste avant d'enregistrer en DXF.";

export async function dxfToItems(text: string): Promise<Item[]> {
  const mod = await import("dxf-parser");
  const Parser = (mod as unknown as { default: new () => { parseSync: (t: string) => any } }).default;
  let dxf: any;
  try {
    dxf = new Parser().parseSync(text);
  } catch {
    throw new Error("Fichier DXF illisible. " + AUTOCAD_HELP);
  }
  const units = dxf?.header?.$INSUNITS;
  if (units !== undefined && units !== 0 && units !== 4)
    throw new Error("Le dessin n'est pas en millimètres (UNITES). Réglez les unités sur mm et réexportez.");

  const ents: any[] = (dxf?.entities ?? []).filter((e: any) => ["LWPOLYLINE", "POLYLINE", "LINE", "ARC"].includes(e.type));
  const polys = ents.filter((e) => e.type === "LWPOLYLINE" || e.type === "POLYLINE");
  const lines = ents.filter((e) => e.type === "LINE");
  if (ents.some((e) => e.type === "ARC"))
    throw new Error("Le fichier contient des arcs isolés. Joignez lignes et arcs en une seule polyligne (commande JOIN). " + AUTOCAD_HELP);

  let verts: V[];
  if (polys.length === 1 && lines.length === 0) {
    const p = polys[0];
    if (p.shape || p.closed) throw new Error("La polyligne est fermée (contour de la tôle). Il faut une ligne ouverte sur une seule face. " + AUTOCAD_HELP);
    verts = p.vertices.map((v: any) => ({ x: v.x, y: v.y, bulge: v.bulge ?? 0 }));
  } else if (polys.length === 0 && lines.length > 0) {
    verts = chainLines(lines);
  } else if (polys.length + lines.length === 0) {
    throw new Error("Aucune polyligne ni ligne trouvée. " + AUTOCAD_HELP);
  } else {
    throw new Error(`Le fichier contient ${polys.length} polyligne(s) et ${lines.length} ligne(s) : il n'en faut qu'une seule. ` + AUTOCAD_HELP);
  }
  if (verts.length < 2) throw new Error("La polyligne n'a pas assez de sommets.");
  return polylineToItems(verts);
}

function chainLines(lines: any[]): V[] {
  const tol = 0.01;
  const same = (a: V, b: V) => Math.hypot(a.x - b.x, a.y - b.y) < tol;
  const segs = lines.map((l) => [l.vertices[0], l.vertices[1]] as [V, V]);
  const ends = segs.flat();
  const start = ends.find((p) => ends.filter((q) => same(p, q)).length === 1);
  if (!start) throw new Error("Les lignes forment un contour fermé. Il faut une ligne ouverte sur une seule face. " + AUTOCAD_HELP);
  const out: V[] = [start];
  const left = [...segs];
  let cur = start;
  while (left.length) {
    const i = left.findIndex(([a, b]) => same(a, cur) || same(b, cur));
    if (i < 0) throw new Error("Les lignes ne sont pas toutes jointes bout à bout. " + AUTOCAD_HELP);
    const [a, b] = left.splice(i, 1)[0];
    cur = same(a, cur) ? b : a;
    out.push(cur);
  }
  return out;
}

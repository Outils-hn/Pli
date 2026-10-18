import { describe, it, expect } from "vitest";
import { compute, newProfile, parseNum, fmtExcel, round05, kFromLoss90, lossFromK, polylineToItems } from "./pli";

const table = [{ material: "Alu", thickness: 2, angle: null, loss: 3.5 }];

describe("pli", () => {
  it("développé = somme cotes ext − pertes", () => {
    const r = compute(newProfile(), table);
    expect(r.total).toBeCloseTo(50 + 300 + 80 - 7);
    expect(r.totalRounded).toBe(423);
  });
  it("arrondi à 0,5 mm", () => {
    expect(round05(423.26)).toBe(423.5);
    expect(round05(423.2)).toBe(423);
  });
  it("bloque si matériau/épaisseur absent", () => {
    const p = { ...newProfile(), thickness: 3 };
    expect(compute(p, table).ok).toBe(false);
  });
  it("extrapole via K équivalent", () => {
    const k = kFromLoss90(3.5, 2);
    expect(lossFromK(90, 2, 2, k)).toBeCloseTo(3.5);
    const p = newProfile();
    p.items[0].angle = 45;
    const r = compute(p, table);
    expect(r.bends[0].source).toBe("extrapolee");
  });
  it("lit virgule et apostrophe suisse", () => {
    expect(parseNum("1'234,5")).toBe(1234.5);
    expect(parseNum("2.5")).toBe(2.5);
  });
  it("polyligne en L -> pli 90°", () => {
    const it = polylineToItems([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 50 }]);
    expect(it[0].angle).toBe(90);
    expect(it[0].dir).toBe("G");
  });
  // Regle atelier : pli ouvert (<= 90°) cote a l'intersection des faces, pli ferme (> 90°) au bord de la tole
  it("DXF : congé à 90° -> cote à l'intersection (R × tan 45° = R)", () => {
    const b = Math.tan(Math.PI / 8); // arc de 90°
    const it = polylineToItems([{ x: 0, y: 0 }, { x: 96, y: 0, bulge: b }, { x: 100, y: 4 }, { x: 100, y: 50 }]);
    expect(it.map((x) => x.length)).toEqual([100, 50]);
    expect(it[0].angle).toBe(90);
  });
  it("DXF : pli ouvert à 45° avec congé -> intersection des faces", () => {
    const R = 10, th = Math.PI / 4;
    const end = { x: 100 + R * Math.sin(th), y: R - R * Math.cos(th) };
    const it = polylineToItems([{ x: 0, y: 0 }, { x: 100, y: 0, bulge: Math.tan(th / 4) }, end, { x: end.x + 50 * Math.cos(th), y: end.y + 50 * Math.sin(th) }]);
    expect(it[0].angle).toBe(45);
    expect(it[0].length).toBeCloseTo(100 + R * Math.tan(th / 2), 1);
    expect(it[1].length).toBeCloseTo(50 + R * Math.tan(th / 2), 1);
  });
  it("DXF : goutte d'eau 135° avec congé -> cote au bord (+R seulement)", () => {
    const R = 4, th = (135 * Math.PI) / 180;
    // arc a gauche (bulge > 0) apres un segment horizontal de 100
    const end = { x: 100 + R * Math.sin(th), y: R - R * Math.cos(th) };
    const dirx = Math.cos(th), diry = Math.sin(th);
    const it = polylineToItems([{ x: 0, y: 0 }, { x: 100, y: 0, bulge: Math.tan(th / 4) }, end, { x: end.x + 30 * dirx, y: end.y + 30 * diry }]);
    expect(it[0].angle).toBe(135);
    expect(it[0].length).toBeCloseTo(104, 1); // 100 + R, pas 100 + R·tan(67,5°) = 109,7
    expect(it[1].length).toBeCloseTo(34, 1);
  });
  it("DXF : ourlet (arc de 180°) -> bord de la tôle", () => {
    const it = polylineToItems([{ x: 0, y: 0 }, { x: 100, y: 0, bulge: 1 }, { x: 100, y: 4 }, { x: 80, y: 4 }]);
    expect(it[0].angle).toBe(180);
    expect(it.map((x) => x.length)).toEqual([102, 22]);
  });
  it("DXF : coin vif fermé -> pas de correction", () => {
    const a = (135 * Math.PI) / 180;
    const it = polylineToItems([{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 200 + 30 * Math.cos(-a), y: 30 * Math.sin(-a) }]);
    expect(it.map((x) => x.length)).toEqual([200, 30]);
    expect(it[0].angle).toBe(135);
    expect(it[0].dir).toBe("D");
  });
  it("DXF : arc en début de profil refusé avec un message clair", () => {
    expect(() => polylineToItems([{ x: 0, y: 0, bulge: 0.4 }, { x: 10, y: 0 }, { x: 50, y: 0 }])).toThrow(/commence par un arc/);
  });
  it("ourlet sans valeur dans la table -> calcul bloqué (pas d'extrapolation)", () => {
    const p = newProfile();
    p.items[0].angle = 180;
    const r = compute(p, table);
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/ourlet/);
    const r2 = compute(p, [...table, { material: "Alu", thickness: 2, angle: 180, loss: 1 }]);
    expect(r2.ok).toBe(true);
  });
  it("copie Excel sans séparateur de milliers", () => {
    expect(fmtExcel(1234.5, 1)).toBe("1234,5");
    expect(fmtExcel(423)).toBe("423");
  });
});

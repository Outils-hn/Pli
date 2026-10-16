import { describe, it, expect } from "vitest";
import { compute, newProfile, parseNum, round05, kFromLoss90, lossFromK, polylineToItems } from "./pli";

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
});

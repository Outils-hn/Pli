import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { NumInput } from "@/components/NumInput";
import { DEFAULT_MATERIALS, DEFAULT_TABLE, parseLossTable, type LossRow } from "@/lib/pli";
import { KEYS, useStored } from "@/lib/storage";

export const Route = createFileRoute("/pertes")({
  head: () => ({
    meta: [
      { title: "Table des pertes au pli — Pli" },
      { name: "description", content: "Pertes au pli par matériau, épaisseur et angle, modifiables et importables depuis Excel." },
      { property: "og:title", content: "Table des pertes au pli — Pli" },
      { property: "og:description", content: "Pertes au pli par matériau, épaisseur et angle." },
    ],
  }),
  component: Pertes,
});

function Pertes() {
  const [table, setTable] = useStored<LossRow[]>(KEYS.table, () => DEFAULT_TABLE);
  const [materials, setMaterials] = useStored<string[]>(KEYS.materials, () => DEFAULT_MATERIALS);
  const [paste, setPaste] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [newMat, setNewMat] = useState("");

  const upd = (i: number, patch: Partial<LossRow>) =>
    setTable((t) => t.map((r, j) => (j === i ? { ...r, ...patch } : r)));

  const doPaste = (replace: boolean) => {
    const { rows, errors } = parseLossTable(paste);
    if (!rows.length) {
      setMsg("Aucune ligne lisible. Format attendu : matériau, épaisseur, angle (optionnel), perte.");
      return;
    }
    setTable((t) => (replace ? rows : [...t, ...rows]));
    setMsg(`${rows.length} ligne(s) importée(s).${errors.length ? " " + errors.join(" ") : ""}`);
    setPaste("");
  };

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 grid gap-5 lg:grid-cols-[1fr_340px]">
      <section className="card overflow-x-auto">
        <h2 className="card-title">Pertes au pli</h2>
        <table className="w-full text-sm">
          <thead className="text-xs text-muted-foreground">
            <tr>
              <th className="text-left font-medium pb-2">Matériau</th>
              <th className="text-right font-medium pb-2">Épaisseur (mm)</th>
              <th className="text-right font-medium pb-2">Angle (°)</th>
              <th className="text-right font-medium pb-2">Perte (mm)</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {table.map((r, i) => (
              <tr key={i} className="border-t">
                <td className="py-1 pr-2">
                  <input className="field w-full min-w-24" list="mats" value={r.material} onChange={(e) => upd(i, { material: e.target.value })} aria-label="Matériau" />
                </td>
                <td className="py-1 pr-2"><NumInput value={r.thickness} onChange={(v) => upd(i, { thickness: v ?? 0 })} aria-label="Épaisseur" /></td>
                <td className="py-1 pr-2"><NumInput value={r.angle} allowEmpty placeholder="90" onChange={(v) => upd(i, { angle: v })} aria-label="Angle" /></td>
                <td className="py-1 pr-2"><NumInput value={r.loss} onChange={(v) => upd(i, { loss: v ?? 0 })} aria-label="Perte" /></td>
                <td className="py-1">
                  <button className="btn px-2" aria-label="Supprimer la ligne" onClick={() => setTable((t) => t.filter((_, j) => j !== i))}>×</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <datalist id="mats">{materials.map((m) => <option key={m} value={m} />)}</datalist>
        <div className="mt-3 flex flex-wrap gap-2">
          <button className="btn" onClick={() => setTable((t) => [...t, { material: materials[0] ?? "", thickness: 1, angle: null, loss: 0 }])}>+ Ajouter une ligne</button>
          <button className="btn" onClick={() => confirm("Remettre la table par défaut ?") && setTable(DEFAULT_TABLE)}>Valeurs par défaut</button>
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Angle vide = 90°. Les valeurs par défaut sont indicatives : remplacez-les par celles de votre atelier.</p>
      </section>

      <div className="grid gap-5 content-start">
        <section className="card">
          <h2 className="card-title">Coller depuis Excel</h2>
          <textarea
            className="field w-full h-36 py-2 font-mono text-xs"
            placeholder={"Alu\t2\t90\t3,5\nZinc\t0,65\t\t1,2"}
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
          />
          <div className="mt-2 flex gap-2">
            <button className="btn btn-primary" onClick={() => doPaste(false)}>Ajouter</button>
            <button className="btn" onClick={() => doPaste(true)}>Remplacer tout</button>
          </div>
          {msg && <p className="mt-2 text-xs text-muted-foreground">{msg}</p>}
        </section>
        <section className="card">
          <h2 className="card-title">Matériaux</h2>
          <div className="flex flex-wrap gap-1.5">
            {materials.map((m) => (
              <span key={m} className="inline-flex items-center gap-1 rounded-md bg-primary-soft text-accent-foreground px-2 py-1 text-sm">
                {m}
                <button aria-label={`Retirer ${m}`} onClick={() => setMaterials((ms) => ms.filter((x) => x !== m))}>×</button>
              </span>
            ))}
          </div>
          <form
            className="mt-3 flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              const v = newMat.trim();
              if (v && !materials.includes(v)) setMaterials([...materials, v]);
              setNewMat("");
            }}
          >
            <input className="field flex-1" placeholder="Nouveau matériau" value={newMat} onChange={(e) => setNewMat(e.target.value)} />
            <button className="btn">Ajouter</button>
          </form>
        </section>
      </div>
    </div>
  );
}

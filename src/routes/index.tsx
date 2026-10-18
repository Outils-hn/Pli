import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useRef, useState } from "react";
import { NumInput } from "@/components/NumInput";
import { FlatSvg, ProfileSvg } from "@/components/Drawings";
import {
  compute, DEFAULT_MATERIALS, DEFAULT_TABLE, fmt, fmtExcel, newProfile, toInterior, fromInterior, uid,
  type Item, type LossRow, type Profile,
} from "@/lib/pli";
import { dxfToItems } from "@/lib/dxf";
import { downloadJson, KEYS, useStored } from "@/lib/storage";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Pli — développé de tôles pliées" },
      { name: "description", content: "Calculez le développé de couvertines, bavettes et habillages : profil, pertes au pli, cotes de traçage." },
      { property: "og:title", content: "Pli — développé de tôles pliées" },
      { property: "og:description", content: "Profil, pertes au pli, cotes de traçage pour l'atelier." },
    ],
  }),
  component: Editor,
});

function Editor() {
  const [p, setP] = useStored<Profile>(KEYS.current, newProfile);
  const [profiles, setProfiles] = useStored<Profile[]>(KEYS.profiles, () => []);
  const [table, setTable] = useStored<LossRow[]>(KEYS.table, () => DEFAULT_TABLE);
  const [materials, setMaterials] = useStored<string[]>(KEYS.materials, () => DEFAULT_MATERIALS);
  const [sel, setSel] = useState<number | null>(null);
  const [dxfItems, setDxfItems] = useState<Item[] | null>(null);
  const [notice, setNotice] = useState<{ kind: "err" | "ok"; text: string } | null>(null);
  const dxfRef = useRef<HTMLInputElement>(null);
  const jsonRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  const r = useMemo(() => compute(p, table), [p, table]);
  const set = (patch: Partial<Profile>) => setP((x) => ({ ...x, ...patch }));
  const setItem = (i: number, patch: Partial<Item>) =>
    setP((x) => ({ ...x, items: x.items.map((it, j) => (j === i ? { ...it, ...patch } : it)) }));
  const insertAt = (i: number) =>
    setP((x) => {
      const items = [...x.items];
      items.splice(i, 0, { id: uid(), length: 20, angle: 90, dir: "D" });
      return { ...x, items };
    });
  const addEnd = () =>
    setP((x) => {
      const items = x.items.map((it, j) => (j === x.items.length - 1 && it.angle === 0 ? { ...it, angle: 90 } : it));
      return { ...x, items: [...items, { id: uid(), length: 20, angle: 0, dir: "D" }] };
    });
  const remove = (i: number) => setP((x) => ({ ...x, items: x.items.filter((_, j) => j !== i) }));

  const select = (i: number) => {
    setSel(i);
    rowRefs.current[i]?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    rowRefs.current[i]?.querySelector("input")?.focus();
  };

  const save = () => {
    setProfiles((ps) => (ps.some((x) => x.id === p.id) ? ps.map((x) => (x.id === p.id ? p : x)) : [...ps, p]));
    setNotice({ kind: "ok", text: `« ${p.name} » enregistré.` });
  };

  const onDxf = async (f: File) => {
    try {
      const items = await dxfToItems(await f.text());
      if (!items.length) throw new Error("Aucun segment exploitable.");
      setDxfItems(items);
      setNotice(null);
    } catch (e) {
      setNotice({ kind: "err", text: (e as Error).message });
    }
  };

  const onJson = async (f: File) => {
    try {
      const d = JSON.parse(await f.text());
      if (Array.isArray(d.profiles)) setProfiles(d.profiles);
      if (Array.isArray(d.table)) setTable(d.table);
      if (Array.isArray(d.materials)) setMaterials(d.materials);
      setNotice({ kind: "ok", text: "Données importées." });
    } catch {
      setNotice({ kind: "err", text: "Fichier JSON invalide." });
    }
  };

  const copy = async () => {
    const lines = [
      `${p.name}`,
      `Matériau\t${p.material}\tÉpaisseur (mm)\t${fmtExcel(p.thickness)}`,
      `Cotes\t${p.coteMode === "ext" ? "extérieures" : "intérieures"}`,
      `Méthode\t${p.method === "perte" ? "Pertes au pli" : `Facteur K = ${fmtExcel(p.k)}, R int = ${fmtExcel(p.radius)} mm`}`,
      `Largeur de flan (mm)\t${fmtExcel(r.totalRounded, 1)}\tcalculé\t${fmtExcel(r.total, 3)}`,
      "",
      "Pli\tAngle intérieur (°)\tSens\tPosition depuis bord gauche (mm)\tPerte (mm)",
      ...r.bends.filter((b) => b.angle > 0).map((b) =>
        `${b.index + 1}\t${fmtExcel(toInterior(b.angle), 1)}\t${b.dir === "G" ? "haut" : "bas"}\t${fmtExcel(b.position, 1)}\t${fmtExcel(b.loss)}`),
    ];
    await navigator.clipboard.writeText(lines.join("\n"));
    setNotice({ kind: "ok", text: "Résultats copiés." });
  };

  const n = p.items.length;

  return (
    <div className="mx-auto max-w-[1400px] px-4 py-5 grid gap-5">
      {/* Barre profil */}
      <section className="card flex flex-wrap items-center gap-2">
        <input className="field flex-1 min-w-56 text-base font-medium text-heading" value={p.name} onChange={(e) => set({ name: e.target.value })} aria-label="Nom du profil" />
        <button className="btn btn-primary" onClick={save}>Enregistrer</button>
        <select
          className="field"
          value=""
          onChange={(e) => {
            const f = profiles.find((x) => x.id === e.target.value);
            if (f) { setP(f); setSel(null); }
          }}
          aria-label="Ouvrir un profil"
        >
          <option value="">Ouvrir… ({profiles.length})</option>
          {profiles.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </select>
        <button className="btn" onClick={() => setP({ ...p, id: uid(), name: p.name + " (copie)" })}>Dupliquer</button>
        <button
          className="btn"
          onClick={() => {
            if (!confirm(`Supprimer « ${p.name} » des profils enregistrés ?`)) return;
            setProfiles((ps) => ps.filter((x) => x.id !== p.id));
            setP(newProfile());
          }}
        >Supprimer</button>
        <button className="btn" onClick={() => { setP({ ...newProfile(), name: "Nouveau profil" }); setSel(null); }}>Nouveau</button>
        <span className="mx-1 h-6 w-px bg-border hidden sm:block" />
        <button className="btn" onClick={() => dxfRef.current?.click()}>Importer un DXF</button>
        <button className="btn" onClick={() => downloadJson("pli-donnees.json", { profiles, table, materials })}>Exporter JSON</button>
        <button className="btn" onClick={() => jsonRef.current?.click()}>Importer JSON</button>
        <input ref={dxfRef} type="file" accept=".dxf" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onDxf(f); e.target.value = ""; }} />
        <input ref={jsonRef} type="file" accept=".json" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) onJson(f); e.target.value = ""; }} />
      </section>

      {notice && (
        <div className={`rounded-lg border px-4 py-2.5 text-sm flex justify-between gap-4 ${notice.kind === "err" ? "border-destructive text-destructive bg-card" : "bg-primary-soft text-accent-foreground"}`}>
          <span>{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Fermer">×</button>
        </div>
      )}

      {dxfItems && (
        <div className="card border-primary">
          <h2 className="card-title">Import DXF — {dxfItems.length} segment(s) détecté(s)</h2>
          <p className="text-sm mb-1">La ligne dessinée représente quelle face de la tôle ?</p>
          <p className="text-xs text-muted-foreground mb-3">Les congés sont convertis selon la règle de l'atelier : intersection des faces pour un pli ouvert, bord de la tôle pour un pli fermé.</p>
          <div className="flex gap-2">
            {(["ext", "int"] as const).map((m) => (
              <button key={m} className="btn btn-primary" onClick={() => { setP((x) => ({ ...x, items: dxfItems, coteMode: m })); setDxfItems(null); setSel(null); }}>
                Face {m === "ext" ? "extérieure" : "intérieure"}
              </button>
            ))}
            <button className="btn" onClick={() => setDxfItems(null)}>Annuler</button>
          </div>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        {/* Paramètres + tableau */}
        <section className="card">
          <h2 className="card-title">Profil</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4 text-sm">
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">Épaisseur (mm)</span>
              <NumInput value={p.thickness} onChange={(v) => set({ thickness: v ?? 0 })} />
            </label>
            <label className="grid gap-1">
              <span className="text-xs text-muted-foreground">Matériau</span>
              <select className="field" value={p.material} onChange={(e) => set({ material: e.target.value })}>
                {[...new Set([...materials, p.material])].map((m) => <option key={m}>{m}</option>)}
              </select>
            </label>
            <div className="grid gap-1 col-span-2">
              <span className="text-xs text-muted-foreground">Cotes saisies</span>
              <div className="seg w-fit">
                <button aria-pressed={p.coteMode === "ext"} onClick={() => set({ coteMode: "ext" })}>Extérieures</button>
                <button aria-pressed={p.coteMode === "int"} onClick={() => set({ coteMode: "int" })}>Intérieures</button>
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="text-left font-medium pb-2 w-10">Seg.</th>
                  <th className="text-right font-medium pb-2">Longueur (mm)</th>
                  <th className="text-right font-medium pb-2" title="Angle intérieur, comme à l'atelier : 90 = équerre, 135 = pli ouvert, 0 = ourlet, 180 = pas de pli">Angle intérieur (°)</th>
                  <th className="text-left font-medium pb-2 pl-2">Sens</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {p.items.map((it, i) => (
                  <tr
                    key={it.id}
                    ref={(el) => { rowRefs.current[i] = el; }}
                    className={`border-t ${sel === i ? "bg-primary-soft" : ""}`}
                    onFocus={() => setSel(i)}
                  >
                    <td className="py-1.5 font-mono text-muted-foreground">{i + 1}</td>
                    <td className="py-1.5 pr-2"><NumInput value={it.length} onChange={(v) => setItem(i, { length: v ?? 0 })} aria-label={`Longueur segment ${i + 1}`} /></td>
                    <td className="py-1.5 pr-2">
                      {i < n - 1 ? <NumInput value={toInterior(it.angle)} onChange={(v) => setItem(i, { angle: fromInterior(v ?? 180) })} aria-label={`Angle intérieur pli ${i + 1}`} /> : <span className="block text-right text-muted-foreground">—</span>}
                    </td>
                    <td className="py-1.5 pl-2">
                      {i < n - 1 && (
                        <div className="seg">
                          <button aria-pressed={it.dir === "G"} onClick={() => setItem(i, { dir: "G" })}>Gauche</button>
                          <button aria-pressed={it.dir === "D"} onClick={() => setItem(i, { dir: "D" })}>Droite</button>
                        </div>
                      )}
                    </td>
                    <td className="py-1.5 pl-2 whitespace-nowrap text-right">
                      <button className="btn px-2" title="Insérer un segment avant" onClick={() => insertAt(i)}>+</button>
                      <button className="btn px-2 ml-1" title="Supprimer le segment" disabled={n <= 1} onClick={() => remove(i)}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button className="btn btn-primary mt-3" onClick={addEnd}>+ Ajouter un pli</button>
          <p className="mt-2 text-xs text-muted-foreground">Angle intérieur : 90° = équerre, 135° = pli ouvert, 0° = ourlet. Cotes : jusqu'à l'intersection des faces pour un pli ouvert (90° ou plus), jusqu'au bord de la tôle pour un pli fermé (moins de 90°). Le sens est vu en parcourant le profil depuis le segment 1.</p>
        </section>

        {/* Aperçu */}
        <section className="card">
          <h2 className="card-title">Aperçu — cotes {p.coteMode === "ext" ? "extérieures" : "intérieures"}</h2>
          <ProfileSvg items={p.items} selected={sel} onSelect={select} />
          <p className="text-xs text-muted-foreground">Cliquez un segment pour le modifier. Le point creux marque le début.</p>
        </section>
      </div>

      {/* Résultats */}
      <section className="card">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h2 className="card-title">Développé</h2>
          <div className="flex flex-wrap gap-2 items-center">
            <div className="seg">
              <button aria-pressed={p.method === "perte"} onClick={() => set({ method: "perte" })}>Pertes au pli</button>
              <button aria-pressed={p.method === "k"} onClick={() => set({ method: "k" })}>Facteur K</button>
            </div>
            {p.method === "k" && (
              <>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">R int<NumInput className="w-20" value={p.radius} onChange={(v) => set({ radius: v ?? 0 })} /></label>
                <label className="flex items-center gap-1 text-xs text-muted-foreground">K<NumInput className="w-20" value={p.k} onChange={(v) => set({ k: v ?? 0 })} /></label>
              </>
            )}
            <button className="btn" onClick={copy} disabled={!r.ok}>Copier les résultats</button>
          </div>
        </div>

        {!r.ok ? (
          <div className="mt-2 rounded-md border border-destructive px-4 py-3 text-sm text-destructive">
            {r.error} {r.error?.includes("table") && <Link to="/pertes" className="underline">Ouvrir la table des pertes</Link>}
          </div>
        ) : (
          <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
            <div>
              <div className="text-xs text-muted-foreground">Largeur de flan</div>
              <div className="font-mono text-5xl font-medium text-heading tracking-tight">{fmt(r.totalRounded, 1)}<span className="text-xl text-muted-foreground ml-1">mm</span></div>
              <div className="font-mono text-xs text-muted-foreground mt-1">calculé : {fmt(r.total, 3)} mm</div>

              <table className="w-full text-sm mt-5">
                <thead className="text-xs text-muted-foreground">
                  <tr><th className="text-left font-medium pb-1">Pli</th><th className="text-right font-medium pb-1">Angle int.</th><th className="text-right font-medium pb-1">Sens</th><th className="text-right font-medium pb-1">Traçage</th></tr>
                </thead>
                <tbody>
                  {r.bends.filter((b) => b.angle > 0).map((b) => (
                    <tr key={b.index} className="border-t">
                      <td className="py-1 font-mono">{b.index + 1}</td>
                      <td className="py-1 num">{fmt(toInterior(b.angle), 1)}°</td>
                      <td className="py-1 text-right">{b.dir === "G" ? "haut" : "bas"}</td>
                      <td className="py-1 num font-medium text-heading">{fmt(b.position, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="text-xs text-muted-foreground mt-1">Positions depuis le bord gauche (mm).</p>
            </div>

            <div className="grid gap-4 content-start">
              <FlatSvg total={r.total} bends={r.bends} />
              {r.warnings.length > 0 && (
                <ul className="rounded-md bg-warning-soft text-warning px-4 py-2 text-sm list-disc pl-8">
                  {r.warnings.map((w) => <li key={w}>{w}</li>)}
                </ul>
              )}
              <div className="rounded-md bg-muted px-4 py-3 text-sm">
                <div className="card-title mb-2">Hypothèses</div>
                <ul className="grid gap-0.5 text-muted-foreground">
                  <li>Méthode : {p.method === "perte" ? "pertes au pli (Σ cotes ext. − Σ pertes)" : `facteur K = ${fmt(p.k)}, rayon intérieur ${fmt(p.radius)} mm`}</li>
                  <li>{p.material}, épaisseur {fmt(p.thickness)} mm — cotes {p.coteMode === "ext" ? "extérieures" : "intérieures (converties en extérieures)"}</li>
                  {r.bends.filter((b) => b.angle > 0).map((b) => (
                    <li key={b.index}>
                      Pli {b.index + 1} ({fmt(toInterior(b.angle), 1)}° int.) : perte <span className="font-mono">{fmt(b.loss, 3)}</span> mm
                      {b.source === "table" && " — table"}
                      {b.source === "k" && " — calculée (K)"}
                      {b.source === "extrapolee" && <span className="text-warning"> — valeur extrapolée depuis 90°</span>}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

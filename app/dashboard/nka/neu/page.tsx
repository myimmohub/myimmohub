"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

type PropertyOption = {
  id: string;
  name: string;
  address: string | null;
};

function defaultRange() {
  const year = new Date().getFullYear() - 1;
  return {
    from: `${year}-01-01`,
    to: `${year}-12-31`,
  };
}

export default function NewNkaPage() {
  const router = useRouter();
  const [properties, setProperties] = useState<PropertyOption[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [range, setRange] = useState(defaultRange());
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadingProperties, setLoadingProperties] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoadingProperties(true);
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setLoadingProperties(false);
        return;
      }
      const { data, error: propertiesError } = await supabase
        .from("properties")
        .select("id, name, address")
        .eq("user_id", user.id)
        .order("name");
      if (propertiesError) {
        setError("Objekte konnten nicht geladen werden.");
        setLoadingProperties(false);
        return;
      }
      const nextProperties = (data ?? []) as PropertyOption[];
      setProperties(nextProperties);
      if (nextProperties.length === 1) setPropertyId(nextProperties[0].id);
      setLoadingProperties(false);
    };
    void load();
  }, []);

  const selectedProperty = properties.find((property) => property.id === propertyId) ?? null;

  const handleCreate = async () => {
    setSaving(true);
    setError(null);
    const res = await fetch("/api/nka/periods", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        property_id: propertyId,
        zeitraum_von: range.from,
        zeitraum_bis: range.to,
      }),
    });
    const data = await res.json().catch(() => null) as { id?: string; error?: string } | null;
    setSaving(false);
    if (!res.ok || !data?.id) {
      setError(data?.error ?? "NKA-Periode konnte nicht angelegt werden.");
      return;
    }
    router.push(`/dashboard/nka/${data.id}`);
  };

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-10">
      <section className="mx-auto max-w-3xl space-y-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Neue Nebenkostenabrechnung</h1>
          <p className="mt-1 text-sm text-slate-500">Objekt und Zeitraum wählen. Danach startet die Kosten-Auto-Befüllung aus Transaktionen.</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="grid gap-4 md:grid-cols-2">
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Objekt</span>
              <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="w-full rounded-lg border border-slate-200 px-3 py-2">
                <option value="">Objekt wählen</option>
                {properties.map((property) => (
                  <option key={property.id} value={property.id}>
                    {property.name}
                  </option>
                ))}
              </select>
            </label>
            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600">
              {selectedProperty ? (
                <>
                  <div className="font-medium text-slate-900">{selectedProperty.name}</div>
                  <div>{selectedProperty.address ?? "Keine Adresse"}</div>
                  <div className="mt-2 text-slate-500">Die NKA-spezifischen Stammdaten prüfen wir im nächsten Schritt.</div>
                </>
              ) : loadingProperties ? "Objekte werden geladen…" : "Objekt wählen, um die Stammdaten zu prüfen."}
            </div>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Zeitraum von</span>
              <input type="date" value={range.from} onChange={(e) => setRange((current) => ({ ...current, from: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
            </label>
            <label className="space-y-2 text-sm font-medium text-slate-700">
              <span>Zeitraum bis</span>
              <input type="date" value={range.to} onChange={(e) => setRange((current) => ({ ...current, to: e.target.value }))} className="w-full rounded-lg border border-slate-200 px-3 py-2" />
            </label>
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            {error ? <p className="text-sm text-red-600">{error}</p> : <div />}
            <button
              type="button"
              disabled={saving || loadingProperties || !propertyId}
              onClick={() => void handleCreate()}
              className="inline-flex rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Lege an…" : "Periode anlegen"}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}

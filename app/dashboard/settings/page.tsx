"use client";

import { useCallback, useEffect, useState, useRef } from "react";

const ICON_OPTIONS = [
  "💶", "🏠", "🔧", "⚡", "💧", "♻️", "📡", "🛋️", "🏦", "🏛️",
  "🛡️", "🏢", "🧹", "🪣", "🪴", "📋", "📢", "🚗", "🗂️", "🔑",
  "🏔️", "🏷️", "🧺", "🗝️", "🛏️", "🧴", "📺", "🌴", "🔄", "➕",
  "💳", "🔀", "🚫", "📌", "🏗️", "🪜", "🔌", "🧰", "🪟", "🚿",
  "🧱", "🏘️", "💡", "🔥", "❄️", "🌿", "🧾", "💰", "📊", "🏦",
];

type Category = {
  id: string;
  label: string;
  icon: string;
  gruppe: string;
  typ: string;
  anlage_v: string;
  badge_100pct: boolean;
  is_system: boolean;
  editierbar: boolean;
  description: string | null;
};

const GRUPPEN = [
  "Einnahmen", "Gebäude", "Instandhaltung", "Betriebskosten",
  "Einrichtung", "Finanzierung", "Ferienimmobilie", "Verwaltung", "Sonstiges",
];

const ANLAGE_V_OPTIONS = [
  "Zeile 9 – Mieteinnahmen Wohnung",
  "Zeile 10 – Mieteinnahmen Gewerbe",
  "Zeile 13 – Umlagen / Nebenkosten",
  "Zeile 33 – Abschreibungen (AfA)",
  "Zeile 39 – Erhaltungsaufwand",
  "Zeile 46 – Grundsteuer",
  "Zeile 47 – Schuldzinsen",
  "Zeile 48 – Versicherungen",
  "Zeile 49 – Hausverwaltung",
  "Zeile 50 – Sonstige Werbungskosten",
  "§ 35a – Handwerkerleistungen",
  "nicht absetzbar",
];

export default function KategorienPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const iconPickerRef = useRef<HTMLDivElement>(null);

  // Form state
  const [form, setForm] = useState({
    label: "", icon: "📌", gruppe: "Einnahmen", typ: "einnahme",
    anlage_v: "Zeile 9 – Mieteinnahmen Wohnung", description: "",
  });

  const loadCategories = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/settings/categories");
    if (res.ok) setCategories(await res.json());
    setLoading(false);
  }, []);

  useEffect(() => { void loadCategories(); }, [loadCategories]);

  const resetForm = () => {
    setForm({ label: "", icon: "📌", gruppe: "Einnahmen", typ: "einnahme", anlage_v: "Zeile 9 – Mieteinnahmen Wohnung", description: "" });
    setShowAdd(false);
    setEditId(null);
  };

  const handleSave = async () => {
    if (!form.label.trim()) return;
    setSaving(true);

    if (editId) {
      await fetch(`/api/settings/categories/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: form.label, icon: form.icon, anlage_v: form.anlage_v, description: form.description }),
      });
    } else {
      await fetch("/api/settings/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    }

    setSaving(false);
    resetForm();
    void loadCategories();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Kategorie wirklich löschen?")) return;
    await fetch(`/api/settings/categories/${id}`, { method: "DELETE" });
    void loadCategories();
  };

  const startEdit = (cat: Category) => {
    setForm({
      label: cat.label, icon: cat.icon, gruppe: cat.gruppe, typ: cat.typ,
      anlage_v: cat.anlage_v, description: cat.description ?? "",
    });
    setEditId(cat.id);
    setShowAdd(true);
  };

  // Group categories
  const grouped = GRUPPEN.map((g) => ({
    gruppe: g,
    items: categories.filter((c) => c.gruppe === g),
  })).filter((g) => g.items.length > 0);

  return (
    <div>
      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          {categories.length} Kategorien ({categories.filter((c) => c.is_system).length} System, {categories.filter((c) => !c.is_system).length} Benutzerdefiniert)
        </p>
        <button
          onClick={() => { resetForm(); setShowAdd(true); }}
          className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700"
        >
          + Neue Kategorie
        </button>
      </div>

      {/* Add/Edit Form */}
      {showAdd && (
        <div className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <h3 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">
            {editId ? "Kategorie bearbeiten" : "Neue Kategorie"}
          </h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Bezeichnung *</label>
              <input
                value={form.label}
                onChange={(e) => setForm({ ...form, label: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                placeholder="z.B. Gartenarbeit"
              />
            </div>
            <div className="relative" ref={iconPickerRef}>
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Icon</label>
              <button
                type="button"
                onClick={() => setIconPickerOpen(!iconPickerOpen)}
                className="flex w-full items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 transition hover:border-blue-300 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                <span className="text-lg">{form.icon}</span>
                <span className="text-slate-400">Icon wählen</span>
              </button>
              {iconPickerOpen && (
                <div className="absolute left-0 top-full z-20 mt-1 grid w-64 grid-cols-8 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  {ICON_OPTIONS.map((icon) => (
                    <button
                      key={icon}
                      type="button"
                      onClick={() => { setForm({ ...form, icon }); setIconPickerOpen(false); }}
                      className={`flex h-8 w-8 items-center justify-center rounded-lg text-lg transition hover:bg-blue-50 dark:hover:bg-blue-950/30 ${
                        form.icon === icon ? "bg-blue-100 ring-2 ring-blue-500 dark:bg-blue-950/50" : ""
                      }`}
                    >
                      {icon}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {!editId && (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Gruppe</label>
                  <select
                    value={form.gruppe}
                    onChange={(e) => setForm({ ...form, gruppe: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    {GRUPPEN.map((g) => <option key={g} value={g}>{g}</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Typ</label>
                  <select
                    value={form.typ}
                    onChange={(e) => setForm({ ...form, typ: e.target.value })}
                    className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  >
                    <option value="einnahme">Einnahme</option>
                    <option value="ausgabe">Ausgabe</option>
                    <option value="neutral">Neutral</option>
                  </select>
                </div>
              </>
            )}
            <div className="sm:col-span-2">
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Anlage V Zuordnung</label>
              <select
                value={form.anlage_v}
                onChange={(e) => setForm({ ...form, anlage_v: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
              >
                {ANLAGE_V_OPTIONS.map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="sm:col-span-2 lg:col-span-3">
              <label className="mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400">Beschreibung</label>
              <input
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                placeholder="Optionale Beschreibung"
              />
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              onClick={handleSave}
              disabled={saving || !form.label.trim()}
              className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-blue-700 disabled:opacity-50"
            >
              {saving ? "Speichern..." : editId ? "Aktualisieren" : "Erstellen"}
            </button>
            <button
              onClick={resetForm}
              className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-600 transition hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-300"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {/* Categories grouped */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-blue-600 border-t-transparent" />
        </div>
      ) : (
        <div className="space-y-6">
          {grouped.map(({ gruppe, items }) => (
            <div key={gruppe}>
              <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">{gruppe}</h3>
              <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-100 dark:border-slate-800">
                      <th className="px-4 py-2.5 text-left font-medium text-slate-500 dark:text-slate-400">Kategorie</th>
                      <th className="hidden px-4 py-2.5 text-left font-medium text-slate-500 dark:text-slate-400 sm:table-cell">Anlage V</th>
                      <th className="hidden px-4 py-2.5 text-left font-medium text-slate-500 dark:text-slate-400 md:table-cell">Typ</th>
                      <th className="px-4 py-2.5 text-right font-medium text-slate-500 dark:text-slate-400">Aktionen</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                    {items.map((cat) => (
                      <tr key={cat.id} className="transition hover:bg-slate-50 dark:hover:bg-slate-800/50">
                        <td className="px-4 py-2.5">
                          <div className="flex items-center gap-2">
                            <span>{cat.icon}</span>
                            <span className="font-medium text-slate-900 dark:text-slate-100">{cat.label}</span>
                            {cat.is_system && (
                              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 dark:bg-slate-800 dark:text-slate-400">System</span>
                            )}
                          </div>
                        </td>
                        <td className="hidden px-4 py-2.5 text-slate-500 dark:text-slate-400 sm:table-cell">
                          {cat.anlage_v}
                        </td>
                        <td className="hidden px-4 py-2.5 md:table-cell">
                          <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                            cat.typ === "einnahme"
                              ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400"
                              : cat.typ === "ausgabe"
                              ? "bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-400"
                              : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"
                          }`}>
                            {cat.typ === "einnahme" ? "Einnahme" : cat.typ === "ausgabe" ? "Ausgabe" : cat.typ}
                          </span>
                        </td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1">
                            {cat.editierbar && (
                              <button
                                onClick={() => startEdit(cat)}
                                className="rounded-md p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-blue-600 dark:hover:bg-slate-800 dark:hover:text-blue-400"
                                title="Bearbeiten"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path d="M13.586 3.586a2 2 0 112.828 2.828l-.793.793-2.828-2.828.793-.793zM11.379 5.793L3 14.172V17h2.828l8.38-8.379-2.83-2.828z" />
                                </svg>
                              </button>
                            )}
                            {!cat.is_system && (
                              <button
                                onClick={() => handleDelete(cat.id)}
                                className="rounded-md p-1.5 text-slate-400 transition hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                                title="Löschen"
                              >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                                </svg>
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

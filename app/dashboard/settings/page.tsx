"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const ICON_OPTIONS = [
  "💶", "🏠", "🔧", "⚡", "💧", "♻️", "📡", "🛋️", "🏦", "🏛️",
  "🛡️", "🏢", "🧹", "🪣", "🪴", "📋", "📢", "🚗", "🗂️", "🔑",
  "🏔️", "🏷️", "🧺", "🗝️", "🛏️", "🧴", "📺", "🌴", "🔄", "➕",
  "💳", "🔀", "🚫", "📌", "🏗️", "🪜", "🔌", "🧰", "🪟", "🚿",
  "🧱", "🏘️", "💡", "🔥", "❄️", "🌿", "🧾", "💰", "📊",
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

const GROUPS = [
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

export default function CategoriesSettingsPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [deleteCandidate, setDeleteCandidate] = useState<string | null>(null);
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [pickerAbove, setPickerAbove] = useState(false);
  const iconPickerRef = useRef<HTMLDivElement>(null);

  const [form, setForm] = useState({
    label: "",
    icon: "📌",
    gruppe: "Einnahmen",
    typ: "einnahme",
    anlage_v: "Zeile 9 – Mieteinnahmen Wohnung",
    description: "",
  });

  const loadCategories = useCallback(async () => {
    setLoading(true);
    const res = await fetch("/api/settings/categories");
    if (res.ok) setCategories(await res.json() as Category[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    let active = true;

    const initialLoad = async () => {
      const res = await fetch("/api/settings/categories");
      if (!active) return;
      if (res.ok) setCategories(await res.json() as Category[]);
      setLoading(false);
    };

    void initialLoad();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!iconPickerOpen || !iconPickerRef.current) return;
    const rect = iconPickerRef.current.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    setPickerAbove(spaceBelow < 280);
  }, [iconPickerOpen]);

  const groupedCategories = useMemo(
    () => GROUPS.map((group) => ({ group, items: categories.filter((category) => category.gruppe === group) })).filter((entry) => entry.items.length > 0),
    [categories],
  );

  const resetForm = () => {
    setForm({
      label: "",
      icon: "📌",
      gruppe: "Einnahmen",
      typ: "einnahme",
      anlage_v: "Zeile 9 – Mieteinnahmen Wohnung",
      description: "",
    });
    setEditId(null);
    setShowForm(false);
    setIconPickerOpen(false);
  };

  const startEdit = (category: Category) => {
    setForm({
      label: category.label,
      icon: category.icon,
      gruppe: category.gruppe,
      typ: category.typ,
      anlage_v: category.anlage_v,
      description: category.description ?? "",
    });
    setEditId(category.id);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!form.label.trim()) return;
    setSaving(true);

    if (editId) {
      await fetch(`/api/settings/categories/${editId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: form.label,
          icon: form.icon,
          anlage_v: form.anlage_v,
          description: form.description,
        }),
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
    await loadCategories();
  };

  const handleDelete = async (categoryId: string) => {
    await fetch(`/api/settings/categories/${categoryId}`, { method: "DELETE" });
    setDeleteCandidate(null);
    await loadCategories();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-medium text-slate-900 dark:text-slate-100">Kategorien</h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{categories.length} Kategorien insgesamt.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700"
        >
          Neue Kategorie
        </button>
      </div>

      {showForm && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
          <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{editId ? "Kategorie bearbeiten" : "Neue Kategorie"}</p>
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Field label="Bezeichnung">
              <input className={inputClass} value={form.label} onChange={(event) => setForm((current) => ({ ...current, label: event.target.value }))} />
            </Field>
            <Field label="Icon">
              <div className="relative" ref={iconPickerRef}>
                <button
                  type="button"
                  onClick={() => setIconPickerOpen((current) => !current)}
                  className="flex w-full items-center gap-3 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                >
                  <span className="text-lg">{form.icon}</span>
                  Icon wählen
                </button>
                {iconPickerOpen && (
                  <div className={`absolute left-0 z-20 mt-2 grid w-64 grid-cols-8 gap-1 rounded-xl border border-slate-200 bg-white p-2 shadow-lg dark:border-slate-800 dark:bg-slate-900 ${pickerAbove ? "bottom-full mb-2 mt-0" : "top-full"}`}>
                    {ICON_OPTIONS.map((icon) => (
                      <button
                        key={icon}
                        type="button"
                        onClick={() => {
                          setForm((current) => ({ ...current, icon }));
                          setIconPickerOpen(false);
                        }}
                        className={`flex h-8 w-8 items-center justify-center rounded-lg text-lg transition hover:bg-slate-50 dark:hover:bg-slate-800 ${form.icon === icon ? "bg-blue-50 dark:bg-blue-950/40" : ""}`}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </Field>
            {!editId && (
              <>
                <Field label="Gruppe">
                  <select className={inputClass} value={form.gruppe} onChange={(event) => setForm((current) => ({ ...current, gruppe: event.target.value }))}>
                    {GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
                  </select>
                </Field>
                <Field label="Typ">
                  <select className={inputClass} value={form.typ} onChange={(event) => setForm((current) => ({ ...current, typ: event.target.value }))}>
                    <option value="einnahme">Einnahme</option>
                    <option value="ausgabe">Ausgabe</option>
                    <option value="neutral">Neutral</option>
                  </select>
                </Field>
              </>
            )}
            <Field label="Anlage V Zuordnung">
              <select className={inputClass} value={form.anlage_v} onChange={(event) => setForm((current) => ({ ...current, anlage_v: event.target.value }))}>
                {ANLAGE_V_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </Field>
            <Field label="Beschreibung">
              <input className={inputClass} value={form.description} onChange={(event) => setForm((current) => ({ ...current, description: event.target.value }))} />
            </Field>
          </div>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || !form.label.trim()}
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-medium text-white transition hover:bg-blue-700 disabled:opacity-60"
            >
              {saving ? "Speichert..." : editId ? "Aktualisieren" : "Erstellen"}
            </button>
            <button
              type="button"
              onClick={resetForm}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Abbrechen
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-3">
          <div className="h-24 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
          <div className="h-24 animate-pulse rounded-xl bg-slate-200 dark:bg-slate-800" />
        </div>
      ) : (
        <div className="space-y-6">
          {groupedCategories.map(({ group, items }) => (
            <div key={group} className="rounded-xl border border-slate-200 bg-white p-5 dark:border-slate-800 dark:bg-slate-900">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs font-medium uppercase tracking-wider text-slate-400">{group}</p>
                  <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{items.length} Kategorien</p>
                </div>
              </div>
              <div className="mt-4 space-y-2">
                {items.map((category) => (
                  <div key={category.id} className="rounded-lg border border-slate-200 px-4 py-3 dark:border-slate-800">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-lg">{category.icon}</span>
                          <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{category.label}</p>
                          {category.is_system && (
                            <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                              System
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{category.anlage_v}</p>
                        {category.is_system && (
                          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">Systemkategorien sind gesperrt, damit Standard-Mappings stabil bleiben.</p>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {category.editierbar && (
                          <button
                            type="button"
                            onClick={() => startEdit(category)}
                            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                          >
                            Bearbeiten
                          </button>
                        )}
                        {!category.is_system && deleteCandidate !== category.id && (
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteCandidate(category.id);
                              window.setTimeout(() => setDeleteCandidate((current) => current === category.id ? null : current), 3000);
                            }}
                            className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 transition hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/40"
                          >
                            Löschen?
                          </button>
                        )}
                        {deleteCandidate === category.id && (
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              onClick={() => void handleDelete(category.id)}
                              className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-3 py-2 text-sm font-medium text-white transition hover:bg-red-700"
                            >
                              Ja, löschen
                            </button>
                            <button
                              type="button"
                              onClick={() => setDeleteCandidate(null)}
                              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-50 dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
                            >
                              Abbrechen
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</label>
      {children}
    </div>
  );
}

const inputClass = "w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100";

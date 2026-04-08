"use client";

import { useState } from "react";
import Link from "next/link";

// ── Types ─────────────────────────────────────────────────────────────────────

interface Tip {
  id: number;
  title: string;
  summary: string;
  detail: React.ReactNode;
  immohubBadge?: string;
  saving?: string; // optional highlight e.g. "bis zu 50.000 € mehr Abschreibung"
}

// ── Data ──────────────────────────────────────────────────────────────────────

const tips: Tip[] = [
  {
    id: 1,
    title: "Kaufpreis aufteilen – Gebäude vs. Grundstück",
    summary:
      "Nur das Gebäude darf steuerlich abgeschrieben werden, nicht das Grundstück. Wer das Verhältnis bereits im Kaufvertrag festlegt, kann die jährliche AfA deutlich erhöhen.",
    saving: "Bis zu 50.000 € mehr Abschreibungspotenzial",
    immohubBadge: "ImmoHub berechnet die AfA automatisch aus deinem Kaufvertrag",
    detail: (
      <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          Das Finanzamt nimmt bei fehlender Angabe einen eigenen Grundstücksanteil an – oft
          20–30 %, in begehrten Lagen deutlich mehr. Wer nichts regelt, verschenkt
          Abschreibungspotenzial.
        </p>
        <p>
          <strong className="text-zinc-800 dark:text-zinc-200">Der Trick:</strong> Im
          Kaufvertrag ein explizites Verhältnis vereinbaren, z. B. 80 % Gebäude / 20 %
          Grundstück. Das erhöht die AfA-Bemessungsgrundlage sofort und dauerhaft.
        </p>
        <div className="bg-zinc-50 dark:bg-zinc-700/50 rounded-lg p-4 space-y-1">
          <p className="font-medium text-zinc-800 dark:text-zinc-200">Rechenbeispiel</p>
          <p>Kaufpreis 500.000 € – ohne Aufteilung: 70 % Gebäude = 350.000 € AfA-Basis</p>
          <p>Mit vertraglicher Aufteilung 80/20: 400.000 € AfA-Basis</p>
          <p className="font-semibold text-emerald-600 dark:text-emerald-400">
            → 50.000 € mehr Abschreibung über die Laufzeit
          </p>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          ⚠️ Die Aufteilung muss realistisch und nachvollziehbar sein. Ein grob
          unrealistisches Verhältnis (z. B. 95/5 in Berlin-Mitte) wird das Finanzamt
          anfechten.
        </p>
      </div>
    ),
  },
  {
    id: 2,
    title: "Inventar separat ausweisen – und schneller abschreiben",
    summary:
      "Einbauküche, Möbel oder Markise können getrennt vom Gebäude ausgewiesen werden – und sind in 5–10 Jahren abschreibbar statt in 50. Gleichzeitig sinkt die Grunderwerbsteuer.",
    saving: "Weniger Grunderwerbsteuer + schnellere Abschreibung",
    immohubBadge: "Inventar-Posten im Steckbrief mit eigenem AfA-Satz hinterlegen",
    detail: (
      <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          Bewegliche Gegenstände (Einbauküche, Einbaumöbel, Gartengeräte, Markise) sind
          keine Gebäudebestandteile. Sie können separat und deutlich schneller abgeschrieben
          werden.
        </p>
        <p>
          <strong className="text-zinc-800 dark:text-zinc-200">Im Kaufvertrag konkret benennen:</strong>{" "}
          z. B. „Einbauküche: 8.000 €, Einbaumöbel: 5.000 €"
        </p>
        <div className="bg-zinc-50 dark:bg-zinc-700/50 rounded-lg p-4">
          <p className="font-medium text-zinc-800 dark:text-zinc-200 mb-1">Doppelter Vorteil</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>Grunderwerbsteuer fällt nur auf Gebäude/Grundstück an, nicht auf Inventar</li>
            <li>Inventar in 5–10 Jahren abschreibbar statt 50 Jahre beim Gebäude</li>
          </ul>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          ⚠️ Auch hier gilt: realistische Werte. Der Inventaranteil darf nicht
          übertrieben hoch sein.
        </p>
      </div>
    ),
  },
  {
    id: 3,
    title: "Restnutzungsdauer-Gutachten – die legale AfA-Turbo-Taste",
    summary:
      "Das Finanzamt setzt standardmäßig 2 % AfA an (= 50 Jahre). Ein unabhängiges Gutachten kann nachweisen, dass das Gebäude tatsächlich kürzer nutzbar ist – und den AfA-Satz auf 3,33 % oder mehr anheben.",
    saving: "Bis zu 5.300 € mehr Abschreibung pro Jahr",
    immohubBadge: "AfA-Satz manuell anpassen, Gutachten als Dokument hinterlegen",
    detail: (
      <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          Wenn ein zertifizierter Sachverständiger eine Restnutzungsdauer von z. B. 30 Jahren
          feststellt, steigt der jährliche AfA-Satz von 2 % auf 3,33 %.
        </p>
        <div className="bg-zinc-50 dark:bg-zinc-700/50 rounded-lg p-4 space-y-1">
          <p className="font-medium text-zinc-800 dark:text-zinc-200">Rechenbeispiel (AfA-Basis 400.000 €)</p>
          <p>Standard (2 %): 8.000 €/Jahr</p>
          <p>Mit Gutachten (3,33 %): 13.333 €/Jahr</p>
          <p className="font-semibold text-emerald-600 dark:text-emerald-400">
            → 5.333 € mehr Abschreibung/Jahr · Über 10 Jahre: 53.330 €
          </p>
        </div>
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <p className="font-medium text-amber-800 dark:text-amber-300 mb-1">⚠️ Aktuelle Rechtslage (2023)</p>
          <p className="text-amber-700 dark:text-amber-400">
            Das BMF hat mit Schreiben vom 22.02.2023 die Anforderungen verschärft. Gutachten
            werden weiterhin anerkannt, aber das Finanzamt prüft genauer. Nur{" "}
            <strong>zertifizierte Immobiliensachverständige nach DIN EN ISO 17024</strong> sind
            anerkannt. Gutachtenkosten (1.000–3.000 €) sind selbst als Werbungskosten absetzbar.
          </p>
        </div>
      </div>
    ),
  },
  {
    id: 4,
    title: "Kaufnebenkosten gehören zur AfA-Basis",
    summary:
      "Notar, Grundbucheintragung und Maklercourtage erhöhen die Abschreibungsbemessungsgrundlage – die meisten Käufer rechnen das nicht ein und verschenken damit Steuerersparnis.",
    immohubBadge: "Kaufnebenkosten-Rechner berechnet die AfA-relevanten Anteile automatisch",
    detail: (
      <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
        <div className="grid grid-cols-2 gap-3">
          <div className="bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
            <p className="font-medium text-emerald-800 dark:text-emerald-300 mb-1">✓ Gehört zur AfA-Basis</p>
            <ul className="space-y-1 text-xs">
              <li>Notarkosten (anteilig Gebäude)</li>
              <li>Grundbucheintragung (anteilig)</li>
              <li>Maklercourtage beim Kauf (anteilig)</li>
            </ul>
          </div>
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3">
            <p className="font-medium text-red-800 dark:text-red-300 mb-1">✗ Nicht dazu</p>
            <ul className="space-y-1 text-xs">
              <li>Grunderwerbsteuer (seit 2010)</li>
              <li>Finanzierungskosten</li>
              <li>Zinsen</li>
            </ul>
          </div>
        </div>
        <div className="bg-zinc-50 dark:bg-zinc-700/50 rounded-lg p-4 space-y-1">
          <p className="font-medium text-zinc-800 dark:text-zinc-200">Rechenbeispiel</p>
          <p>Kaufpreis 400.000 €, Nebenkosten 25.000 €</p>
          <p className="font-semibold text-emerald-600 dark:text-emerald-400">
            → AfA-Basis nicht 400.000 €, sondern bis zu 420.000 € (je nach Gebäudeanteil)
          </p>
        </div>
        <p>
          Unser{" "}
          <Link href="/tools/kaufnebenkosten" className="underline text-zinc-700 dark:text-zinc-300 hover:text-zinc-900">
            kostenloser Kaufnebenkosten-Rechner
          </Link>{" "}
          weist direkt auf die AfA-relevanten Anteile hin.
        </p>
      </div>
    ),
  },
  {
    id: 5,
    title: "Sanierungskosten vor der ersten Vermietung – die 15 %-Falle",
    summary:
      "Renovierungskosten in den ersten 3 Jahren nach dem Kauf können sofort abgezogen werden – es sei denn, sie übersteigen 15 % des Gebäudekaufpreises. Dann werden sie zur AfA-Basis und sind nur langfristig absetzbar.",
    immohubBadge: "Renovierungskosten speichern, 15 %-Grenze wird automatisch berechnet",
    detail: (
      <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
        <div className="bg-zinc-50 dark:bg-zinc-700/50 rounded-lg p-4">
          <p className="font-medium text-zinc-800 dark:text-zinc-200 mb-2">Die Regel</p>
          <p>
            Renovierungskosten in den ersten <strong>3 Jahren nach Kauf</strong>:
          </p>
          <ul className="mt-2 space-y-2 list-none">
            <li className="flex gap-2">
              <span className="text-emerald-600 font-bold">{"< 15 %"}</span>
              <span>des Gebäude-Kaufpreises → sofort als Werbungskosten abziehbar</span>
            </li>
            <li className="flex gap-2">
              <span className="text-red-500 font-bold">{"> 15 %"}</span>
              <span>→ anschaffungsnahe Herstellungskosten, nur über AfA absetzbar</span>
            </li>
          </ul>
        </div>
        <p>
          <strong className="text-zinc-800 dark:text-zinc-200">Tipp:</strong> Eine geplante
          Großrenovierung kann es sich lohnen auf mehrere Jahre zu verteilen – damit bleibt
          man unter der 15 %-Grenze und zieht die Kosten sofort ab.
        </p>
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          ⚠️ Die 15 %-Grenze bezieht sich auf den Nettokaufpreis des Gebäudes (ohne
          Grundstück, ohne Mehrwertsteuer).
        </p>
      </div>
    ),
  },
  {
    id: 6,
    title: "Eigenkapital clever einsetzen – Zinsen maximieren",
    summary:
      "Schuldzinsen für Immobilienkredite sind voll als Werbungskosten absetzbar. Wer das versteht, denkt zweimal darüber nach, wie viel Eigenkapital er wirklich einbringen will.",
    detail: (
      <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          Es kann steuerlich sinnvoller sein, vorhandenes Eigenkapital in eine separate Anlage
          zu investieren (z. B. ETF) statt alles in die Immobilie einzubringen – und dafür
          mehr Kredit aufzunehmen. Der Zinsaufwand ist voll absetzbar, die Anlagerendite ist
          davon getrennt.
        </p>
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
          <p className="font-medium text-amber-800 dark:text-amber-300 mb-1">
            ⚠️ Wichtiger Hinweis
          </p>
          <p className="text-amber-700 dark:text-amber-400">
            Das ist eine steuerliche Überlegung, keine Finanzberatung. Die persönliche
            Situation (Steuersatz, aktuelles Zinsniveau, Risikobereitschaft) muss individuell
            bewertet werden. Unbedingt mit einem Steuerberater besprechen.
          </p>
        </div>
        <p>
          Unser{" "}
          <Link href="/tools/kredit" className="underline text-zinc-700 dark:text-zinc-300 hover:text-zinc-900">
            kostenloser Kreditrechner
          </Link>{" "}
          zeigt dir, wie sich verschiedene Eigenkapitalquoten auf die monatliche Rate
          auswirken.
        </p>
      </div>
    ),
  },
  {
    id: 7,
    title: "Das richtige Kaufdatum – Spekulationsfrist im Blick",
    summary:
      "Die 10-Jahres-Frist beginnt mit dem notariellen Kaufvertragsdatum, nicht mit dem Eigentumsübergang. Wer das weiß, plant Verkäufe steueroptimal.",
    immohubBadge: "Spekulationssteuer-Countdown läuft ab dem eingetragenen Kaufdatum",
    detail: (
      <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          Eigentumsübergang und Kaufvertragsdatum können Monate auseinanderliegen – steuerlich
          zählt das <strong className="text-zinc-800 dark:text-zinc-200">notarielle Vertragsdatum</strong>.
        </p>
        <div className="bg-zinc-50 dark:bg-zinc-700/50 rounded-lg p-4 space-y-2">
          <p className="font-medium text-zinc-800 dark:text-zinc-200">Steuerfreier Verkauf möglich wenn …</p>
          <ul className="space-y-2">
            <li className="flex gap-2">
              <span className="text-emerald-600 font-bold shrink-0">10 Jahre</span>
              <span>Haltedauer seit Kaufvertrag → immer steuerfrei</span>
            </li>
            <li className="flex gap-2">
              <span className="text-emerald-600 font-bold shrink-0">Selbstnutzung</span>
              <span>Im Verkaufsjahr und den 2 Vorjahren selbst bewohnt → steuerfrei (auch vor 10 Jahren)</span>
            </li>
          </ul>
        </div>
        <p>
          Nutze unseren{" "}
          <Link href="/tools/spekulationssteuer" className="underline text-zinc-700 dark:text-zinc-300 hover:text-zinc-900">
            kostenlosen Spekulationssteuer-Rechner
          </Link>{" "}
          um deinen steuerfreien Termin zu berechnen.
        </p>
      </div>
    ),
  },
  {
    id: 8,
    title: "GbR: Verluste optimal auf Miteigentümer verteilen",
    summary:
      "Wenn mehrere Personen gemeinsam kaufen, sollte der Miteigentümer mit dem höheren Steuersatz einen größeren Anteil halten – so wirken dieselben Abschreibungen steuerlich stärker.",
    immohubBadge: "Miteigentumsanteile hinterlegen, Anlage V anteilig ausgeben",
    detail: (
      <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          Bei gemeinsamem Kauf (Ehepaar, Geschwister, Partner) entsteht automatisch eine GbR.
          Jeder Miteigentümer deklariert seinen Anteil in der eigenen Steuererklärung.
        </p>
        <div className="bg-zinc-50 dark:bg-zinc-700/50 rounded-lg p-4 space-y-1">
          <p className="font-medium text-zinc-800 dark:text-zinc-200">Rechenbeispiel</p>
          <p>Person A (50 % Steuersatz) und Person B (30 % Steuersatz)</p>
          <p>Je 50/50: beide nutzen den gleichen Anteil der Abschreibungen</p>
          <p className="font-semibold text-emerald-600 dark:text-emerald-400">
            Besser: Person A 70 %, Person B 30 % → mehr Steuerwirkung bei Person A
          </p>
        </div>
        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          ⚠️ Die Anteile müssen von Anfang an im Kaufvertrag stehen. Nachträgliche
          Änderungen sind aufwändig und können steuerliche Konsequenzen haben.
        </p>
      </div>
    ),
  },
  {
    id: 9,
    title: "Separates Konto für jede Immobilie – von Tag 1",
    summary:
      "Ein eigenes Konto nur für die Immobilie trennt private und vermietungsbezogene Buchungen sauber. Das erleichtert die Steuererklärung erheblich und schützt vor Fehlern.",
    immohubBadge: "ImmoHub setzt separates Konto als Standard voraus und empfiehlt es ausdrücklich",
    detail: (
      <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">
        <p>
          Alle Mieteingänge und Ausgaben (Reparaturen, Hausgeld, Zinsen) laufen über dieses
          Konto. Keine privaten Transaktionen, die erklärt werden müssten.
        </p>
        <div className="bg-zinc-50 dark:bg-zinc-700/50 rounded-lg p-4">
          <p className="font-medium text-zinc-800 dark:text-zinc-200 mb-2">Vorteile auf einen Blick</p>
          <ul className="space-y-1 list-disc list-inside">
            <li>Einfachere Steuererklärung (Anlage V)</li>
            <li>Klare Übersicht über Einnahmen und Ausgaben</li>
            <li>Keine privaten Transaktionen die erklärt werden müssen</li>
            <li>Bessere Vorbereitung für Betriebsprüfungen</li>
          </ul>
        </div>
        <p>
          Mit ImmoHub importierst du den Kontoauszug direkt als CSV und alle Buchungen werden
          automatisch den richtigen Anlage-V-Zeilen zugeordnet.
        </p>
      </div>
    ),
  },
];

// ── Accordion Item ────────────────────────────────────────────────────────────

function TipCard({ tip }: { tip: Tip }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-white dark:bg-zinc-800 rounded-xl shadow-sm border border-zinc-200 dark:border-zinc-700 overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full text-left px-6 py-5 flex items-start gap-4 hover:bg-zinc-50 dark:hover:bg-zinc-700/50 transition-colors"
        aria-expanded={open}
      >
        {/* Number */}
        <span className="shrink-0 w-8 h-8 rounded-full bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 text-sm font-bold flex items-center justify-center mt-0.5">
          {tip.id}
        </span>
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100 leading-snug">
            {tip.title}
          </h2>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400 leading-relaxed">
            {tip.summary}
          </p>
          {tip.saving && (
            <span className="inline-block mt-2 text-xs font-medium text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-800 px-2 py-0.5 rounded-full">
              💰 {tip.saving}
            </span>
          )}
        </div>
        <span className="shrink-0 text-zinc-400 dark:text-zinc-500 text-lg mt-0.5 transition-transform duration-200" style={{ transform: open ? "rotate(180deg)" : "rotate(0deg)" }}>
          ▾
        </span>
      </button>

      {open && (
        <div className="px-6 pb-5 border-t border-zinc-100 dark:border-zinc-700">
          <div className="pt-4">{tip.detail}</div>
          {tip.immohubBadge && (
            <div className="mt-4 flex items-center gap-2 bg-zinc-900 dark:bg-zinc-100 rounded-lg px-4 py-3">
              <span className="text-xs font-semibold text-white dark:text-zinc-900">
                ✦ ImmoHub: {tip.immohubBadge}
              </span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function SteuertippsPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-900 py-8 px-4">
      <div className="max-w-2xl mx-auto space-y-6">

        {/* Hero */}
        <div>
          <h1 className="text-3xl font-bold text-zinc-900 dark:text-zinc-100 leading-tight">
            9 Steuertipps beim Immobilienkauf
          </h1>
          <p className="mt-2 text-zinc-500 dark:text-zinc-400 text-lg">
            Was erfahrene Investoren wissen – und die meisten Erstkäufer nicht.
            Wer diese Tipps kennt, spart beim ersten Kauf leicht 5.000–20.000 €.
          </p>
        </div>

        {/* Legal disclaimer */}
        <div className="rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-4">
          <p className="text-sm text-amber-700 dark:text-amber-400">
            <span className="font-semibold">Rechtlicher Hinweis:</span> Diese Tipps sind
            allgemeine Informationen und keine Steuerberatung. Steuerliche Regelungen können
            sich ändern. Bitte konsultiere für deine persönliche Situation immer einen
            qualifizierten Steuerberater.
          </p>
        </div>

        {/* Tips */}
        <div className="space-y-4">
          {tips.map((tip) => (
            <TipCard key={tip.id} tip={tip} />
          ))}
        </div>

        {/* CTA */}
        <div className="bg-zinc-900 dark:bg-zinc-100 rounded-xl p-6 text-center space-y-3">
          <p className="text-lg font-bold text-white dark:text-zinc-900">
            Lass ImmoHub deine Abschreibungen automatisch berechnen
          </p>
          <p className="text-sm text-zinc-400 dark:text-zinc-600">
            Kaufpreisaufteilung, AfA-Basis, Inventar, 15 %-Grenze –
            alles an einem Ort, kostenlos.
          </p>
          <Link
            href="/auth"
            className="inline-block bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-100 rounded-lg px-8 py-3 font-semibold hover:bg-zinc-100 dark:hover:bg-zinc-800 transition-colors"
          >
            Jetzt kostenlos starten →
          </Link>
        </div>

        {/* Related tools */}
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 mb-3">
            Passende kostenlose Rechner
          </p>
          <div className="grid grid-cols-2 gap-3">
            {[
              { href: "/tools/rendite", label: "Renditerechner" },
              { href: "/tools/kaufnebenkosten", label: "Kaufnebenkosten" },
              { href: "/tools/spekulationssteuer", label: "Spekulationssteuer" },
              { href: "/tools/kredit", label: "Kreditrechner" },
            ].map((t) => (
              <Link
                key={t.href}
                href={t.href}
                className="bg-white dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-4 py-3 text-sm font-medium text-zinc-700 dark:text-zinc-300 hover:border-zinc-400 dark:hover:border-zinc-500 transition-colors text-center"
              >
                {t.label}
              </Link>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}

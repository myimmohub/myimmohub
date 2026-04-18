"use client";

import { useState } from "react";

interface FaqItem {
  q: string;
  a: string;
}

const FAQ_ITEMS: FaqItem[] = [
  {
    q: "Ist MyImmoHub wirklich kostenlos?",
    a: "Ja – während der Beta-Phase ist MyImmoHub vollständig kostenlos. Du bekommst alle Funktionen ohne Einschränkung. Wenn wir ein Bezahlmodell einführen, wirst du rechtzeitig informiert und kannst selbst entscheiden.",
  },
  {
    q: "Ersetzt MyImmoHub meinen Steuerberater?",
    a: "MyImmoHub ist kein Steuerberater und gibt keine Steuerberatung. Das Tool hilft dir, deine Zahlen strukturiert aufzubereiten – Anlage V, AfA-Tabellen und Werbungskosten. Bei komplexen Fragen empfehlen wir weiterhin einen Steuerberater.",
  },
  {
    q: "Welche Banken werden beim Import unterstützt?",
    a: "Du kannst Kontoauszüge im CSV-Format importieren – das unterstützen alle deutschen Banken (DKB, ING, Commerzbank, Sparkasse u. v. m.). Eine direkte Bankanbindung per Open Banking ist in Planung.",
  },
  {
    q: "Funktioniert MyImmoHub auch für GbR-Vermieter?",
    a: "Ja. MyImmoHub unterstützt die Gesellschaft bürgerlichen Rechts (GbR) mit anteiliger Aufteilung auf alle Gesellschafter, Anlage FB und separaten Steuerexports pro Person.",
  },
  {
    q: "Wie sicher sind meine Daten?",
    a: "Alle Daten liegen verschlüsselt in der EU (Supabase / AWS Frankfurt). Du bist Eigentümer deiner Daten und kannst sie jederzeit löschen. Wir verkaufen keine Daten an Dritte.",
  },
  {
    q: "Was ist die AfA und wie berechnet MyImmoHub sie?",
    a: "Die Absetzung für Abnutzung (AfA) ist die steuerliche Abschreibung eines Gebäudes. MyImmoHub berechnet die lineare Gebäude-AfA (2 % p. a. für Baujahre 1925–2022, 3 % für ab 2023, 2,5 % für vor 1925) sowie die AfA für bewegliche Wirtschaftsgüter (20 % p. a.) automatisch aus deinen Angaben.",
  },
  {
    q: "Kann ich mehrere Immobilien verwalten?",
    a: "Ja, du kannst beliebig viele Immobilien anlegen und verwalten – jede mit eigenem Steuerexport, eigenen Mietern und eigener Buchhaltung.",
  },
];

export default function FaqSection() {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <section className="py-20 bg-white dark:bg-slate-950">
      <div className="mx-auto max-w-3xl px-6">
        {/* Heading */}
        <div className="mb-12 text-center">
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-2">Häufige Fragen</p>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Alles, was du wissen musst
          </h2>
        </div>

        {/* Accordion */}
        <dl className="space-y-2">
          {FAQ_ITEMS.map((item, i) => (
            <div
              key={i}
              className="rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden"
            >
              <dt>
                <button
                  type="button"
                  onClick={() => setOpen(open === i ? null : i)}
                  className="flex w-full items-center justify-between px-5 py-4 text-left text-sm font-medium text-slate-900 dark:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-900 transition"
                  aria-expanded={open === i}
                >
                  <span>{item.q}</span>
                  <ChevronIcon
                    className={`ml-4 h-4 w-4 flex-shrink-0 text-slate-400 transition-transform duration-200 ${
                      open === i ? "rotate-180" : ""
                    }`}
                  />
                </button>
              </dt>
              {open === i && (
                <dd className="px-5 pb-4 text-sm text-slate-500 dark:text-slate-400 leading-relaxed border-t border-slate-100 dark:border-slate-800 pt-3">
                  {item.a}
                </dd>
              )}
            </div>
          ))}
        </dl>
      </div>
    </section>
  );
}

function ChevronIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
    </svg>
  );
}

import Link from "next/link";
import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";
import FaqSection from "@/components/marketing/sections/FaqSection";

/* ═══════════════════════════════════════════════════════════════════════════
   Marketing Landing Page — 14 Sektionen (inkl. Nav + Footer)
   Design-Regeln: max font-semibold, slate+blue Palette, max-w-6xl px-6
══════════════════════════════════════════════════════════════════════════ */

export default function LandingPage() {
  return (
    <>
      {/* 1 ─ Nav */}
      <Nav />

      {/* 2 ─ Hero */}
      <HeroBanner />

      {/* 3 ─ Trust Bar */}
      <TrustBar />

      {/* 4 ─ Problem */}
      <ProblemSection />

      {/* 5 ─ How It Works */}
      <HowItWorks />

      {/* 6 ─ Feature: Anlage V + KI */}
      <FeatureAnlageV />

      {/* 7 ─ Feature: Bankimport */}
      <FeatureBanking />

      {/* 8 ─ Feature: GbR */}
      <FeatureGbR />

      {/* 9 ─ Feature: AfA */}
      <FeatureAfa />

      {/* 10 ─ Rechner-Teaser */}
      <CalculatorTeaser />

      {/* 11 ─ FAQ */}
      <FaqSection />

      {/* 12 ─ Pricing */}
      <PricingSection />

      {/* 13 ─ CTA Banner */}
      <CtaBanner />

      {/* 14 ─ Footer */}
      <Footer />
    </>
  );
}

/* ─── 2 · HeroBanner ────────────────────────────────────────────────────── */
function HeroBanner() {
  return (
    <section className="relative overflow-hidden bg-white py-20 dark:bg-slate-950 sm:py-28">
      {/* Decorative gradient blob */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[600px] rounded-full bg-blue-50 blur-3xl opacity-60 dark:bg-blue-950/30"
      />

      <div className="relative mx-auto max-w-6xl px-6 text-center">
        {/* Badge */}
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-700 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-300">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
          Jetzt kostenlos testen — Beta läuft
        </div>

        {/* Headline */}
        <h1 className="mx-auto max-w-3xl text-4xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-5xl lg:text-6xl">
          Steuerverwaltung für Vermieter —{" "}
          <span className="text-blue-600 dark:text-blue-400">automatisch & ELSTER-fertig</span>
        </h1>

        {/* Sub */}
        <p className="mx-auto mt-6 max-w-2xl text-lg text-slate-500 dark:text-slate-400">
          MyImmoHub importiert deine Kontoauszüge, kategorisiert jede Buchung per KI und füllt
          Anlage&nbsp;V, AfA und GbR-Aufteilung automatisch aus. Ohne Steuerberater. Ohne
          Tabellenchaos.
        </p>

        {/* CTAs */}
        <div className="mt-10 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/auth"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-8 py-3.5 text-base font-medium text-white transition hover:bg-blue-700 sm:w-auto"
          >
            Kostenlos starten
            <ArrowRightIcon className="h-4 w-4" />
          </Link>
          <Link
            href="/tools"
            className="inline-flex w-full items-center justify-center rounded-xl border border-slate-200 bg-white px-8 py-3.5 text-base font-medium text-slate-700 transition hover:border-slate-300 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 sm:w-auto"
          >
            Rechner ausprobieren
          </Link>
        </div>

        {/* Social proof hint */}
        <p className="mt-6 text-sm text-slate-400 dark:text-slate-500">
          Kein Kreditkarte · Keine Kündigung erforderlich · Daten in der EU
        </p>

        {/* App mockup */}
        <div className="mx-auto mt-16 max-w-4xl">
          <AppMockup />
        </div>
      </div>
    </section>
  );
}

/* ─── 3 · TrustBar ──────────────────────────────────────────────────────── */
const TRUST_STATS = [
  { value: "0 €", label: "Kosten in der Beta" },
  { value: "< 5 Min", label: "Einrichtungszeit" },
  { value: "Anlage V + GbR", label: "Vollständige Abdeckung" },
  { value: "ELSTER-kompatibel", label: "Direkt abgabefertig" },
];

function TrustBar() {
  return (
    <section className="border-y border-slate-100 bg-slate-50 py-10 dark:border-slate-800 dark:bg-slate-900/50">
      <div className="mx-auto max-w-6xl px-6">
        <div className="grid grid-cols-2 gap-6 text-center sm:grid-cols-4">
          {TRUST_STATS.map(({ value, label }) => (
            <div key={label}>
              <p className="text-xl font-semibold text-slate-900 dark:text-slate-100">{value}</p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{label}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── 4 · ProblemSection ────────────────────────────────────────────────── */
const PAIN_POINTS = [
  {
    icon: <FolderIcon className="h-6 w-6" />,
    title: "Belege in Excel, Ordner oder Nirgendwo",
    text: "Jeden Herbst beginnt das Zusammensuchen: Kontoauszüge, Quittungen, Rechnungen – in verschiedenen Formaten, über das ganze Jahr verstreut.",
  },
  {
    icon: <CalculatorIcon className="h-6 w-6" />,
    title: "AfA und Anlage V manuell befüllen",
    text: "Gebäude-AfA, Inventar-AfA, §82b-Verteilung, Eigennutzungskürzung – für Privatvermieter eine aufwendige Rechenarbeit mit Fehlerpotenzial.",
  },
  {
    icon: <UsersIcon className="h-6 w-6" />,
    title: "GbR: Wer trägt welchen Anteil?",
    text: "Bei Vermieter-GbRs müssen Einnahmen und Werbungskosten auf alle Gesellschafter aufgeteilt werden – inklusive Anlage FB und separater Steuererklärung pro Person.",
  },
];

function ProblemSection() {
  return (
    <section className="py-20 bg-white dark:bg-slate-950">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-12 text-center">
          <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-2">Das Problem</p>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Steuererklärung als Privatvermieter kostet viel Zeit
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-500 dark:text-slate-400">
            Wer eine oder mehrere Immobilien vermietet, verbringt oft Wochen mit
            Buchhaltungsaufgaben, die sich automatisieren ließen.
          </p>
        </div>

        <div className="grid gap-6 sm:grid-cols-3">
          {PAIN_POINTS.map(({ icon, title, text }) => (
            <div
              key={title}
              className="rounded-xl border border-slate-100 bg-slate-50 p-6 dark:border-slate-800 dark:bg-slate-900"
            >
              <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-red-50 text-red-500 dark:bg-red-950/30 dark:text-red-400">
                {icon}
              </span>
              <h3 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                {title}
              </h3>
              <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{text}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── 5 · HowItWorks ────────────────────────────────────────────────────── */
const HOW_STEPS = [
  {
    num: "01",
    title: "Kontoauszug importieren",
    text: "CSV-Export deiner Bank hochladen – DKB, ING, Sparkasse, Commerzbank und alle anderen Banken werden unterstützt.",
    icon: <UploadIcon className="h-5 w-5" />,
  },
  {
    num: "02",
    title: "KI kategorisiert automatisch",
    text: "Jede Transaktion wird einer steuerlichen Kategorie zugeordnet (Mieteinnahmen, Zinsen, Instandhaltung, …). Du prüfst und korrigierst – in Sekunden.",
    icon: <SparklesIcon className="h-5 w-5" />,
  },
  {
    num: "03",
    title: "Steuerdaten exportieren",
    text: "MyImmoHub berechnet Anlage V, AfA-Tabelle und – bei GbR – die Aufteilung auf alle Gesellschafter. Export als PDF oder ELSTER-Übersicht.",
    icon: <DocumentCheckIcon className="h-5 w-5" />,
  },
];

function HowItWorks() {
  return (
    <section className="py-20 bg-slate-50 dark:bg-slate-900/50">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-14 text-center">
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-2">So funktioniert es</p>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Von Kontoauszug zu Anlage V in drei Schritten
          </h2>
        </div>

        <div className="grid gap-8 sm:grid-cols-3">
          {HOW_STEPS.map(({ num, title, text, icon }) => (
            <div key={num} className="relative">
              {/* Connector line (desktop) */}
              <div className="hidden sm:block absolute top-6 left-full w-full h-px bg-slate-200 dark:bg-slate-700 -translate-y-1/2 last:hidden" />

              <div className="flex items-start gap-4">
                <div className="flex-shrink-0 flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white">
                  {icon}
                </div>
                <div>
                  <span className="text-xs font-medium text-slate-400 dark:text-slate-500">{num}</span>
                  <h3 className="mt-0.5 text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</h3>
                  <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{text}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── 6 · Feature: Anlage V ─────────────────────────────────────────────── */
function FeatureAnlageV() {
  return (
    <FeatureRow
      eyebrow="Anlage V"
      headline="Alle Werbungskosten automatisch erfasst"
      body="MyImmoHub kennt alle relevanten Zeilen der Anlage V: Schuldzinsen, Grundsteuer, Hausgeld, Versicherungen, Verwaltungskosten, Instandhaltung und mehr. Die KI-Kategorisierung ordnet jede Buchung korrekt zu."
      tags={["Schuldzinsen (Zeile 12)", "Grundsteuer (Zeile 13)", "Instandhaltung (Zeile 40)", "§82b-Verteilung"]}
      visual={<AnlageVVisual />}
      reverse={false}
    />
  );
}

/* ─── 7 · Feature: Banking ──────────────────────────────────────────────── */
function FeatureBanking() {
  return (
    <FeatureRow
      eyebrow="Bankimport"
      headline="CSV rein, Kategorien raus — in unter einer Minute"
      body="Lade den Kontoauszug deiner Bank als CSV hoch. Die KI kategorisiert jede Transaktion in Sekunden. Du prüfst, korrigierst falls nötig, und bist fertig. Alle deutschen Banken werden unterstützt."
      tags={["DKB · ING · Sparkasse", "Commerzbank · Postbank", "Alle CSV-Formate", "Manuelle Buchungen"]}
      visual={<BankingVisual />}
      reverse={true}
    />
  );
}

/* ─── 8 · Feature: GbR ──────────────────────────────────────────────────── */
function FeatureGbR() {
  return (
    <FeatureRow
      eyebrow="GbR-Vermieter"
      headline="Anteilige Aufteilung auf alle Gesellschafter"
      body="Bei einer Vermieter-GbR müssen Einnahmen und Ausgaben quotal aufgeteilt werden. MyImmoHub berechnet die Anteile für jeden Gesellschafter, erstellt Anlage FB und liefert separate Steuer-PDFs pro Person."
      tags={["Anlage FB", "Anlage FE", "Beliebig viele Gesellschafter", "Separate PDFs pro Person"]}
      visual={<GbRVisual />}
      reverse={false}
    />
  );
}

/* ─── 9 · Feature: AfA ──────────────────────────────────────────────────── */
function FeatureAfa() {
  return (
    <FeatureRow
      eyebrow="AfA-Berechnung"
      headline="Gebäude, Inventar und §82b-Verteilung automatisch"
      body="MyImmoHub berechnet die lineare Gebäude-AfA (2 % / 2,5 % / 3 % je nach Baujahr), die Inventar-AfA mit 20 % und verteilt §82b-Erhaltungsaufwendungen korrekt über 2–5 Jahre."
      tags={["Gebäude-AfA (linear)", "Inventar-AfA 20 %", "§82b-Verteilung", "Anschaffungsnahe Kosten"]}
      visual={<AfaVisual />}
      reverse={true}
    />
  );
}

/* ─── Shared FeatureRow ─────────────────────────────────────────────────── */
function FeatureRow({
  eyebrow,
  headline,
  body,
  tags,
  visual,
  reverse,
}: {
  eyebrow: string;
  headline: string;
  body: string;
  tags: string[];
  visual: React.ReactNode;
  reverse: boolean;
}) {
  return (
    <section className={`py-20 ${reverse ? "bg-slate-50 dark:bg-slate-900/50" : "bg-white dark:bg-slate-950"}`}>
      <div className="mx-auto max-w-6xl px-6">
        <div className={`flex flex-col gap-12 lg:flex-row lg:items-center ${reverse ? "lg:flex-row-reverse" : ""}`}>
          {/* Text */}
          <div className="flex-1">
            <p className="mb-3 text-sm font-medium text-blue-600 dark:text-blue-400">{eyebrow}</p>
            <h2 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
              {headline}
            </h2>
            <p className="mt-4 text-slate-500 dark:text-slate-400 leading-relaxed">{body}</p>
            {/* Tags */}
            <div className="mt-6 flex flex-wrap gap-2">
              {tags.map((tag) => (
                <span
                  key={tag}
                  className="inline-flex items-center rounded-lg bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/40 dark:text-blue-300"
                >
                  {tag}
                </span>
              ))}
            </div>
            <div className="mt-8">
              <Link
                href="/auth"
                className="inline-flex items-center gap-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
              >
                Kostenlos ausprobieren <ArrowRightIcon className="h-4 w-4" />
              </Link>
            </div>
          </div>
          {/* Visual */}
          <div className="flex-1">{visual}</div>
        </div>
      </div>
    </section>
  );
}

/* ─── 10 · CalculatorTeaser ─────────────────────────────────────────────── */
const CALCULATORS = [
  {
    href: "/tools/rendite",
    title: "Renditerechner",
    description: "Brutto- und Nettorendite einer Immobilie blitzschnell einschätzen.",
    tag: "Rentabilität",
    color: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30 dark:text-emerald-400",
  },
  {
    href: "/tools/kredit",
    title: "Kreditrechner",
    description: "Monatsrate, Zinsanteil und Restschuld für jede Finanzierung.",
    tag: "Finanzierung",
    color: "text-blue-600 bg-blue-50 dark:bg-blue-950/30 dark:text-blue-400",
  },
  {
    href: "/tools/spekulationssteuer",
    title: "Spekulationssteuer",
    description: "Steuerrisiko beim Verkauf vor Ablauf der 10-Jahres-Frist prüfen.",
    tag: "Steuern",
    color: "text-amber-600 bg-amber-50 dark:bg-amber-950/30 dark:text-amber-400",
  },
  {
    href: "/tools/kaufnebenkosten",
    title: "Kaufnebenkosten",
    description: "Grunderwerbsteuer, Notar und Makler direkt überschlagen.",
    tag: "Kaufkosten",
    color: "text-slate-600 bg-slate-100 dark:bg-slate-800 dark:text-slate-300",
  },
];

function CalculatorTeaser() {
  return (
    <section className="py-20 bg-white dark:bg-slate-950">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-12 text-center">
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-2">Kostenlose Rechner</p>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Immobilien-Entscheidungen mit Zahlen treffen
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-slate-500 dark:text-slate-400">
            Vier kostenlose Rechner – kein Account nötig.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {CALCULATORS.map(({ href, title, description, tag, color }) => (
            <Link
              key={href}
              href={href}
              className="group rounded-xl border border-slate-200 bg-white p-5 transition hover:border-blue-300 hover:shadow-sm dark:border-slate-800 dark:bg-slate-900 dark:hover:border-blue-800"
            >
              <span className={`inline-flex items-center rounded-lg px-2.5 py-1 text-xs font-medium ${color} mb-3`}>
                {tag}
              </span>
              <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition">
                {title}
              </h3>
              <p className="mt-1.5 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{description}</p>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

/* ─── 12 · PricingSection ───────────────────────────────────────────────── */
const PRICING_FEATURES = [
  "Unbegrenzte Immobilien",
  "Kontoauszugs-Import (CSV)",
  "KI-Kategorisierung",
  "Anlage V Berechnung",
  "AfA-Verwaltung",
  "GbR-Aufteilung",
  "PDF-Export",
  "Kostenlose Rechner",
];

function PricingSection() {
  return (
    <section className="py-20 bg-slate-50 dark:bg-slate-900/50">
      <div className="mx-auto max-w-6xl px-6">
        <div className="mb-12 text-center">
          <p className="text-sm font-medium text-blue-600 dark:text-blue-400 mb-2">Preise</p>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            Kostenlos in der Beta
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-slate-500 dark:text-slate-400">
            Während der Beta-Phase ist MyImmoHub komplett kostenlos. Alle Funktionen,
            keine Einschränkungen.
          </p>
        </div>

        <div className="mx-auto max-w-md">
          <div className="rounded-2xl border-2 border-blue-600 bg-white p-8 shadow-lg dark:bg-slate-950">
            {/* Price */}
            <div className="mb-6 text-center">
              <span className="inline-flex items-center rounded-full bg-blue-50 px-3 py-1 text-xs font-medium text-blue-700 dark:bg-blue-950/50 dark:text-blue-300 mb-4">
                Beta
              </span>
              <div className="flex items-baseline justify-center gap-1">
                <span className="text-5xl font-semibold text-slate-900 dark:text-slate-100">0 €</span>
                <span className="text-sm text-slate-500 dark:text-slate-400">/Monat</span>
              </div>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Keine Kreditkarte erforderlich</p>
            </div>

            {/* Features */}
            <ul className="mb-8 space-y-3">
              {PRICING_FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-3 text-sm text-slate-700 dark:text-slate-300">
                  <CheckIcon className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                  {f}
                </li>
              ))}
            </ul>

            {/* CTA */}
            <Link
              href="/auth"
              className="block w-full rounded-xl bg-blue-600 py-3 text-center text-sm font-medium text-white transition hover:bg-blue-700"
            >
              Jetzt kostenlos starten
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─── 13 · CtaBanner ────────────────────────────────────────────────────── */
function CtaBanner() {
  return (
    <section className="py-20 bg-blue-600 dark:bg-blue-700">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
          Bereit, Stunden zu sparen?
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-blue-100">
          Starte jetzt kostenlos. Keine Kreditkarte, kein Abo, kein Risiko.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/auth"
            className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-white px-8 py-3.5 text-base font-medium text-blue-600 transition hover:bg-blue-50 sm:w-auto"
          >
            Kostenlos starten <ArrowRightIcon className="h-4 w-4" />
          </Link>
          <Link
            href="/tools"
            className="inline-flex w-full items-center justify-center rounded-xl border border-blue-400 px-8 py-3.5 text-base font-medium text-white transition hover:border-blue-300 hover:bg-blue-500 sm:w-auto"
          >
            Rechner ausprobieren
          </Link>
        </div>
      </div>
    </section>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Visual placeholders (SVG mockups)
══════════════════════════════════════════════════════════════════════════ */

function AppMockup() {
  return (
    <div className="relative mx-auto max-w-3xl">
      <div className="rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-slate-200/50 dark:border-slate-700 dark:bg-slate-900 dark:shadow-slate-900/80 overflow-hidden">
        {/* Window chrome */}
        <div className="flex items-center gap-1.5 border-b border-slate-100 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-950">
          <span className="h-3 w-3 rounded-full bg-red-400" />
          <span className="h-3 w-3 rounded-full bg-amber-400" />
          <span className="h-3 w-3 rounded-full bg-emerald-400" />
          <span className="ml-3 text-xs text-slate-400">MyImmoHub — Steuer 2024</span>
        </div>
        {/* Mock content */}
        <div className="p-6">
          <div className="mb-4 flex items-center justify-between">
            <div className="h-4 w-32 rounded bg-slate-100 dark:bg-slate-800" />
            <div className="h-7 w-24 rounded-lg bg-blue-100 dark:bg-blue-950/50" />
          </div>
          <div className="grid grid-cols-3 gap-3 mb-5">
            {["Mieteinnahmen", "Werbungskosten", "Ergebnis"].map((label, i) => (
              <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs text-slate-400 dark:text-slate-500">{label}</p>
                <p className={`mt-1 text-base font-semibold ${i === 2 ? "text-emerald-600 dark:text-emerald-400" : "text-slate-900 dark:text-slate-100"}`}>
                  {i === 0 ? "12.600 €" : i === 1 ? "8.240 €" : "4.360 €"}
                </p>
              </div>
            ))}
          </div>
          <div className="space-y-2">
            {[
              { label: "Schuldzinsen", amount: "−3.200 €" },
              { label: "Grundsteuer", amount: "−420 €" },
              { label: "Hausgeld", amount: "−1.800 €" },
              { label: "Instandhaltung", amount: "−640 €" },
            ].map(({ label, amount }) => (
              <div key={label} className="flex items-center justify-between rounded-lg px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-900">
                <div className="flex items-center gap-3">
                  <span className="h-2 w-2 rounded-full bg-blue-500" />
                  <span className="text-sm text-slate-600 dark:text-slate-300">{label}</span>
                </div>
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">{amount}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function AnlageVVisual() {
  const rows = [
    { label: "Einnahmen aus V+V (Z. 9)", value: "12.600 €", color: "text-emerald-600 dark:text-emerald-400" },
    { label: "Schuldzinsen (Z. 12)", value: "−3.200 €", color: "text-slate-700 dark:text-slate-300" },
    { label: "Grundsteuer (Z. 13)", value: "−420 €", color: "text-slate-700 dark:text-slate-300" },
    { label: "Hausgeld (Z. 19)", value: "−1.800 €", color: "text-slate-700 dark:text-slate-300" },
    { label: "AfA Gebäude (Z. 33)", value: "−3.240 €", color: "text-slate-700 dark:text-slate-300" },
    { label: "Ergebnis (Z. 51)", value: "3.940 €", color: "text-blue-600 dark:text-blue-400" },
  ];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
          <DocumentCheckIcon className="h-4 w-4" />
        </div>
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Anlage V — Zusammenfassung</span>
      </div>
      <div className="space-y-2.5">
        {rows.map(({ label, value, color }) => (
          <div key={label} className="flex items-center justify-between border-b border-slate-50 pb-2 last:border-0 dark:border-slate-800">
            <span className="text-xs text-slate-500 dark:text-slate-400">{label}</span>
            <span className={`text-xs font-semibold ${color}`}>{value}</span>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 dark:bg-emerald-950/20">
        <CheckIcon className="h-4 w-4 text-emerald-500" />
        <span className="text-xs text-emerald-700 dark:text-emerald-400">ELSTER-kompatibel exportiert</span>
      </div>
    </div>
  );
}

function BankingVisual() {
  const transactions = [
    { date: "01.03.24", text: "Miete März — Mustermann", amount: "+1.050 €", cat: "Mieteinnahmen", ok: true },
    { date: "05.03.24", text: "Stadtwerke München", amount: "−89 €", cat: "Nebenkosten", ok: true },
    { date: "12.03.24", text: "Allianz Versicherung", amount: "−124 €", cat: "Versicherung", ok: true },
    { date: "15.03.24", text: "Handwerker Rg. 2403", amount: "−680 €", cat: "Instandhaltung", ok: true },
  ];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">Transaktionen März 2024</span>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-xs font-medium text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400">
          <SparklesIcon className="h-3 w-3" /> KI kategorisiert
        </span>
      </div>
      <div className="space-y-2">
        {transactions.map(({ date, text, amount, cat, ok }) => (
          <div key={text} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2.5 dark:border-slate-800">
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-900 dark:text-slate-100 truncate">{text}</p>
              <p className="text-xs text-slate-400 dark:text-slate-500">{date} · {cat}</p>
            </div>
            <div className="ml-4 flex items-center gap-2 flex-shrink-0">
              <span className={`text-xs font-semibold ${amount.startsWith("+") ? "text-emerald-600 dark:text-emerald-400" : "text-slate-700 dark:text-slate-300"}`}>
                {amount}
              </span>
              {ok && <CheckIcon className="h-3.5 w-3.5 text-emerald-500" />}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function GbRVisual() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
          <UsersIcon className="h-4 w-4" />
        </div>
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">GbR-Aufteilung 2024</span>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3">
        {[
          { name: "Anna M.", share: "60 %", result: "2.364 €" },
          { name: "Bernd M.", share: "40 %", result: "1.576 €" },
        ].map(({ name, share, result }) => (
          <div key={name} className="rounded-xl border border-slate-100 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-slate-700 dark:text-slate-300">{name}</span>
              <span className="text-xs text-slate-400 dark:text-slate-500">{share}</span>
            </div>
            <p className="text-base font-semibold text-blue-600 dark:text-blue-400">{result}</p>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">Ergebnis Anlage V</p>
          </div>
        ))}
      </div>

      <div className="flex gap-2">
        <div className="flex-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-center dark:border-slate-800 dark:bg-slate-950">
          <p className="text-xs text-slate-400 dark:text-slate-500">Anlage FB</p>
          <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-0.5">✓ erzeugt</p>
        </div>
        <div className="flex-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-center dark:border-slate-800 dark:bg-slate-950">
          <p className="text-xs text-slate-400 dark:text-slate-500">Anlage FE</p>
          <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-0.5">✓ erzeugt</p>
        </div>
        <div className="flex-1 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-center dark:border-slate-800 dark:bg-slate-950">
          <p className="text-xs text-slate-400 dark:text-slate-500">PDF</p>
          <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-0.5">2× Export</p>
        </div>
      </div>
    </div>
  );
}

function AfaVisual() {
  const items = [
    { label: "Gebäude (Bj. 1978)", rate: "2,0 %", amount: "3.240 €", type: "Gebäude-AfA" },
    { label: "Küche & Geräte", rate: "20,0 %", amount: "1.200 €", type: "Inventar-AfA" },
    { label: "Dachsanierung 2023", rate: "§82b / 5 J.", amount: "4.000 €", type: "Erhaltungsaufwand" },
  ];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-400">
          <CalculatorIcon className="h-4 w-4" />
        </div>
        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">AfA-Übersicht 2024</span>
      </div>
      <div className="space-y-3">
        {items.map(({ label, rate, amount, type }) => (
          <div key={label} className="rounded-xl border border-slate-100 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-950">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-xs font-medium text-slate-900 dark:text-slate-100">{label}</p>
                <p className="text-xs text-slate-400 dark:text-slate-500 mt-0.5">{type} · {rate}</p>
              </div>
              <span className="text-sm font-semibold text-blue-600 dark:text-blue-400 flex-shrink-0">{amount}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-4 flex items-center justify-between rounded-lg bg-blue-50 px-3 py-2 dark:bg-blue-950/20">
        <span className="text-xs font-medium text-blue-700 dark:text-blue-300">Gesamt AfA 2024</span>
        <span className="text-sm font-semibold text-blue-700 dark:text-blue-300">8.440 €</span>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
   Icon components
══════════════════════════════════════════════════════════════════════════ */

function ArrowRightIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M3 10a.75.75 0 01.75-.75h10.638L10.23 5.29a.75.75 0 111.04-1.08l5.5 5.25a.75.75 0 010 1.08l-5.5 5.25a.75.75 0 11-1.04-1.08l4.158-3.96H3.75A.75.75 0 013 10z" clipRule="evenodd" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 20 20" fill="currentColor">
      <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z" clipRule="evenodd" />
    </svg>
  );
}

function FolderIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M2 7a2 2 0 012-2h4.586a1 1 0 01.707.293l1.414 1.414A1 1 0 0011.414 7H20a2 2 0 012 2v9a2 2 0 01-2 2H4a2 2 0 01-2-2V7z" />
    </svg>
  );
}

function CalculatorIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="2" />
      <path d="M8 6h8M8 10h.01M12 10h.01M16 10h.01M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01" />
    </svg>
  );
}

function UsersIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
    </svg>
  );
}

function UploadIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M17 8l-5-5-5 5M12 3v12" />
    </svg>
  );
}

function SparklesIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5L12 3zM5 17l.75 2.25L8 20l-2.25.75L5 23l-.75-2.25L2 20l2.25-.75L5 17zM19 3l.75 2.25L22 6l-2.25.75L19 9l-.75-2.25L16 6l2.25-.75L19 3z" />
    </svg>
  );
}

function DocumentCheckIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" />
      <polyline points="14 2 14 8 20 8" />
      <path d="M9 15l2 2 4-4" />
    </svg>
  );
}

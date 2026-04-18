import Link from "next/link";

interface CtaCardProps {
  text: string;
}

export default function CtaCard({ text }: CtaCardProps) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900">
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">{text}</p>
      <Link
        href="/auth"
        className="block w-full rounded-xl bg-blue-600 py-3 text-center text-sm font-medium text-white transition hover:bg-blue-700"
      >
        Kostenlos starten
      </Link>
    </div>
  );
}

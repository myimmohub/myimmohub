interface ResultRowProps {
  label: string;
  value: string;
  valueClass?: string;
  last?: boolean;
}

export default function ResultRow({ label, value, valueClass, last = false }: ResultRowProps) {
  return (
    <div
      className={`flex items-center justify-between py-2 ${
        !last ? "border-b border-slate-100 dark:border-slate-800" : ""
      }`}
    >
      <span className="text-sm text-slate-500 dark:text-slate-400">{label}</span>
      <span className={`text-sm font-medium ${valueClass ?? "text-slate-900 dark:text-slate-100"}`}>
        {value}
      </span>
    </div>
  );
}

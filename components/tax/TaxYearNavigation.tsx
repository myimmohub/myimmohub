"use client";

import Link from "next/link";

type TaxYearNavigationProps = {
  propertyId: string;
  taxYear: number;
  active: "anlage-v" | "anlage-v-export" | "gbr" | "gbr-export" | "gbr-pdf";
  hasGbr?: boolean;
};

export default function TaxYearNavigation({
  propertyId,
  taxYear,
  active,
  hasGbr = false,
}: TaxYearNavigationProps) {
  const items = [
    { key: "anlage-v", label: "Anlage V", href: `/dashboard/properties/${propertyId}/tax/${taxYear}` },
    { key: "anlage-v-export", label: "Anlage V Export", href: `/dashboard/properties/${propertyId}/tax/${taxYear}/export` },
    ...(hasGbr
      ? [
          { key: "gbr", label: "FE/FB", href: `/dashboard/properties/${propertyId}/tax/${taxYear}/gbr` },
          { key: "gbr-export", label: "FE/FB Export", href: `/dashboard/properties/${propertyId}/tax/${taxYear}/gbr/export` },
          { key: "gbr-pdf", label: "PDF", href: `/dashboard/properties/${propertyId}/tax/${taxYear}/gbr/pdf` },
        ]
      : []),
  ] as const;

  return (
    <div className="overflow-x-auto">
      <div className="inline-flex min-w-full gap-2 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {items.map((item) => {
          const isActive = item.key === active;
          return (
            <Link
              key={item.key}
              href={item.href}
              className={`rounded-xl px-4 py-2 text-sm font-medium whitespace-nowrap transition ${
                isActive
                  ? "bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900"
                  : "text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800"
              }`}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </div>
  );
}

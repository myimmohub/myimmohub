import type { Metadata } from "next";
import ArticleLayout from "@/components/marketing/ArticleLayout";
import Content from "@/content/steuer-tipps/grundsteuer-werbungskosten.mdx";

export const metadata: Metadata = {
  title: "Grundsteuer und Nebenkosten als Werbungskosten absetzen",
  description:
    "Welche laufenden Kosten Vermieter in der Anlage V geltend machen können — Grundsteuer, Versicherungen, Wasser und Hausgeld.",
};

export default function Page() {
  return (
    <ArticleLayout
      title="Grundsteuer und Nebenkosten als Werbungskosten absetzen"
      description="Welche laufenden Kosten Vermieter in der Anlage V geltend machen können — Grundsteuer, Versicherungen, Wasser und Hausgeld."
      date="2024-07-15"
      readingTime="5 Min. Lesezeit"
      tags={["Grundsteuer", "Nebenkosten", "Werbungskosten"]}
    >
      <Content />
    </ArticleLayout>
  );
}

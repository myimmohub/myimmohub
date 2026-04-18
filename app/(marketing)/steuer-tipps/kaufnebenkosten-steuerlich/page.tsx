import type { Metadata } from "next";
import ArticleLayout from "@/components/marketing/ArticleLayout";
import Content from "@/content/steuer-tipps/kaufnebenkosten-steuerlich.mdx";

export const metadata: Metadata = {
  title: "Kaufnebenkosten: Was Vermieter von der Steuer absetzen können",
  description:
    "Grunderwerbsteuer, Notar und Makler erhöhen die AfA-Basis — aber nicht sofort. Alles zur steuerlichen Behandlung.",
};

export default function Page() {
  return (
    <ArticleLayout
      title="Kaufnebenkosten: Was Vermieter von der Steuer absetzen können"
      description="Grunderwerbsteuer, Notar und Makler erhöhen die AfA-Basis — aber nicht sofort. Alles zur steuerlichen Behandlung."
      date="2024-08-05"
      readingTime="5 Min. Lesezeit"
      tags={["Kaufnebenkosten", "Grunderwerbsteuer", "AfA"]}
    >
      <Content />
    </ArticleLayout>
  );
}

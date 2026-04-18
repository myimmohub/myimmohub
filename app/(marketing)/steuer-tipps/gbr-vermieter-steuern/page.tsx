import type { Metadata } from "next";
import ArticleLayout from "@/components/marketing/ArticleLayout";
import Content from "@/content/steuer-tipps/gbr-vermieter-steuern.mdx";

export const metadata: Metadata = {
  title: "GbR als Vermieter: Anlage FE, Anlage FB und Ergebnisaufteilung",
  description:
    "Was es steuerlich bedeutet, wenn mehrere Personen gemeinsam vermieten, und welche Formulare nötig sind.",
};

export default function Page() {
  return (
    <ArticleLayout
      title="GbR als Vermieter: Anlage FE, Anlage FB und Ergebnisaufteilung"
      description="Was es steuerlich bedeutet, wenn mehrere Personen gemeinsam vermieten, und welche Formulare nötig sind."
      date="2024-10-05"
      readingTime="8 Min. Lesezeit"
      tags={["GbR", "Anlage FB", "Anlage FE"]}
    >
      <Content />
    </ArticleLayout>
  );
}

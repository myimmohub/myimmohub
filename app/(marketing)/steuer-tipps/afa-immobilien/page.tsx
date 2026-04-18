import type { Metadata } from "next";
import ArticleLayout from "@/components/marketing/ArticleLayout";
import Content from "@/content/steuer-tipps/afa-immobilien.mdx";

export const metadata: Metadata = {
  title: "AfA Immobilien: Gebäude, Inventar und §82b richtig abschreiben",
  description:
    "AfA-Sätze nach Baujahr, Inventar-AfA mit 20 %, §82b-Verteilung und die 15 %-Grenze für anschaffungsnahe Kosten.",
};

export default function Page() {
  return (
    <ArticleLayout
      title="AfA Immobilien: Gebäude, Inventar und §82b richtig abschreiben"
      description="AfA-Sätze nach Baujahr, Inventar-AfA mit 20 %, §82b-Verteilung und die 15 %-Grenze für anschaffungsnahe Kosten."
      date="2024-11-15"
      readingTime="8 Min. Lesezeit"
      tags={["AfA", "Abschreibung", "Anlage V"]}
    >
      <Content />
    </ArticleLayout>
  );
}

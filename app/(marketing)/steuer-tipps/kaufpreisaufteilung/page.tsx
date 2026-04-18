import type { Metadata } from "next";
import ArticleLayout from "@/components/marketing/ArticleLayout";
import Content from "@/content/steuer-tipps/kaufpreisaufteilung.mdx";

export const metadata: Metadata = {
  title: "Kaufpreisaufteilung: Gebäude vs. Grundstück steuerlich optimieren",
  description:
    "Wie du den Kaufpreis zwischen Gebäude und Grundstück aufteilst, beeinflusst direkt deine jährliche AfA.",
};

export default function Page() {
  return (
    <ArticleLayout
      title="Kaufpreisaufteilung: Gebäude vs. Grundstück steuerlich optimieren"
      description="Wie du den Kaufpreis zwischen Gebäude und Grundstück aufteilst, beeinflusst direkt deine jährliche AfA."
      date="2024-10-20"
      readingTime="6 Min. Lesezeit"
      tags={["AfA", "Kaufpreisaufteilung", "Steuertipps"]}
    >
      <Content />
    </ArticleLayout>
  );
}

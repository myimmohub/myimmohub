import type { Metadata } from "next";
import ArticleLayout from "@/components/marketing/ArticleLayout";
import Content from "@/content/steuer-tipps/erhaltungsaufwand-82b.mdx";

export const metadata: Metadata = {
  title: "§82b Erhaltungsaufwand: Verteilung auf 2 bis 5 Jahre",
  description:
    "Wann die freiwillige Verteilung von Instandhaltungskosten sinnvoll ist und wie sie steuerlich korrekt erfasst wird.",
};

export default function Page() {
  return (
    <ArticleLayout
      title="§82b Erhaltungsaufwand: Verteilung auf 2 bis 5 Jahre"
      description="Wann die freiwillige Verteilung von Instandhaltungskosten sinnvoll ist und wie sie steuerlich korrekt erfasst wird."
      date="2024-09-25"
      readingTime="5 Min. Lesezeit"
      tags={["§82b", "Erhaltungsaufwand", "Instandhaltung"]}
    >
      <Content />
    </ArticleLayout>
  );
}

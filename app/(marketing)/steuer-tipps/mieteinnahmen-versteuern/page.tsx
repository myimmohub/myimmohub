import type { Metadata } from "next";
import ArticleLayout from "@/components/marketing/ArticleLayout";
import Content from "@/content/steuer-tipps/mieteinnahmen-versteuern.mdx";

export const metadata: Metadata = {
  title: "Mieteinnahmen versteuern: Grundlagen der Anlage V",
  description:
    "Wie Mieteinnahmen in Deutschland besteuert werden, wie das Zufluss-Prinzip funktioniert und wie der Werbungskostenüberschuss entsteht.",
};

export default function Page() {
  return (
    <ArticleLayout
      title="Mieteinnahmen versteuern: Grundlagen der Anlage V"
      description="Wie Mieteinnahmen in Deutschland besteuert werden, wie das Zufluss-Prinzip funktioniert und wie der Werbungskostenüberschuss entsteht."
      date="2024-08-20"
      readingTime="6 Min. Lesezeit"
      tags={["Mieteinnahmen", "Anlage V", "Einkommensteuer"]}
    >
      <Content />
    </ArticleLayout>
  );
}

import type { Metadata } from "next";
import ArticleLayout from "@/components/marketing/ArticleLayout";
import Content from "@/content/steuer-tipps/anlage-v-werbungskosten.mdx";

export const metadata: Metadata = {
  title: "Anlage V: Welche Werbungskosten Vermieter absetzen dürfen",
  description:
    "Vollständige Übersicht aller abzugsfähigen Werbungskosten in der Anlage V – von Schuldzinsen über Instandhaltung bis AfA.",
};

export default function Page() {
  return (
    <ArticleLayout
      title="Anlage V: Welche Werbungskosten Vermieter absetzen dürfen"
      description="Vollständige Übersicht aller abzugsfähigen Werbungskosten in der Anlage V – von Schuldzinsen über Instandhaltung bis AfA."
      date="2024-11-01"
      readingTime="7 Min. Lesezeit"
      tags={["Anlage V", "Werbungskosten", "Steuertipps"]}
    >
      <Content />
    </ArticleLayout>
  );
}

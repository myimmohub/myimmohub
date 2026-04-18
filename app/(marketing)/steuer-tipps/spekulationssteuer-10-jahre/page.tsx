import type { Metadata } from "next";
import ArticleLayout from "@/components/marketing/ArticleLayout";
import Content from "@/content/steuer-tipps/spekulationssteuer-10-jahre.mdx";

export const metadata: Metadata = {
  title: "Spekulationssteuer: Die 10-Jahres-Frist beim Immobilienverkauf",
  description:
    "Wann wird der Immobilienverkauf steuerpflichtig? Alles zur 10-Jahres-Frist, Selbstnutzungsregel und wie du die Steuer legal vermeidest.",
};

export default function Page() {
  return (
    <ArticleLayout
      title="Spekulationssteuer: Die 10-Jahres-Frist beim Immobilienverkauf"
      description="Wann wird der Immobilienverkauf steuerpflichtig? Alles zur 10-Jahres-Frist, Selbstnutzungsregel und wie du die Steuer legal vermeidest."
      date="2024-09-10"
      readingTime="6 Min. Lesezeit"
      tags={["Spekulationssteuer", "Immobilienverkauf", "§23 EStG"]}
    >
      <Content />
    </ArticleLayout>
  );
}

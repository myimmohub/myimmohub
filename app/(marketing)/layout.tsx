import type { Metadata } from "next";
import Nav from "@/components/marketing/Nav";
import Footer from "@/components/marketing/Footer";

export const metadata: Metadata = {
  title: {
    default: "MyImmoHub – Steuerverwaltung für Vermieter",
    template: "%s | MyImmoHub",
  },
  description:
    "MyImmoHub hilft deutschen Privatvermietern bei der kompletten steuerlichen Verwaltung – Anlage V, AfA, GbR-Aufteilung und ELSTER-Export auf einen Klick.",
};

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <Nav />
      <main className="flex-1">{children}</main>
      <Footer />
    </>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import UploadDocument from "@/components/UploadDocument";
import ContractExtraction from "@/components/ContractExtraction";
import { supabase } from "@/lib/supabase";
import type { ContractData } from "@/lib/ai/extractContract";

type PropertyRecord = {
  id: string;
  name: string;
};

export default function PropertyDetailPage() {
  const params = useParams<{ id: string }>();
  const propertyId = params.id;

  const [property, setProperty] = useState<PropertyRecord | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);
  const [analysisText, setAnalysisText] = useState<string | null>(null);
  const [contractData, setContractData] = useState<ContractData | null>(null);

  useEffect(() => {
    const loadProperty = async () => {
      setErrorMessage(null);
      setIsLoading(true);

      const { data, error } = await supabase
        .from("properties")
        .select("id, name")
        .eq("id", propertyId)
        .single();

      if (error) {
        setErrorMessage(error.message);
        setIsLoading(false);
        return;
      }

      setProperty(data);
      setIsLoading(false);
    };

    if (propertyId) {
      void loadProperty();
    }
  }, [propertyId]);

  const handleAnalyzeDocument = async (path: string) => {
    if (!path) return;

    setIsAnalyzing(true);
    setAnalyzeError(null);
    setAnalysisText(null);
    setContractData(null);

    try {
      // Schritt 1: Text aus Dokument auslesen
      const analyzeResponse = await fetch("/api/analyze-document", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, bucket: "documents" }),
      });

      const analyzeData = (await analyzeResponse.json()) as { text?: string; error?: string };
      if (!analyzeResponse.ok) {
        throw new Error(analyzeData.error || "Dokument-Analyse fehlgeschlagen.");
      }

      const text = analyzeData.text || "";
      setAnalysisText(text);

      // Schritt 2: Vertragsdaten extrahieren
      const extractResponse = await fetch("/api/extract-contract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });

      const extractData = (await extractResponse.json()) as ContractData & { error?: string };
      if (!extractResponse.ok) {
        throw new Error(extractData.error || "Vertragsextraktion fehlgeschlagen.");
      }

      setContractData(extractData);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Dokument-Analyse fehlgeschlagen.";
      setAnalyzeError(message);
    } finally {
      setIsAnalyzing(false);
    }
  };

  return (
    <main className="flex min-h-screen justify-center bg-slate-50 px-4 py-10 dark:bg-slate-950">
      <section className="w-full max-w-2xl space-y-6 rounded-2xl border border-slate-200 bg-white p-8 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        {isLoading ? (
          <p className="text-sm text-slate-600 dark:text-slate-400">Lade Immobilie...</p>
        ) : null}

        {!isLoading && errorMessage ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
            {errorMessage}
          </p>
        ) : null}

        {!isLoading && !errorMessage ? (
          <>
            <div>
              <p className="text-sm text-slate-500 dark:text-slate-400">Immobilie</p>
              <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
                {property?.name || "Unbenannte Immobilie"}
              </h1>
            </div>

            <UploadDocument
              propertyId={propertyId}
              onUploaded={(path) => {
                setAnalyzeError(null);
                setAnalysisText(null);
                setContractData(null);
                void handleAnalyzeDocument(path);
              }}
            />

            {isAnalyzing ? (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Dokument wird analysiert...</p>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                  <div className="h-full w-1/2 animate-pulse rounded-full bg-blue-600 dark:bg-blue-500" />
                </div>
              </div>
            ) : null}

            {analyzeError ? (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/40 dark:text-red-300">
                {analyzeError}
              </p>
            ) : null}

            {contractData ? (
              <ContractExtraction propertyId={propertyId} data={contractData} />
            ) : null}
          </>
        ) : null}
      </section>
    </main>
  );
}

import { NextResponse } from "next/server";
import { extractContractData } from "@/lib/ai/extractContract";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: string };

    if (!body.text) {
      return NextResponse.json({ error: "Missing required field: text." }, { status: 400 });
    }

    const data = await extractContractData(body.text);
    return NextResponse.json(data);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

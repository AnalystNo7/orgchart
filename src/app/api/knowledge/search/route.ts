import { NextResponse } from "next/server";
import { retrieveChunks } from "@/lib/rag";

// POST — semantic search in knowledge base
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { query, topK = 5, category } = body;

    if (!query) {
      return NextResponse.json({ error: "query обязателен" }, { status: 400 });
    }

    const results = await retrieveChunks(query, topK, category);

    return NextResponse.json({ results });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

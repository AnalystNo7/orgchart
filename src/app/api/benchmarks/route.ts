import { NextResponse } from "next/server";
import { getBenchmarks, listAvailableMetrics, listAvailableIndustries, type BenchmarkCategory } from "@/lib/ai/benchmarks";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category") as BenchmarkCategory | null;
  const metric = searchParams.get("metric") || undefined;
  const industry = searchParams.get("industry") || undefined;
  const companySize = searchParams.get("companySize") || undefined;

  const benchmarks = getBenchmarks({
    category: category || undefined,
    metric,
    industry,
    companySize,
  });

  return NextResponse.json({
    benchmarks,
    availableMetrics: listAvailableMetrics(),
    availableIndustries: listAvailableIndustries(),
  });
}

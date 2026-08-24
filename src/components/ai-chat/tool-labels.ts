// The dictionary moved to a server-safe module so the orchestrator can filter
// tool names out of streamed text; this re-export keeps client imports stable.
export { toolLabel } from "@/lib/ai/tool-labels";

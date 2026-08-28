import { redirect } from "next/navigation";

// The page moved under the tabbed "Настройки" section; keep old bookmarks alive.
export default function LegacyAdminLlmRedirect() {
  redirect("/admin/settings/llm");
}

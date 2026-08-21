import { redirect } from "next/navigation";

// The section index: land on the first tab.
export default function AdminSettingsIndex() {
  redirect("/admin/settings/llm");
}

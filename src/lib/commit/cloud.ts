import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const url = import.meta.env["VITE_SUPABASE_URL"];
const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"];

export const cloudConfigured = Boolean(url && key);
let client: SupabaseClient | null = null;

export function getCloudClient(): SupabaseClient | null {
  if (!cloudConfigured || typeof window === "undefined") return null;
  client ??= createBrowserClient(url, key);
  return client;
}

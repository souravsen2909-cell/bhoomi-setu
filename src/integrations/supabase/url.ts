/**
 * Normalizes a Supabase URL by trimming, removing any trailing slashes,
 * and stripping any inadvertent `/rest/v1` path suffix (e.g. if the user copied
 * the REST API endpoint URL rather than the root project URL).
 */
export function normalizeSupabaseUrl(url?: string | null): string {
  if (!url) return "";
  let cleaned = url.trim();
  cleaned = cleaned.replace(/\/+$/, "");
  cleaned = cleaned.replace(/\/rest\/v1\/?$/, "");
  return cleaned.replace(/\/+$/, "");
}

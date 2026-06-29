/** Only allow http(s) links; reject javascript:/data: and other schemes.
 * Shared by every component that renders a cited source/outlet link. */
export function safeHref(url: string): string | null {
  try {
    const { protocol } = new URL(url);
    return protocol === 'https:' || protocol === 'http:' ? url : null;
  } catch {
    return null;
  }
}

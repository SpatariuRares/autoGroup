/** Dominio di una tab senza "www.", oppure null se l'URL non ha un host (es. file://). */
export function domainOf(url: string): string | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (!host) return null;
    return host.startsWith('www.') ? host.slice(4) : host;
  } catch {
    return null;
  }
}

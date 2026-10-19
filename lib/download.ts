/**
 * Saving a file the API answered (Export CSV): the server's file name from its
 * `Content-Disposition`, and the bytes handed to the browser as a download - a temporary
 * `<a download>` over an object URL, so the bearer-read file is saved without a new tab.
 */

/**
 * The file name in a `Content-Disposition: attachment; filename=...` header (RFC 6266's
 * `filename*=UTF-8''...` first), or null when it names none. Only the last path segment is kept.
 */
export function attachmentName(header: string | null | undefined): string | null {
  if (!header) return null;
  let name: string | null = null;
  const extended = /filename\*\s*=\s*(?:UTF-8|utf-8)''([^;]+)/.exec(header);
  if (extended) {
    try {
      name = decodeURIComponent(extended[1].trim());
    } catch {
      name = null; // a malformed escape: fall back to the plain parameter
    }
  }
  if (!name) {
    const plain = /filename\s*=\s*(?:"([^"]*)"|([^;]+))/.exec(header);
    name = plain ? (plain[1] ?? plain[2]).trim() : null;
  }
  const base = name?.split(/[\/]/).pop()?.trim();
  return base ? base : null;
}

/** Hand `blob` to the browser as a download named `name`. */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.style.display = "none";
  document.body.appendChild(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Revoked after the click has been handled: revoking at once can cancel the download.
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

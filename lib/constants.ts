/**
 * Gemeinsam genutzte Konstanten — importierbar aus Client- und Server-Komponenten.
 */

export const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png"];

export function sanitizeFileName(name: string): string {
  return name.replace(/\s+/g, "_").replace(/[^\w.\-]/g, "");
}

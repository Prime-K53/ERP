/**
 * fontLoader.ts
 *
 * Exports the Vite-resolved asset URL strings for Comic Sans font variants.
 * Vite processes `.ttf` static imports at build time and produces hashed public
 * URLs (e.g. `/assets/comic-AbC123.ttf`), which are exactly what
 * @react-pdf/renderer expects for its `Font.register({ src })` field.
 *
 * Do NOT fetch these and convert to ArrayBuffer/Uint8Array — the renderer
 * calls `.split()` on the src internally, so it must receive a string.
 */
import comicNormal from '../assets/fonts/comic.ttf';
import comicBold from '../assets/fonts/comicbd.ttf';
import comicItalic from '../assets/fonts/comici.ttf';
import comicBoldItalic from '../assets/fonts/comicz.ttf';

/** Vite-resolved public URLs for each Comic Sans variant. */
export const COMIC_SANS_URLS = {
  normal: comicNormal as string,
  bold: comicBold as string,
  italic: comicItalic as string,
  boldItalic: comicBoldItalic as string,
} as const;

/**
 * Returns the Vite-resolved URL string for the requested Comic Sans variant.
 */
export function getComicSansUrl(
  weight: 'normal' | 'bold' = 'normal',
  style: 'normal' | 'italic' = 'normal',
): string {
  if (weight === 'bold' && style === 'italic') return COMIC_SANS_URLS.boldItalic;
  if (weight === 'bold') return COMIC_SANS_URLS.bold;
  if (style === 'italic') return COMIC_SANS_URLS.italic;
  return COMIC_SANS_URLS.normal;
}

export async function getPdfPageCount(blob: Blob): Promise<number> {
  try {
    const buffer = await blob.arrayBuffer();
    const text = new TextDecoder('ascii', { fatal: false }).decode(buffer);
    const matches = text.match(/\/Type\s*\/Page[^s]/g);
    return matches ? matches.length : 1;
  } catch {
    return 1;
  }
}

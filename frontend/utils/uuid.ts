const NAMESPACE = new TextEncoder().encode('d6a7e280-8c0e-4a7e-9b1a-1e5f2c3d4a5b');

let encoder: TextEncoder;

export async function stringToUuid5(input: string): Promise<string> {
  encoder ??= new TextEncoder();
  const data = new Uint8Array([...NAMESPACE, ...encoder.encode(input)]);
  const hash = await crypto.subtle.digest('SHA-1', data);
  const bytes = new Uint8Array(hash, 0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}

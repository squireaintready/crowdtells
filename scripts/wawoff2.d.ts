// wawoff2 ships no type declarations; we only use decompress (woff2 → ttf).
declare module 'wawoff2' {
  export function decompress(input: Uint8Array): Promise<Uint8Array>;
  export function compress(input: Uint8Array): Promise<Uint8Array>;
}

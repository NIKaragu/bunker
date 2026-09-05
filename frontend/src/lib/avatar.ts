export const avatarDataUrl = (seed: string): string => {
  const normalized = seed.trim() || "B";
  let hash = 0;
  for (const character of normalized) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  const hue = hash % 360;
  const initials = normalized.slice(0, 2).toUpperCase().replace(/[<>&"']/g, "");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128"><rect width="128" height="128" rx="32" fill="hsl(${hue} 32% 25%)"/><circle cx="64" cy="64" r="45" fill="hsl(${hue} 72% 58%)"/><text x="64" y="74" text-anchor="middle" font-family="system-ui,sans-serif" font-size="34" font-weight="800" fill="#101817">${initials}</text></svg>`;
  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
};

const MAX_AVATAR_BYTES = 256_000;
const MAX_DIMENSION = 512;

export const compressAvatar = async (file: File): Promise<{ dataUrl: string; mimeType: "image/webp"; bytes: number }> => {
  if (!file.type.startsWith("image/")) throw new Error("Choose a PNG, JPEG or WebP image.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  let quality = 0.86;
  let blob: Blob | null = null;
  while (quality >= 0.45) {
    blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/webp", quality));
    if (blob && blob.size <= MAX_AVATAR_BYTES) break;
    quality -= 0.1;
  }
  if (!blob || blob.size > MAX_AVATAR_BYTES) throw new Error("Image remains larger than 256 KB after compression.");
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Could not read the image."));
    reader.readAsDataURL(blob);
  });
  return { dataUrl, mimeType: "image/webp", bytes: blob.size };
};

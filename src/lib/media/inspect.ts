import type { Asset, AssetKind } from "../project/types";

const accepted = new Set(["video/mp4", "video/webm", "video/quicktime", "video/ogg", "video/x-matroska", "image/png", "image/jpeg", "image/webp", "image/gif", "audio/mpeg", "audio/wav", "audio/x-wav", "audio/ogg", "audio/webm", "audio/mp4"]);

async function header(file: File): Promise<Uint8Array> {
  return new Uint8Array(await file.slice(0, 32).arrayBuffer());
}

function signatureIsPlausible(file: File, bytes: Uint8Array): boolean {
  const type = file.type.toLowerCase();
  if (type === "image/png") return bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  if (type === "image/jpeg") return bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (type === "image/gif") return String.fromCharCode(...bytes.slice(0, 3)) === "GIF";
  if (type === "image/webp") return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (type.includes("mp4") || type.includes("quicktime")) return String.fromCharCode(...bytes.slice(4, 8)) === "ftyp";
  if (type.includes("webm") || type.includes("ogg")) return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3 || String.fromCharCode(...bytes.slice(0, 4)) === "OggS";
  if (type.includes("wav")) return String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WAVE";
  if (type.includes("mpeg") || type.includes("mp3")) return String.fromCharCode(...bytes.slice(0, 3)) === "ID3" || bytes[0] === 0xff && (bytes[1] & 0xe0) === 0xe0;
  if (type.includes("matroska")) return bytes[0] === 0x1a && bytes[1] === 0x45 && bytes[2] === 0xdf && bytes[3] === 0xa3;
  return false;
}

function mediaMetadata(file: File, kind: "video" | "audio"): Promise<{ durationMs: number | null; width: number | null; height: number | null }> {
  return new Promise((resolve) => {
    const media = document.createElement(kind);
    const url = URL.createObjectURL(file);
    media.preload = "metadata";
    media.onloadedmetadata = () => {
      const result = { durationMs: Number.isFinite(media.duration) ? Math.round(media.duration * 1000) : null, width: kind === "video" ? (media as HTMLVideoElement).videoWidth || null : null, height: kind === "video" ? (media as HTMLVideoElement).videoHeight || null : null };
      URL.revokeObjectURL(url);
      resolve(result);
    };
    media.onerror = () => { URL.revokeObjectURL(url); resolve({ durationMs: null, width: null, height: null }); };
    media.src = url;
  });
}

export async function inspectUpload(file: File, projectId: string, workspaceId: string): Promise<Asset> {
  const mimeType = file.type.toLowerCase();
  if (!accepted.has(mimeType)) throw new Error(`${file.name}: unsupported media type (${mimeType || "unknown"}).`);
  if (file.size === 0) throw new Error(`${file.name}: file is empty.`);
  if (file.size > 8 * 1024 * 1024 * 1024) throw new Error(`${file.name}: browser import limit is 8 GB.`);
  const bytes = await header(file);
  if (!signatureIsPlausible(file, bytes)) throw new Error(`${file.name}: media signature does not match its declared MIME type.`);
  const kind: AssetKind = mimeType.startsWith("video/") ? "video" : mimeType.startsWith("image/") ? "image" : "audio";
  const metadata = kind === "image" ? await new Promise<{ durationMs: null; width: number | null; height: number | null }>((resolve) => {
    const image = new Image();
    const url = URL.createObjectURL(file);
    image.onload = () => { URL.revokeObjectURL(url); resolve({ durationMs: null, width: image.naturalWidth, height: image.naturalHeight }); };
    image.onerror = () => { URL.revokeObjectURL(url); resolve({ durationMs: null, width: null, height: null }); };
    image.src = url;
  }) : await mediaMetadata(file, kind);
  const id = crypto.randomUUID();
  const createdAt = new Date().toISOString();
  return {
    id, workspaceId, projectId, kind, source: "upload", storageKey: id, fileName: file.name, mimeType, fileSize: file.size,
    ...metadata, fps: null, hasAudio: kind === "video" ? null : kind === "audio", createdAt, metadata: { processingStatus: "ready-for-browser-preview" },
    provenance: { source: "upload", createdAt }, rightsRecordId: null,
  };
}

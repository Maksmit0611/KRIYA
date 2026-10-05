import type { Asset, Timeline } from "../project/types";

export function getBrowserPreviewDuration(timeline: Timeline, assets: Asset[]): number {
  const visualAssetIds = new Set(assets
    .filter((asset) => asset.kind === "video" || asset.kind === "image" || asset.mimeType.startsWith("video/") || asset.mimeType.startsWith("image/"))
    .map((asset) => asset.id));
  return Math.max(0, ...timeline.tracks
    .filter((track) => track.kind === "video" && track.visible)
    .flatMap((track) => track.clips
      .filter((clip) => visualAssetIds.has(clip.assetId))
      .map((clip) => clip.timelineStartMs + clip.durationMs)));
}

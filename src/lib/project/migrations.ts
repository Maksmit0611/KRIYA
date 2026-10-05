import type { Project, Timeline } from "./types";
import { assertProject, assertTimeline } from "./validation";

export function migrateProject(input: unknown): Project {
  if (!input || typeof input !== "object" || !("schemaVersion" in input)) {
    throw new Error("Project is missing schemaVersion; unsupported project format.");
  }
  const project = input as Project;
  if (project.schemaVersion !== "1.0.0") throw new Error(`No project migration registered for ${String(project.schemaVersion)}.`);
  assertProject(project);
  return project;
}

export function migrateTimeline(input: unknown): Timeline {
  if (!input || typeof input !== "object" || !("schemaVersion" in input)) {
    throw new Error("Timeline is missing schemaVersion; unsupported timeline format.");
  }
  const timeline = input as Timeline;
  if (timeline.schemaVersion !== "1.0.0") throw new Error(`No timeline migration registered for ${String(timeline.schemaVersion)}.`);
  assertTimeline(timeline);
  return timeline;
}

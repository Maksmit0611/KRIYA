import { useState } from "react";
import { OrganizationSwitcher, SignInButton, SignedIn, SignedOut, UserButton, useAuth } from "@clerk/clerk-react";
import { useConvex, useConvexAuth } from "convex/react";
import { makeFunctionReference } from "convex/server";
import type { StoredEditorState } from "../lib/project/types";
import { checkpointSnapshot } from "../lib/cloud/contracts";
import { cloudConfigured } from "../lib/cloud/CloudProvider";

const get = makeFunctionReference<"query", { projectId: string }, { snapshot: string; revision: number } | null>("projects:get");
const save = makeFunctionReference<"mutation", { projectId: string; snapshot: string; expectedRevision: number | null }, number>("projects:save");

export function CloudCheckpoint({ state, ready }: { state: StoredEditorState; ready: boolean }) {
  return cloudConfigured ? <ConnectedCheckpoint key={state.project.id} state={state} ready={ready} /> : <span title="Configure both public environment values to enable cloud checkpoints">Local only</span>;
}

function ConnectedCheckpoint({ state, ready }: { state: StoredEditorState; ready: boolean }) {
  const { orgId, userId } = useAuth();
  return <><SignedOut><SignInButton mode="modal"><button className="secondary-button">Sign in for cloud</button></SignInButton></SignedOut><SignedIn><OrganizationSwitcher hidePersonal /><UserButton /><CheckpointActions key={`${userId}:${orgId}`} state={state} ready={ready} orgId={orgId} /></SignedIn></>;
}

function CheckpointActions({ state, ready, orgId }: { state: StoredEditorState; ready: boolean; orgId: string | null | undefined }) {
  const client = useConvex();
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [revision, setRevision] = useState<number | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("Check cloud before saving. Metadata only; media stays local.");
  async function run(write: boolean) {
    setBusy(true);
    try {
      if (write) {
        if (revision === undefined || !orgId) throw new Error("Check cloud first.");
        const next = await client.mutation(save, { projectId: state.project.id, snapshot: checkpointSnapshot(state, orgId), expectedRevision: revision });
        setRevision(next); setMessage(`Cloud checkpoint ${next} saved. Media stays local.`);
      } else {
        const result = await client.query(get, { projectId: state.project.id });
        setRevision(result?.revision ?? null);
        if (result) {
          // Download for inspection without silently replacing the active local project.
          const link = document.createElement("a");
          link.href = URL.createObjectURL(new Blob([result.snapshot], { type: "application/json" }));
          link.download = "kriya-cloud-checkpoint.json"; link.click();
          setTimeout(() => URL.revokeObjectURL(link.href), 1000);
        }
        setMessage(result ? `Downloaded checkpoint ${result.revision}. Saving will replace it.` : "No cloud checkpoint yet. Ready to save.");
      }
    } catch {
      setRevision(undefined);
      setMessage("Cloud request failed. Check sign-in, JWT workspace claim, deployment and size; then check cloud again.");
    } finally { setBusy(false); }
  }
  const disabled = busy || !ready || !orgId || isLoading || !isAuthenticated;
  return <div><button className="secondary-button" disabled={disabled} onClick={() => void run(false)}>Check cloud</button><button className="secondary-button" disabled={disabled || revision === undefined} onClick={() => void run(true)}>Save checkpoint</button><span role="status" style={{ display: "block", fontSize: 10, maxWidth: 320 }}>{!orgId ? "Select or create an organization for cloud save." : message}</span></div>;
}

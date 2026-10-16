import type { ReactNode } from "react";
import { ClerkProvider, useAuth } from "@clerk/clerk-react";
import { ConvexReactClient } from "convex/react";
import { ConvexProviderWithClerk } from "convex/react-clerk";

const key = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY;
const url = import.meta.env.VITE_CONVEX_URL;
export const cloudConfigured = Boolean(key && url);
const client = cloudConfigured ? new ConvexReactClient(url) : null;

export function CloudProvider({ children }: { children: ReactNode }) {
  if (!client) return <>{children}</>;
  return <ClerkProvider publishableKey={key}><ConvexProviderWithClerk client={client} useAuth={useAuth}>{children}</ConvexProviderWithClerk></ClerkProvider>;
}

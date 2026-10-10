import type { ContactProvenance } from "@/dmi/types";

export type DiscoveredChannel = {
  channelType:
    | "business_email"
    | "published_professional_email"
    | "company_contact_form"
    | "company_general_email"
    | "authorized_networking"
    | "other";
  value: string;
  provenance: ContactProvenance;
  sourceUrl?: string;
  discoveryMethod: string;
  allowedForAutomation: boolean;
  notes?: string;
};

/**
 * Prefer official business routes. Never upgrade inferred → verified.
 */
export function rankChannels(channels: DiscoveredChannel[]): DiscoveredChannel[] {
  const order: ContactProvenance[] = [
    "verified",
    "published",
    "company_level",
    "inferred",
    "unknown",
  ];
  return [...channels].sort(
    (a, b) => order.indexOf(a.provenance) - order.indexOf(b.provenance),
  );
}

export function assertChannelLabeling(channel: DiscoveredChannel) {
  if (
    channel.provenance === "verified" &&
    (!channel.sourceUrl || channel.discoveryMethod === "inferred_pattern")
  ) {
    throw new Error("Inferred contacts cannot be labeled verified");
  }
  if (channel.provenance === "inferred" && channel.allowedForAutomation) {
    throw new Error("Inferred contacts cannot enable automation");
  }
}

export function blockUnauthorizedDirectMessages(channel: DiscoveredChannel) {
  if (
    channel.channelType === "authorized_networking" &&
    !channel.allowedForAutomation
  ) {
    throw new Error("Unauthorized direct-message automation is blocked");
  }
}

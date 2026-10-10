import type { ResearchProviderId, SearchHit } from "@/acquisition/types";

export type ResearchSearchInput = {
  query: string;
  market?: string;
  niche?: string;
  count?: number;
};

export interface ResearchProvider {
  readonly id: ResearchProviderId;
  isConfigured(): boolean;
  search(input: ResearchSearchInput): Promise<SearchHit[]>;
}

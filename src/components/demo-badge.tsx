import { Badge } from "@/components/ui/badge";

export function DemoBadge({ isDemo }: { isDemo: boolean }) {
  if (!isDemo) return null;
  return <Badge variant="demo">DEMO</Badge>;
}

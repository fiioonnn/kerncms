import { Badge } from "@/components/ui/display";
import type { ContentStatus } from "@/lib/kern-types";

export const statusLabels: Record<ContentStatus, string> = {
  live: "Live",
  draft: "Entwurf",
  new: "Neu",
  unsaved: "Ungespeichert",
};

const tones = { live: "success", draft: "warning", new: "accent", unsaved: "danger" } as const;

export function StatusBadge({ status }: { status: ContentStatus }) {
  return (
    <Badge tone={tones[status]} dot>
      {statusLabels[status]}
    </Badge>
  );
}

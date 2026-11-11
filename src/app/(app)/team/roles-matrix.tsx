import { Check, Minus } from "lucide-react";
import { Card } from "@/components/ui/display";
import { roleLabels, type RoleName } from "@/lib/kern-types";

type Permission = { label: string; description: string; min: RoleName; editorNote?: string };

const ROLES: RoleName[] = ["viewer", "editor", "admin", "owner"];
const rank: Record<RoleName, number> = { viewer: 0, editor: 1, admin: 2, owner: 3 };

function groups(requireApproval: boolean): { label: string; permissions: Permission[] }[] {
  return [
    {
      label: "Inhalte",
      permissions: [
        { label: "Ansehen", description: "Seiten, Inhalte, Medien, Statistik und Verlauf", min: "viewer" },
        { label: "Inhalte bearbeiten", description: "Texte, Bilder und Blöcke ändern, Seiten und Einträge anlegen", min: "editor" },
        { label: "Medien verwalten", description: "Bilder hochladen, bearbeiten und löschen", min: "editor" },
        { label: "Formular-Nachrichten", description: "Einsendungen lesen, archivieren und exportieren", min: "editor" },
      ],
    },
    {
      label: "Veröffentlichung",
      permissions: [
        {
          label: "Veröffentlichen",
          description: "Änderungen live stellen",
          min: "editor",
          editorNote: requireApproval ? "nur mit Freigabe" : undefined,
        },
        { label: "Freigaben erteilen", description: "Änderungen anderer prüfen und live stellen", min: "admin" },
        { label: "Entwurf verwerfen", description: "Alle unveröffentlichten Änderungen zurücksetzen", min: "admin" },
      ],
    },
    {
      label: "Verwaltung",
      permissions: [
        { label: "Einstellungen", description: "Name, Live-Adresse, Freigaben, Statistik, Weiterleitungen", min: "admin" },
        { label: "Team verwalten", description: "Personen einladen, Rollen ändern, entfernen", min: "admin" },
        { label: "Inhaber verwalten", description: "Inhaber ernennen und die Website trennen", min: "owner" },
      ],
    },
  ];
}

/** Read-only overview of what each role may do. Roles are fixed. */
export function RolesMatrix({ requireApproval }: { requireApproval: boolean }) {
  return (
    <div className="flex flex-col gap-5">
      <p className="max-w-2xl text-[15px] text-muted">
        Was jede Rolle darf. Jede Rolle hat alle Rechte der Rollen links von ihr.
      </p>

      <Card>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[15px]">
            <thead>
              <tr>
                <th className="h-12 rounded-tl-2xl border-b border-border bg-subtle/60 px-6 text-sm font-medium text-muted">Berechtigung</th>
                {ROLES.map((role) => (
                  <th
                    key={role}
                    className="h-12 min-w-28 border-b border-border bg-subtle/60 px-4 text-center text-sm font-semibold last:rounded-tr-2xl"
                  >
                    {roleLabels[role]}
                  </th>
                ))}
              </tr>
            </thead>
            {groups(requireApproval).map((group) => (
              <tbody key={group.label}>
                <tr>
                  <td
                    colSpan={ROLES.length + 1}
                    className="border-b border-border bg-subtle/30 px-6 pt-4 pb-2 text-xs font-semibold tracking-wider text-muted uppercase"
                  >
                    {group.label}
                  </td>
                </tr>
                {group.permissions.map((p) => (
                  <tr key={p.label} className="transition-colors hover:bg-subtle/40">
                    <td className="border-b border-border px-6 py-3">
                      <span className="flex flex-col">
                        <span className="font-medium">{p.label}</span>
                        <span className="text-sm text-muted">{p.description}</span>
                      </span>
                    </td>
                    {ROLES.map((role) => {
                      const allowed = rank[role] >= rank[p.min];
                      const note = role === "editor" && allowed ? p.editorNote : undefined;
                      return (
                        <td key={role} className="border-b border-border px-4 py-3 text-center">
                          {allowed ? (
                            <span className="inline-flex flex-col items-center gap-0.5">
                              <Check className="size-5 text-success" strokeWidth={2.25} aria-label="erlaubt" />
                              {note && <span className="text-xs text-muted">{note}</span>}
                            </span>
                          ) : (
                            <Minus className="mx-auto size-5 text-border-strong" strokeWidth={1.75} aria-label="nicht erlaubt" />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>
      </Card>
    </div>
  );
}

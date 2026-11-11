import { MoreHorizontal, UserPlus } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Avatar, Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui/display";

const members = [
  { name: "Anna Schmidt", email: "anna@baeckerei-mueller.de", role: "Admin", tone: "accent" as const },
  { name: "Jonas Weber", email: "jonas@baeckerei-mueller.de", role: "Redakteur", tone: "neutral" as const },
  { name: "Lena Hoffmann", email: "lena@baeckerei-mueller.de", role: "Redakteurin", tone: "neutral" as const },
];

export default function TeamPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Team"
        description="Wer Zugriff auf diese Website hat und was er bearbeiten darf."
        actions={
          <Button>
            <UserPlus />
            Einladen
          </Button>
        }
      />

      <Card>
        <Table>
          <thead>
            <tr>
              <Th>Name</Th>
              <Th>Rolle</Th>
              <Th className="w-0" aria-label="Aktionen" />
            </tr>
          </thead>
          <tbody>
            {members.map((member) => (
              <tr key={member.email}>
                <Td>
                  <span className="flex items-center gap-4">
                    <Avatar name={member.name} />
                    <span className="flex flex-col leading-snug">
                      <span className="text-base font-medium">{member.name}</span>
                      <span className="text-sm text-muted">{member.email}</span>
                    </span>
                  </span>
                </Td>
                <Td>
                  <Badge tone={member.tone}>{member.role}</Badge>
                </Td>
                <Td>
                  <Button variant="ghost" size="icon" aria-label="Mehr">
                    <MoreHorizontal />
                  </Button>
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      </Card>
    </PageContainer>
  );
}

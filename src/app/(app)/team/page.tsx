import { PageContainer } from "@/components/layout/page-container";
import { RowActions } from "@/components/actions/common";
import { InviteDialog } from "@/components/actions/create-dialogs";
import { Avatar, Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui/display";
import { Tab, TabPanel, Tabs, TabsList } from "@/components/ui/tabs";
import { RolesMatrix } from "./roles-matrix";

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
        actions={<InviteDialog />}
      />

      <Tabs defaultValue="members">
        <TabsList>
          <Tab value="members">Mitglieder</Tab>
          <Tab value="roles">Rollen</Tab>
        </TabsList>

        <TabPanel value="members" className="pt-5">
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
                      <RowActions name={member.name} deleteLabel="Entfernen" />
                    </Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </Card>
        </TabPanel>

        <TabPanel value="roles" className="pt-5">
          <RolesMatrix />
        </TabPanel>
      </Tabs>
    </PageContainer>
  );
}

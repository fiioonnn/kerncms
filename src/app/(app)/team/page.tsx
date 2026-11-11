import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/ui/display";
import { Tab, TabPanel, Tabs, TabsList } from "@/components/ui/tabs";
import { getTeam } from "@/server/queries";
import { getSiteContext } from "@/server/sites";
import { RolesMatrix } from "./roles-matrix";
import { InviteDialog, TeamTables } from "./team-members";

export default async function TeamPage() {
  const [team, ctx] = await Promise.all([getTeam(), getSiteContext()]);
  const canManage = team.myRole === "admin" || team.myRole === "owner";

  return (
    <PageContainer>
      <PageHeader
        title="Team"
        description="Wer Zugriff auf diese Website hat und was er bearbeiten darf."
        actions={canManage ? <InviteDialog myRole={team.myRole} /> : undefined}
      />

      <Tabs defaultValue="members">
        <TabsList>
          <Tab value="members">Mitglieder</Tab>
          <Tab value="roles">Rollen</Tab>
        </TabsList>

        <TabPanel value="members" className="pt-5">
          <TeamTables me={team.me} myRole={team.myRole} members={team.members} invites={team.invites} />
        </TabPanel>

        <TabPanel value="roles" className="pt-5">
          <RolesMatrix requireApproval={ctx.site.requireApproval} />
        </TabPanel>
      </Tabs>
    </PageContainer>
  );
}

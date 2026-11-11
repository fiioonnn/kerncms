import Link from "next/link";
import { Plus } from "lucide-react";
import { RowActions } from "@/components/actions/common";
import { PageContainer } from "@/components/layout/page-container";
import { buttonStyles } from "@/components/ui/button";
import { Avatar, Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui/display";
import { Tab, TabPanel, Tabs, TabsList } from "@/components/ui/tabs";

const posts = [
  { title: "Neue Sauerteigbrote ab Mai", category: "Neuigkeiten", author: "Anna Schmidt", status: "draft", date: "Heute" },
  { title: "Unser Stand auf dem Wochenmarkt", category: "Events", author: "Jonas Weber", status: "live", date: "3. Nov." },
  { title: "Rezept: Dinkel-Vollkornbrot", category: "Rezepte", author: "Anna Schmidt", status: "live", date: "21. Okt." },
  { title: "Ausbildung bei uns", category: "Karriere", author: "Lena Hoffmann", status: "live", date: "9. Okt." },
];

function PostTable({ filter }: { filter?: "draft" | "live" }) {
  const rows = filter ? posts.filter((post) => post.status === filter) : posts;
  return (
    <Card>
      <Table>
        <thead>
          <tr>
            <Th>Titel</Th>
            <Th>Kategorie</Th>
            <Th>Autor</Th>
            <Th>Status</Th>
            <Th>Datum</Th>
            <Th className="w-0" aria-label="Aktionen" />
          </tr>
        </thead>
        <tbody>
          {rows.map((post) => (
            <tr key={post.title} className="transition-colors hover:bg-subtle/50">
              <Td>
                <Link href="/posts/new" className="text-base font-medium hover:text-accent">
                  {post.title}
                </Link>
              </Td>
              <Td className="text-muted">{post.category}</Td>
              <Td>
                <span className="flex items-center gap-3">
                  <Avatar name={post.author} size="sm" />
                  {post.author}
                </span>
              </Td>
              <Td>
                {post.status === "draft" ? (
                  <Badge tone="warning" dot>
                    Entwurf
                  </Badge>
                ) : (
                  <Badge tone="success" dot>
                    Veröffentlicht
                  </Badge>
                )}
              </Td>
              <Td className="text-muted">{post.date}</Td>
              <Td>
                <RowActions name={post.title} editHref="/posts/new" />
              </Td>
            </tr>
          ))}
        </tbody>
      </Table>
    </Card>
  );
}

export default function PostsPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Beiträge"
        description="Neuigkeiten, Rezepte und alles, was regelmäßig erscheint."
        actions={
          <Link href="/posts/new" className={buttonStyles()}>
            <Plus />
            Neuer Beitrag
          </Link>
        }
      />

      <Tabs defaultValue="all">
        <TabsList>
          <Tab value="all">Alle</Tab>
          <Tab value="live">Veröffentlicht</Tab>
          <Tab value="draft">Entwürfe</Tab>
        </TabsList>
        <TabPanel value="all">
          <PostTable />
        </TabPanel>
        <TabPanel value="live">
          <PostTable filter="live" />
        </TabPanel>
        <TabPanel value="draft">
          <PostTable filter="draft" />
        </TabPanel>
      </Tabs>
    </PageContainer>
  );
}

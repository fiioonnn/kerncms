import Link from "next/link";
import { CalendarClock, Plus } from "lucide-react";
import { RowActions } from "@/components/actions/common";
import { PostCategory } from "@/components/posts/post-category";
import { PageContainer } from "@/components/layout/page-container";
import { buttonStyles } from "@/components/ui/button";
import { Avatar, Badge, Card, PageHeader, Table, Td, Th } from "@/components/ui/display";
import { Tab, TabPanel, Tabs, TabsList } from "@/components/ui/tabs";

type PostStatus = "draft" | "scheduled" | "live";

const posts: { title: string; /** Category id from the category store. */ category: string; author: string; status: PostStatus; date: string }[] = [
  { title: "Adventsgebäck: Stollen vorbestellen", category: "news", author: "Jonas Weber", status: "scheduled", date: "24. Nov., 08:00" },
  { title: "Neue Sauerteigbrote ab Mai", category: "news", author: "Anna Schmidt", status: "draft", date: "Heute" },
  { title: "Unser Stand auf dem Wochenmarkt", category: "events", author: "Jonas Weber", status: "live", date: "3. Nov." },
  { title: "Rezept: Dinkel-Vollkornbrot", category: "recipes", author: "Anna Schmidt", status: "live", date: "21. Okt." },
  { title: "Ausbildung bei uns", category: "jobs", author: "Lena Hoffmann", status: "live", date: "9. Okt." },
];

function StatusBadge({ status }: { status: PostStatus }) {
  if (status === "draft")
    return (
      <Badge tone="warning" dot>
        Entwurf
      </Badge>
    );
  if (status === "scheduled")
    return (
      <Badge tone="accent">
        <CalendarClock className="size-3.5" strokeWidth={2} />
        Geplant
      </Badge>
    );
  return (
    <Badge tone="success" dot>
      Veröffentlicht
    </Badge>
  );
}

function PostTable({ filter }: { filter?: PostStatus }) {
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
              <Td className="text-muted">
                <PostCategory id={post.category} />
              </Td>
              <Td>
                <span className="flex items-center gap-3">
                  <Avatar name={post.author} size="sm" />
                  {post.author}
                </span>
              </Td>
              <Td>
                <StatusBadge status={post.status} />
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
          <Tab value="scheduled">Geplant</Tab>
          <Tab value="draft">Entwürfe</Tab>
        </TabsList>
        <TabPanel value="all">
          <PostTable />
        </TabPanel>
        <TabPanel value="live">
          <PostTable filter="live" />
        </TabPanel>
        <TabPanel value="scheduled">
          <PostTable filter="scheduled" />
        </TabPanel>
        <TabPanel value="draft">
          <PostTable filter="draft" />
        </TabPanel>
      </Tabs>
    </PageContainer>
  );
}

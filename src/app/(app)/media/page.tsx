import { ImageIcon, Upload } from "lucide-react";
import { PageContainer } from "@/components/layout/page-container";
import { Button } from "@/components/ui/button";
import { Card, PageHeader } from "@/components/ui/display";

const files = [
  { name: "hero-brot.jpg", size: "1,2 MB" },
  { name: "team-backstube.jpg", size: "860 KB" },
  { name: "sauerteig.jpg", size: "740 KB" },
  { name: "laden-aussen.jpg", size: "1,6 MB" },
  { name: "croissants.jpg", size: "520 KB" },
  { name: "logo.svg", size: "12 KB" },
  { name: "wochenmarkt.jpg", size: "980 KB" },
  { name: "dinkelbrot.jpg", size: "690 KB" },
];

export default function MediaPage() {
  return (
    <PageContainer>
      <PageHeader
        title="Medien"
        description="Bilder und Dateien, die du in Seiten und Beiträgen verwenden kannst."
        actions={
          <Button>
            <Upload />
            Hochladen
          </Button>
        }
      />

      <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
        {files.map((file) => (
          <Card key={file.name} className="group overflow-hidden transition-shadow hover:shadow-popover">
            <div className="flex aspect-[4/3] items-center justify-center bg-subtle text-border-strong">
              <ImageIcon className="size-10" strokeWidth={1.25} />
            </div>
            <div className="flex flex-col px-4 py-3.5">
              <span className="truncate text-[15px] font-medium">{file.name}</span>
              <span className="text-sm text-muted">{file.size}</span>
            </div>
          </Card>
        ))}
      </div>
    </PageContainer>
  );
}

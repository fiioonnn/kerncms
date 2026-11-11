import { UploadDialog } from "@/components/actions/common";
import { MediaTile } from "./media-tile";
import { PageContainer } from "@/components/layout/page-container";
import { PageHeader } from "@/components/ui/display";

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
          <UploadDialog />
        }
      />

      <div className="grid grid-cols-2 gap-5 md:grid-cols-3 xl:grid-cols-4">
        {files.map((file) => (
          <MediaTile key={file.name} name={file.name} size={file.size} />
        ))}
      </div>
    </PageContainer>
  );
}

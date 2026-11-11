import { UploadDialog } from "@/components/actions/common";
import { MediaTile } from "./media-tile";
import { PageContainer } from "@/components/layout/page-container";
import { mediaFiles } from "@/lib/example-content";
import { PageHeader } from "@/components/ui/display";


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
        {mediaFiles.map((file) => (
          <MediaTile key={file.name} name={file.name} size={file.size} />
        ))}
      </div>
    </PageContainer>
  );
}

import { ContentUpdatesView } from "@/components/views/content-updates-view";
import { ViewPage } from "@/components/view-page";

export default function ContentProductsPage() {
  return (
    <ViewPage view="content-updates">
      <ContentUpdatesView initialTab="bulk-products" />
    </ViewPage>
  );
}

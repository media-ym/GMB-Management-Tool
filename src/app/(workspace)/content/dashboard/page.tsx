import { ContentUpdatesView } from "@/components/views/content-updates-view";
import { ViewPage } from "@/components/view-page";

export default function ContentDashboardPage() {
  return (
    <ViewPage view="content-updates">
      <ContentUpdatesView initialTab="dashboard" />
    </ViewPage>
  );
}

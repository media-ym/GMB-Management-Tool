import { DashboardView } from "@/components/views/dashboard-view";
import { ViewPage } from "@/components/view-page";

export default function DashboardPage() {
  return (
    <ViewPage view="dashboard">
      <DashboardView />
    </ViewPage>
  );
}

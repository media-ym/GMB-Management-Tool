import { NotificationsView } from "@/components/views/notifications-view";
import { ViewPage } from "@/components/view-page";

export default function AlertsPage() {
  return (
    <ViewPage view="notifications">
      <NotificationsView />
    </ViewPage>
  );
}

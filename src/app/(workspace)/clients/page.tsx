import { ClientsView } from "@/components/views/clients-view";
import { ViewPage } from "@/components/view-page";

export default function ClientsPage() {
  return (
    <ViewPage view="clients">
      <ClientsView />
    </ViewPage>
  );
}

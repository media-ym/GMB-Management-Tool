import { LocationsView } from "@/components/views/locations-view";
import { ViewPage } from "@/components/view-page";

export default function LocationsPage() {
  return (
    <ViewPage view="locations">
      <LocationsView />
    </ViewPage>
  );
}

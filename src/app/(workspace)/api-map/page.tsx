import { GoogleApiMappingView } from "@/components/views/google-api-mapping-view";
import { ViewPage } from "@/components/view-page";

export default function ApiMapPage() {
  return (
    <ViewPage view="google-api-mapping">
      <GoogleApiMappingView />
    </ViewPage>
  );
}

import { OpenApiSpecView } from "@/components/views/openapi-spec-view";
import { ViewPage } from "@/components/view-page";

export default function OpenApiPage() {
  return (
    <ViewPage view="openapi-spec">
      <OpenApiSpecView />
    </ViewPage>
  );
}

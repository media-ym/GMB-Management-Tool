import { GoogleBillingView } from "@/components/views/google-billing-view";
import { ViewPage } from "@/components/view-page";

export default function ApiBillingPage() {
  return (
    <ViewPage view="google-billing">
      <GoogleBillingView />
    </ViewPage>
  );
}

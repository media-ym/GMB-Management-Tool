import { ReviewsView } from "@/components/views/reviews-view";
import { ViewPage } from "@/components/view-page";

export default function ReviewsPage() {
  return (
    <ViewPage view="reviews">
      <ReviewsView />
    </ViewPage>
  );
}

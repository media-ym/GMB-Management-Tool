"use client";

import { useAppStore } from "@/lib/store";
import { canAccessView } from "@/lib/permissions";
import { DashboardView } from "@/components/views/dashboard-view";
import { LocationsView } from "@/components/views/locations-view";
import { ReviewsView } from "@/components/views/reviews-view";
import { PostsView } from "@/components/views/posts-view";
import { AnalyticsView } from "@/components/views/analytics-view";
import { SeoView } from "@/components/views/seo-view";
import { AiView } from "@/components/views/ai-view";
import { MediaView } from "@/components/views/media-view";
import { ReportsView } from "@/components/views/reports-view";
import { GoogleIntegrationView } from "@/components/views/google-integration-view";
import { NotificationsView } from "@/components/views/notifications-view";
import { AuditView } from "@/components/views/audit-view";
import { SystemView } from "@/components/views/system-view";
import { ApiDocsView } from "@/components/views/api-docs-view";
import { OpenApiSpecView } from "@/components/views/openapi-spec-view";
import { GoogleApiMappingView } from "@/components/views/google-api-mapping-view";
import { RoadmapView } from "@/components/views/roadmap-view";
import { DesignSystemView } from "@/components/views/design-system-view";
import { WireframesView } from "@/components/views/wireframes-view";
import { SettingsView } from "@/components/views/settings-view";
import { ClientsView } from "@/components/views/clients-view";
import { useAppStore as useStore } from "@/lib/store";
import { ShieldAlert } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

export function ViewRouter() {
  const view = useAppStore((s) => s.view);
  const user = useStore((s) => s.user);

  if (user && !canAccessView(user.role, view)) {
    return (
      <div className="p-6 sm:p-8">
        <Card>
          <CardContent className="p-10 text-center">
            <ShieldAlert className="size-12 mx-auto text-amber-500 mb-3" />
            <h2 className="text-lg font-semibold">Access restricted</h2>
            <p className="text-sm text-muted-foreground mt-1">
              Your role ({user.role.replace("_", " ")}) doesn't have permission to view this module.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  switch (view) {
    case "dashboard": return <DashboardView />;
    case "locations": return <LocationsView />;
    case "reviews": return <ReviewsView />;
    case "posts": return <PostsView />;
    case "analytics": return <AnalyticsView />;
    case "seo": return <SeoView />;
    case "ai": return <AiView />;
    case "media": return <MediaView />;
    case "reports": return <ReportsView />;
    case "google": return <GoogleIntegrationView />;
    case "notifications": return <NotificationsView />;
    case "audit": return <AuditView />;
    case "system": return <SystemView />;
    case "api-docs": return <ApiDocsView />;
    case "openapi-spec": return <OpenApiSpecView />;
    case "google-api-mapping": return <GoogleApiMappingView />;
    case "roadmap": return <RoadmapView />;
    case "design-system": return <DesignSystemView />;
    case "wireframes": return <WireframesView />;
    case "settings": return <SettingsView />;
    case "clients": return <ClientsView />;
    default: return <DashboardView />;
  }
}

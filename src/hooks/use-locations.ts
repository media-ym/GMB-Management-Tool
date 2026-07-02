"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api-client";

export interface LocationOption {
  id: string;
  name: string;
  city: string;
  status: string;
}

export function useLocations() {
  return useQuery<LocationOption[]>({
    queryKey: ["locations"],
    queryFn: () => api<LocationOption[]>("/api/locations"),
  });
}

import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getJurisdictions, type Jurisdiction } from "@/lib/jurisdictions.functions";

/**
 * Shared source of truth for state / district dropdowns across the app
 * (project creation, user administration, jurisdiction management).
 */
export function useJurisdictions(enabled = true) {
  const fetchJurisdictions = useServerFn(getJurisdictions);
  const query = useQuery({
    queryKey: ["jurisdictions"],
    queryFn: () => fetchJurisdictions({}),
    enabled,
  });

  const all: Jurisdiction[] = query.data ?? [];
  return {
    ...query,
    all,
    states: all.filter((j) => j.level === "state"),
    districts: all.filter((j) => j.level === "district"),
    districtsOfState: (stateId: string | null) =>
      all.filter((j) => j.level === "district" && (!stateId || j.parent_id === stateId)),
  };
}

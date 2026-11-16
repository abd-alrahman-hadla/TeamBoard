'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useMemo } from 'react';
import { applyFiltersToParams, type CardFilters, filtersFromParams } from './filter-cards';

/** Filters live in the URL (?q=&assignee=&label=&due=) so a filtered view can be shared and survives reloads. */
export function useBoardFilters(): [CardFilters, (next: CardFilters) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const filters = useMemo(() => filtersFromParams(new URLSearchParams(params.toString())), [params]);

  const setFilters = useCallback(
    (next: CardFilters) => {
      const query = applyFiltersToParams(new URLSearchParams(params.toString()), next).toString();
      router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
    },
    [params, router, pathname],
  );

  return [filters, setFilters];
}

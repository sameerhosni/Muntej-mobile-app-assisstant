// Pull to refresh that spins ONLY when you pulled (Nouran, 11 Nov, iOS: "It does that a lot" — the Alerts screen showed
// the spinner and sat pushed down after every save, and each time the app came back to the front, because
// `refreshing` followed the query's isRefetching). R141: every RefreshControl uses this.
import { useCallback, useState } from 'react';

export function usePullRefresh(refetch: () => Promise<unknown> | unknown) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    // cleared even when the fetch fails, so the page always settles back
    void Promise.resolve()
      .then(() => refetch())
      .catch(() => undefined)
      .finally(() => setRefreshing(false));
  }, [refetch]);
  return { refreshing, onRefresh };
}

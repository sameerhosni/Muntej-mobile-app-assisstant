// A RefreshControl that spins only when the person pulled (R141, Nouran 11 Nov, iOS): use it instead of a RefreshControl
// whose spinner follows the query. Extra props (Android's scroll view and style, which ScrollView passes in) go
// straight through.
import { RefreshControl, type RefreshControlProps } from 'react-native';
import { usePullRefresh } from '@/lib/usePullRefresh';

type Props = Omit<RefreshControlProps, 'refreshing' | 'onRefresh'> & { onRefresh: () => Promise<unknown> | unknown };

export function PullRefreshControl({ onRefresh, ...rest }: Props) {
  const pull = usePullRefresh(onRefresh);
  return <RefreshControl {...rest} refreshing={pull.refreshing} onRefresh={pull.onRefresh} />;
}

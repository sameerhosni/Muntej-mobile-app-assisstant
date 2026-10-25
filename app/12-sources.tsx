// Screen 12 · Sources — see design/v2/html/Sources.dc.html (Arabic: SourcesAR.dc.html); merged into Your tools.
// Owner: two tool screens were confusing. Everything now lives on Your tools (screen 42): a tile per connected tool
// (its own page: screen 55) and "Connect a tool" right under them. This route stays for old links and for tools'
// sign-in pages that send people back here (?connected=… / ?error=…), and opens Your tools with "Connect a tool" open.
import { Redirect, useLocalSearchParams, type Href } from 'expo-router';

export default function SourcesScreen() {
  const params = useLocalSearchParams<{ connected?: string; error?: string }>();
  return <Redirect href={{ pathname: '/42-incoming', params: { ...params, add: '1' } } as unknown as Href} />;
}

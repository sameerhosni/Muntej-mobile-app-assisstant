// Screen · Not found — no mockup. A link or notification that names no screen (e.g. "muntej:///" from a tapped
// notification, owner 2 Nov) goes to Home instead of Expo Router's "Unmatched Route" page.
import { Redirect } from 'expo-router';

export default function NotFound() {
  return <Redirect href="/" />;
}

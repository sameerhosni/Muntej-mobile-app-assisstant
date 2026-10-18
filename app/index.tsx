import { Redirect } from 'expo-router';
import { useAuth } from '@/features/auth/AuthProvider';

export default function Index() {
  const { session } = useAuth();
  return <Redirect href={session ? '/01-home' : '/sign-in'} />;
}

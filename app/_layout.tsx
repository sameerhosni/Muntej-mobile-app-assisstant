import '@/lib/i18n';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import * as SystemUI from 'expo-system-ui';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { appFonts } from '@/theme/fonts';
import { colors } from '@/theme/tokens';
import { loadSavedLanguage, useDirection } from '@/lib/i18n';

SplashScreen.preventAutoHideAsync().catch(() => {});
SystemUI.setBackgroundColorAsync(colors.bg).catch(() => {});

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts(appFonts);
  const [langReady, setLangReady] = useState(false);
  const { direction } = useDirection();

  useEffect(() => {
    loadSavedLanguage().finally(() => setLangReady(true));
  }, []);

  const ready = (fontsLoaded || !!fontError) && langReady;

  useEffect(() => {
    if (ready) SplashScreen.hideAsync().catch(() => {});
  }, [ready]);

  if (!ready) return null;

  return (
    <SafeAreaProvider>
      {/* direction flips the whole layout instantly when the language changes (works in Expo Go too). */}
      <View style={{ flex: 1, direction, backgroundColor: colors.bg }}>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.bg },
            animation: direction === 'rtl' ? 'slide_from_left' : 'slide_from_right',
          }}
        >
          <Stack.Screen name="(tabs)" />
          <Stack.Screen name="02-capture" options={{ presentation: 'modal', animation: 'slide_from_bottom' }} />
        </Stack>
      </View>
    </SafeAreaProvider>
  );
}

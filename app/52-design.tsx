// Screen 52 · System design — no mockup; v2 light style per design/TOKENS.md
// Super admin only (Settings → System design): the full design image, and two PDFs to open / download:
//   System design (HLD + LLD, every diagram drawn) · Integration API (how other systems connect + the full contract).
// Files live in the private Storage bucket "design-docs" (super admins only); links are signed for 1 hour.
// Rebuild + upload: node scripts/build-design-docs.js && node scripts/upload-design-docs.js
import { useState } from 'react';
import { ActivityIndicator, Image, Linking, Pressable, ScrollView, View } from 'react-native';
import { Redirect, router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, Download, FileText, Image as ImageIcon, Plug } from 'lucide-react-native';
import { AppText, Card, IconBadge, IconButton } from '@/components/ui';
import { colors, radius, sizes, spacing, type ColorToken } from '@/theme/tokens';
import { useDirection } from '@/lib/i18n';
import { registerStrings, useScreenT } from '@/lib/i18n/register';
import { supabase } from '@/lib/supabase';
import { useMyProfile } from '@/lib/api';

const en = {
  title: 'System design',
  sub: 'How Muntej is built and how other systems connect to it. Only you (super admin) can see this.',
  full: 'The full design',
  fullSub: 'Every part of the system on one image. Tap to open it full size.',
  design: 'System design (HLD + LLD)',
  designSub: 'Architecture, every service, the data model, security, deployment and the main flows with diagrams',
  api: 'Integration API',
  apiSub: 'How to connect your systems: keys, endpoints, webhooks, examples, the full contract',
  image: 'Design image (PNG)',
  imageSub: 'For slides and documents',
  open: 'Open PDF',
  download: 'Download',
  failed: 'Couldn’t load the documents: {{reason}}',
  back: 'Back',
};
const ar: typeof en = {
  title: 'تصميم النظام',
  sub: 'كيف مبني منتج، وكيف تربط الأنظمة الثانية معه. هذي الصفحة لك بس (المسؤول العام).',
  full: 'التصميم كامل',
  fullSub: 'كل أجزاء النظام في صورة وحدة. اضغط عليها تفتح بحجمها الكامل.',
  design: 'تصميم النظام (HLD + LLD)',
  designSub: 'المعمارية، كل خدمة، نموذج البيانات، الأمان، النشر، والمسارات الرئيسية بالرسومات',
  api: 'واجهة الربط (API)',
  apiSub: 'كيف تربط أنظمتك: المفاتيح، الروابط، الويب هوك، أمثلة، والعقد كامل',
  image: 'صورة التصميم (PNG)',
  imageSub: 'للعروض والمستندات',
  open: 'افتح الـPDF',
  download: 'حمّل',
  failed: 'ما قدرت أجيب المستندات: {{reason}}',
  back: 'رجوع',
};
const NS = registerStrings('designDocs', { en, ar });

const FILES = { design: 'Muntej-System-Design.pdf', api: 'Muntej-API-Integration.pdf', image: 'Muntej-Architecture.png' } as const;
type Doc = keyof typeof FILES;

function useLinks(enabled: boolean) {
  return useQuery({
    queryKey: ['designDocs'],
    enabled,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const out = {} as Record<Doc, { view: string; download: string }>;
      for (const k of Object.keys(FILES) as Doc[]) {
        const b = supabase.storage.from('design-docs');
        const [v, d] = await Promise.all([b.createSignedUrl(FILES[k], 3600), b.createSignedUrl(FILES[k], 3600, { download: FILES[k] })]);
        if (v.error || d.error) throw new Error((v.error ?? d.error)!.message);
        out[k] = { view: v.data.signedUrl, download: d.data.signedUrl };
      }
      return out;
    },
  });
}

export default function DesignDocsScreen() {
  const { t } = useScreenT(NS);
  const { isRTL } = useDirection();
  const insets = useSafeAreaInsets();
  const me = useMyProfile();
  const realRole = me.data?.actual_role ?? me.data?.role;
  const isSuper = realRole === 'super_admin';
  const links = useLinks(isSuper);
  const [ratio, setRatio] = useState(1.6);

  if (me.data && !isSuper) return <Redirect href="/settings" />;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + spacing.sm, paddingHorizontal: spacing.screen, paddingBottom: 40, gap: spacing.lg }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconButton label={t('back')} onPress={() => (router.canGoBack() ? router.back() : router.replace('/settings'))}>
          <ChevronLeft color={colors.text} size={20} strokeWidth={1.9} style={{ transform: [{ scaleX: isRTL ? -1 : 1 }] }} />
        </IconButton>
        <AppText variant="title" style={{ flex: 1 }}>
          {t('title')}
        </AppText>
      </View>
      <AppText color="textSoft">{t('sub')}</AppText>

      {links.isLoading && <ActivityIndicator color={colors.primary} />}
      {links.isError && (
        <Card tone="red" padding={spacing.lg}>
          <AppText color="red">{t('failed', { reason: (links.error as Error).message })}</AppText>
        </Card>
      )}

      {links.data && (
        <>
          <Card padding={spacing.lg} style={{ gap: spacing.sm }}>
            <AppText weight="extrabold" style={{ fontSize: 17 }}>
              {t('full')}
            </AppText>
            <AppText variant="small" color="textMuted">
              {t('fullSub')}
            </AppText>
            <Pressable onPress={() => Linking.openURL(links.data.image.view)} accessibilityRole="imagebutton" accessibilityLabel={t('full')}>
              <Image
                source={{ uri: links.data.image.view }}
                onLoad={(e) => {
                  const { width, height } = e.nativeEvent.source;
                  if (width && height) setRatio(width / height);
                }}
                style={{ width: '100%', aspectRatio: ratio, borderRadius: radius.md, backgroundColor: colors.surface }}
                resizeMode="contain"
              />
            </Pressable>
          </Card>

          <DocCard icon={<FileText color={colors.primary} size={20} />} bg="primaryTint" title={t('design')} sub={t('designSub')} links={links.data.design} t={t} />
          <DocCard icon={<Plug color={colors.green} size={20} />} bg="greenTint" title={t('api')} sub={t('apiSub')} links={links.data.api} t={t} />
          <DocCard icon={<ImageIcon color={colors.purple} size={20} />} bg="purpleTint" title={t('image')} sub={t('imageSub')} links={links.data.image} t={t} imageOnly />
        </>
      )}
    </ScrollView>
  );
}

function DocCard({
  icon,
  bg,
  title,
  sub,
  links,
  t,
  imageOnly,
}: {
  icon: React.ReactNode;
  bg: ColorToken;
  title: string;
  sub: string;
  links: { view: string; download: string };
  t: (k: string) => string;
  imageOnly?: boolean;
}) {
  const pill = (label: string, url: string, primary: boolean, withIcon: boolean) => (
    <Pressable
      onPress={() => Linking.openURL(url)}
      accessibilityRole="link"
      style={({ pressed }) => ({
        flex: 1,
        minHeight: sizes.touch,
        borderRadius: radius.pill,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        backgroundColor: primary ? colors.primary : colors.surface,
        borderWidth: primary ? 0 : 1,
        borderColor: colors.border,
        opacity: pressed ? 0.85 : 1,
      })}
    >
      {withIcon && <Download color={primary ? colors.onDark : colors.primary} size={16} />}
      <AppText weight="bold" color={primary ? 'onDark' : 'primary'}>
        {label}
      </AppText>
    </Pressable>
  );
  return (
    <Card padding={spacing.lg} style={{ gap: spacing.md }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing.md }}>
        <IconBadge size={44} bg={bg} round>
          {icon}
        </IconBadge>
        <View style={{ flex: 1, gap: 2 }}>
          <AppText weight="bold">{title}</AppText>
          <AppText variant="caption" color="textMuted">
            {sub}
          </AppText>
        </View>
      </View>
      <View style={{ flexDirection: 'row', gap: spacing.sm }}>
        {!imageOnly && pill(t('open'), links.view, false, false)}
        {pill(t('download'), links.download, true, true)}
      </View>
    </Card>
  );
}

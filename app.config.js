// Wraps app.json: Intercom's Messenger (support chat, opened from Saree3) is set up at build time with the workspace
// app id and the Intercom mobile API keys from the build's env (EAS env: INTERCOM_ANDROID_KEY / INTERCOM_IOS_KEY,
// set with scripts/set-intercom-keys.ps1). Without the keys the plugin is left out and the app builds as before.
const INTERCOM_APP_ID = 'kry6kbek';

module.exports = ({ config }) => {
  const android = process.env.INTERCOM_ANDROID_KEY;
  const ios = process.env.INTERCOM_IOS_KEY;
  const plugins = (config.plugins ?? []).flatMap((p) => {
    if (p !== '@intercom/intercom-react-native') return [p];
    if (!android && !ios) return [];
    return [['@intercom/intercom-react-native', { appId: INTERCOM_APP_ID, androidApiKey: android ?? '', iosApiKey: ios ?? '', intercomRegion: 'US' }]];
  });
  return { ...config, plugins, extra: { ...config.extra, intercomAppId: INTERCOM_APP_ID } };
};

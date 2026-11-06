// Wraps app.json. Support chat with the Muntej team is Intercom's web Messenger shown inside the app (screen 57, a web
// view of the hosted support page); Intercom's Android SDK was removed on 26 Oct (its window opened empty and froze the
// app), so no Intercom keys are needed at build time. The workspace app id is kept for the web.
const INTERCOM_APP_ID = 'lrn5nc6m';

// PostHog (product analytics, src/lib/analytics.ts): the project's public client key, US cloud
const POSTHOG_KEY = 'phc_qhy99hF49RqU5ZD5fSMVEokUzLpayhmKCjYbCQn8wVhS';
const POSTHOG_HOST = 'https://us.i.posthog.com';

// Muntej Test (owner, 6 Nov: "create a new version for testing before going live"): APP_VARIANT=test (eas.json profile
// "test") builds a second app that installs beside the store one, with its own name, id and link scheme. It takes
// updates from the preview channel, where every release lands first; `npm run ship -- --live` then sends the same
// update to the store app. No push there until a Firebase Android app exists for sa.muntej.app.test.
const TEST = process.env.APP_VARIANT === 'test';

module.exports = ({ config }) => ({
  ...config,
  ...(TEST
    ? {
        name: 'Muntej Test',
        scheme: 'muntej-test',
        ios: { ...config.ios, bundleIdentifier: 'sa.muntej.app.test' },
        android: { ...config.android, package: 'sa.muntej.app.test', googleServicesFile: undefined },
      }
    : {}),
  extra: { ...config.extra, intercomAppId: INTERCOM_APP_ID, posthogKey: POSTHOG_KEY, posthogHost: POSTHOG_HOST, variant: TEST ? 'test' : 'store' },
});

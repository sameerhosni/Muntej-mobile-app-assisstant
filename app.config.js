// Wraps app.json. Support chat with the Muntej team is Intercom's web Messenger shown inside the app (screen 57, a web
// view of the hosted support page); Intercom's Android SDK was removed on 26 Oct (its window opened empty and froze the
// app), so no Intercom keys are needed at build time. The workspace app id is kept for the web.
const INTERCOM_APP_ID = 'lrn5nc6m';

// PostHog (product analytics, src/lib/analytics.ts): the project's public client key, US cloud
const POSTHOG_KEY = 'phc_qhy99hF49RqU5ZD5fSMVEokUzLpayhmKCjYbCQn8wVhS';
const POSTHOG_HOST = 'https://us.i.posthog.com';

module.exports = ({ config }) => ({
  ...config,
  extra: { ...config.extra, intercomAppId: INTERCOM_APP_ID, posthogKey: POSTHOG_KEY, posthogHost: POSTHOG_HOST },
});

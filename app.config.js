// Wraps app.json. Support chat with the Muntej team is Intercom's web Messenger shown inside the app (screen 57, a web
// view of the hosted support page); Intercom's Android SDK was removed on 26 Oct (its window opened empty and froze the
// app), so no Intercom keys are needed at build time. The workspace app id is kept for the web.
const INTERCOM_APP_ID = 'lrn5nc6m';

module.exports = ({ config }) => ({ ...config, extra: { ...config.extra, intercomAppId: INTERCOM_APP_ID } });

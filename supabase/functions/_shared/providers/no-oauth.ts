// For tools that only connect with a personal token (Jira, Trello for now): the sign-in parts, never called.
// Its own file so providers can use it at load time without an import cycle through connections.ts.
import type { Tokens } from '../connections.ts';

export const noOAuth = {
  configured: () => false,
  authorizeUrl: () => '',
  exchange: (): Promise<Tokens> => Promise.reject(new Error('Connect with a token')),
  refresh: (t: Tokens) => Promise.resolve(t),
  account: (): Promise<{ label: string }> => Promise.reject(new Error('Connect with a token')),
};

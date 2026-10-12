import { expect, it, vi } from 'vitest';
import { connectorApi } from './api-browser-connector';
it('captures the current explicit Hermes profile for each readonly request', async () => {
  const fetch = vi.fn().mockResolvedValue({}); let profile = 'a';
  const api = connectorApi(fetch, url => `${url}?profile=${profile}`);
  await api.pairReadonlyChrome('chrome:Default', 'fixture-install'); profile = 'b';
  await api.readReadonlyChrome('chrome:Profile 5', 'browser_tabs'); await api.disconnectReadonlyChrome('chrome:Profile 5'); await api.listReadonlyChrome();
  expect(fetch.mock.calls.map(call => call[0])).toEqual(['/api/browser/connectors/pair?profile=a', '/api/browser/connectors/read?profile=b', '/api/browser/connectors/disconnect?profile=b', '/api/browser/connectors?profile=b']);
  expect(JSON.parse(fetch.mock.calls[1][1].body)).toEqual({ browser_profile_id: 'chrome:Profile 5', action: 'browser_tabs', consent: true });
});

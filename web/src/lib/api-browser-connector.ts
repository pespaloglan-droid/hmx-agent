export interface ReadonlyConnection {
  browser_profile_id: string;
  install_id: string;
  state: "connected_readonly";
  busy: boolean;
}
export interface ReadonlyPair {
  ticket: string;
  ttl_seconds: number;
  browser_profile_id: string;
  install_id: string;
}
export interface ReadonlyRead {
  state: string;
  agent_control: false;
  tabs?: { title: string; origin: string }[];
  image_data_url?: string;
}
export function connectorApi(fetchJSON: <T>(url: string, init?: RequestInit) => Promise<T>, profilePath: (url: string) => string) {
  const post = <T>(path: string, body: object) => fetchJSON<T>(profilePath(`/api/browser/connectors/${path}`), {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  return {
    pairReadonlyChrome: (browserProfileId: string, installId: string) =>
      post<ReadonlyPair>("pair", { browser_profile_id: browserProfileId, install_id: installId, consent: true }),
    listReadonlyChrome: () => fetchJSON<{ connections: ReadonlyConnection[]; agent_control: false }>(profilePath("/api/browser/connectors")),
    readReadonlyChrome: (browserProfileId: string, action: "browser_tabs" | "browser_screenshot") =>
      post<ReadonlyRead>("read", { browser_profile_id: browserProfileId, action, consent: true }),
    disconnectReadonlyChrome: (browserProfileId: string) =>
      post<ReadonlyRead>("disconnect", { browser_profile_id: browserProfileId, consent: true }),
  };
}

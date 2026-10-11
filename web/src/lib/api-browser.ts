export interface BrowserConfigurationStatus {
  backend: string;
  cdp_configured: boolean;
  real_profile_consent: boolean;
  connection_state: "not_verified";
  capabilities: {
    profile_discovery: boolean;
    profile_attach: boolean;
    parallel_tasks: boolean;
    live_preview: boolean;
  };
}

export interface BrowserProfileMetadata {
  id: string;
  directory: string;
  label: string;
  email?: string | null;
  connection_state: "not_connected";
  site_session: "not_checked";
}

export interface BrowserInventory {
  read_only: boolean;
  emails_included: boolean;
  browsers: {
    id: string;
    label: string;
    installed: boolean;
    warning: string | null;
    profiles: BrowserProfileMetadata[];
  }[];
}
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

export interface BrowserConnectionProbe {
  state: "reachable" | "busy" | "unsupported_platform" | "not_found"
    | "invalid_discovery" | "discovery_unavailable" | "dependency_missing"
    | "timeout" | "invalid_reply" | "connection_failed";
  product?: string;
  protocol_version?: string;
  checked_at?: string;
}

export interface BrowserFlowResult {
  state: BrowserConnectionProbe["state"] | "listed" | "workspace_visible"
    | "login_prompt" | "inconclusive" | "target_changed" | "target_unavailable"
    | "read_blocked";
  targets?: { id: string; label: string; origin: string }[];
  markers?: { page_ready: boolean; new_project_visible: boolean; sign_in_visible: boolean };
  account_verified?: false;
  checked_at?: string;
}
import type { BrowserConfigurationStatus, BrowserConnectionProbe, BrowserFlowResult, FlowProjectResult, FlowStageResult, FlowAgentResult, BrowserInventory } from "./api-browser";

// Profile resolution stays late-bound at each explicit action, not at module load.
export function browserApi(fetchJSON: <T>(url: string, init?: RequestInit) => Promise<T>, profilePath: (url: string) => string) {
  return {
    listFlowTabs: () =>
      fetchJSON<BrowserFlowResult>("/api/browser/flow/tabs", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true }),
      }),
    stageFlowText: (stageId: string, targetId: string, projectUrl: string, items: { name: string; prompt: string }[]) =>
      fetchJSON<FlowStageResult>(profilePath("/api/browser/flow/stage"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true, fill_consent: true, stage_id: stageId,
          target_id: targetId, project_url: projectUrl, items }),
      }),
    getFlowStageStatus: (stageId: string) =>
      fetchJSON<FlowStageResult>(profilePath(`/api/browser/flow/stage/${encodeURIComponent(stageId)}`)),
    checkFlowStageAgent: (stageId: string, currentTargetId?: string) =>
      fetchJSON<FlowAgentResult>(profilePath("/api/browser/flow/stage/agent-check"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage_id: stageId, consent: true, current_target_id: currentTargetId }),
      }),
    submitFlowStage: (stageId: string, items: { name: string; prompt: string }[]) =>
      fetchJSON<FlowStageResult>(profilePath("/api/browser/flow/stage/submit"), {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ stage_id: stageId, items, submit_consent: true, settings_confirmed: true }),
      }),
    checkFlowProject: (targetId: string, projectUrl: string) =>
      fetchJSON<FlowProjectResult>("/api/browser/flow/project", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true, target_id: targetId, project_url: projectUrl }),
      }),
    checkFlowTab: (targetId: string) =>
      fetchJSON<BrowserFlowResult>("/api/browser/flow/check", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true, target_id: targetId }),
      }),
    probeBrowserConnection: () =>
      fetchJSON<BrowserConnectionProbe>("/api/browser/probe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true }),
      }),
    getBrowserStatus: (profile?: string) => fetchJSON<BrowserConfigurationStatus>(
      `/api/browser/status${profile ? `?profile=${encodeURIComponent(profile)}` : ""}`,
    ),
    discoverBrowserProfiles: (includeEmails = false) =>
      fetchJSON<BrowserInventory>("/api/browser/discover", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ consent: true, include_emails: includeEmails }),
      }),
  };
}

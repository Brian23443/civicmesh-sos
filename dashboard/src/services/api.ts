import type { Incident } from "../types/incident";

export type IncidentQueryState = "active" | "removed" | "all";

export interface BridgeHealth {
  serial_connected: boolean;
  port: string | null;
  last_frame_at: number | null;
  active_count: number;
}

export class BridgeApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "BridgeApiError";
    this.status = status;
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/json",
      ...init?.headers,
    },
  });

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const body = (await response.json()) as { detail?: unknown };
      if (typeof body.detail === "string") detail = body.detail;
    } catch {
      // A non-JSON error response still carries a useful HTTP status.
    }
    throw new BridgeApiError(
      detail || `Bridge request failed with status ${response.status}`,
      response.status,
    );
  }

  return (await response.json()) as T;
}

export function fetchIncidents(
  state: IncidentQueryState = "active",
): Promise<Incident[]> {
  return requestJson<Incident[]>(
    `/api/incidents?state=${encodeURIComponent(state)}`,
  );
}

export function removeIncident(id: string): Promise<Incident> {
  return requestJson<Incident>(
    `/api/incidents/${encodeURIComponent(id)}/remove`,
    { method: "POST" },
  );
}

export function restoreIncident(id: string): Promise<Incident> {
  return requestJson<Incident>(
    `/api/incidents/${encodeURIComponent(id)}/restore`,
    { method: "POST" },
  );
}

export function fetchHealth(): Promise<BridgeHealth> {
  return requestJson<BridgeHealth>("/api/health");
}

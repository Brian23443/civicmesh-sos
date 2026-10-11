/**
 * Responder-facing wording: turns the decoded frame into what a crew needs to know —
 * plain labels, what to bring, and how far to trust the location.
 * Everything here is derived from the 18-byte frame; nothing is invented.
 */
import type { Incident } from "../types/incident";

export const PRIORITY_LABELS: Record<string, string> = {
  IMMEDIATE: "Immediate",
  DELAYED: "Delayed",
  MINOR: "Minor",
  DECEASED: "Deceased",
};

export const HAZARD_LABELS: Record<string, string> = {
  NONE: "No hazard named",
  FLOOD: "Flood",
  FIRE_SMOKE: "Fire / smoke",
  STRUCTURAL_COLLAPSE: "Structural collapse",
  HAZMAT_GAS: "Gas / hazmat",
  ELECTRICAL_POWER: "Electrical hazard",
  EXTREME_WEATHER: "Extreme weather",
  MEDICAL_CRISIS: "Medical emergency",
  ACTIVE_VIOLENCE: "Active violence",
  TSUNAMI_SURGE: "Tsunami / surge",
  LANDSLIDE: "Landslide",
  HYPOTHERMIA_FREEZE: "Freezing / hypothermia",
  HEAT_STROKE: "Heat stroke",
  SINKHOLE_SUBSIDENCE: "Sinkhole",
  CONTAMINATED_WATER: "Contaminated water",
  OTHER: "Other emergency",
};

export const STATUS_LABELS: Record<string, { short: string; detail: string }> = {
  TRAPPED: { short: "Trapped", detail: "Trapped — needs extraction" },
  EXPOSED: { short: "Exposed", detail: "Exposed — outside or unsheltered" },
  SHELTERED: { short: "Sheltered", detail: "Sheltered — inside, can wait" },
  UNKNOWN: { short: "Status unknown", detail: "Status unknown" },
};

const titleCase = (name: string) =>
  name.charAt(0) + name.slice(1).toLowerCase().replaceAll("_", " ");

export const priorityLabel = (i: Incident) => PRIORITY_LABELS[i.priority.name] ?? titleCase(i.priority.name);
export const hazardLabel = (i: Incident) => HAZARD_LABELS[i.hazard.name] ?? titleCase(i.hazard.name);
export const statusLabel = (i: Incident) => STATUS_LABELS[i.status.name]?.short ?? titleCase(i.status.name);
export const statusDetail = (i: Incident) => STATUS_LABELS[i.status.name]?.detail ?? titleCase(i.status.name);

/** The 8 medical flags: short name for chips, and the kit to bring. */
export const MEDICAL_NEEDS: Record<string, { label: string; bring: string }> = {
  INSULIN: { label: "Insulin", bring: "Insulin / glucose kit" },
  OXYGEN: { label: "Oxygen", bring: "Portable oxygen" },
  BLEEDING: { label: "Bleeding", bring: "Trauma / tourniquet kit" },
  HYPOTHERMIA: { label: "Hypothermia", bring: "Blankets and warming" },
  MOBILITY_IMPAIRED: { label: "Can't walk", bring: "Stretcher / lift assist" },
  CARDIAC: { label: "Cardiac", bring: "AED / cardiac care" },
  PREGNANCY_INFANT: { label: "Pregnancy / infant", bring: "OB kit and infant supplies" },
  BURNS: { label: "Burns", bring: "Burn kit" },
};

export const medicalLabel = (flag: string) => MEDICAL_NEEDS[flag]?.label ?? titleCase(flag);

export interface Need {
  key: string;
  bring: string;
  reason: string;
  /** "medical" needs come from survivor-reported flags; "scene" ones from hazard/status/headcount. */
  kind: "medical" | "scene";
}

const HAZARD_NEEDS: Record<string, string> = {
  FLOOD: "Water-rescue equipment",
  TSUNAMI_SURGE: "Water-rescue equipment",
  FIRE_SMOKE: "Fire suppression / breathing apparatus",
  HAZMAT_GAS: "Hazmat PPE / gas detector",
  CONTAMINATED_WATER: "Hazmat PPE / clean water",
  ELECTRICAL_POWER: "Utility isolation — treat lines as live",
  STRUCTURAL_COLLAPSE: "Shoring / collapse rescue tools",
  LANDSLIDE: "Shoring / collapse rescue tools",
  SINKHOLE_SUBSIDENCE: "Rope rescue / shoring",
  HYPOTHERMIA_FREEZE: "Blankets and warming",
  HEAT_STROKE: "Cooling and fluids",
  ACTIVE_VIOLENCE: "Police escort — do not enter alone",
};

/** What to bring, most specific first. Medical needs are reported by the survivor's message. */
export function needsFor(incident: Incident): Need[] {
  const needs: Need[] = incident.medical
    .filter((flag) => MEDICAL_NEEDS[flag])
    .map((flag) => ({
      key: flag,
      bring: MEDICAL_NEEDS[flag].bring,
      reason: `reported: ${MEDICAL_NEEDS[flag].label.toLowerCase()}`,
      kind: "medical",
    }));
  const seen = new Set(needs.map((n) => n.bring));
  const add = (key: string, bring: string, reason: string) => {
    if (seen.has(bring)) return;
    seen.add(bring);
    needs.push({ key, bring, reason, kind: "scene" });
  };
  const hazard = HAZARD_NEEDS[incident.hazard.name];
  if (hazard) add(`hazard-${incident.hazard.name}`, hazard, hazardLabel(incident).toLowerCase());
  if (incident.status.name === "TRAPPED") add("trapped", "Forcible entry / extraction tools", "trapped");
  if (incident.children > 0) {
    add("children", "Pediatric care", `${incident.children} ${incident.children === 1 ? "child" : "children"}`);
  }
  return needs;
}

/** How far to trust the pin. null when the GPS is the scene and nothing contradicts it. */
export function locationNote(incident: Incident): string | null {
  if (incident.third_party) {
    return "Reported on someone else's behalf — the GPS is the reporter's phone, not the people in need.";
  }
  switch (incident.location_type) {
    case "EXPLICIT_ADDRESS":
      return "Survivor gave a street address that couldn't fit in the radio message. Treat the GPS as approximate.";
    case "LANDMARK_POI":
      return "Survivor named a landmark that couldn't fit in the radio message. Search around the pin.";
    case "PROXIMATE_OFFSET":
      return "Survivor said they are nearby (e.g. down the street), not exactly at the pin.";
    default:
      return incident.location_discrepancy ? "Reported location may differ from the device GPS." : null;
  }
}

export function accuracyText(incident: Incident): string {
  if (incident.gps_accuracy.name === "NO_FIX") return "No GPS fix";
  if (incident.gps_accuracy.meters_max == null) return "Coarse GPS (over 500 m)";
  return `±${incident.gps_accuracy.meters_max} m`;
}

export function agoText(timestamp: number, now = Date.now() / 1000): string {
  const seconds = Math.max(0, Math.floor(now - timestamp));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours} h ago` : `${Math.floor(hours / 24)} d ago`;
}

export function peopleText(incident: Incident): string {
  const total = incident.adults + incident.children;
  const head = `${total} ${total === 1 ? "person" : "people"}`;
  if (!incident.children) return head;
  return `${head} (${incident.adults} adult${incident.adults === 1 ? "" : "s"}, ${incident.children} child${incident.children === 1 ? "" : "ren"})`;
}

/** Totals of reported medical needs and children across active incidents, for logistics. */
export function supplyTotals(incidents: Incident[]): Array<{ key: string; label: string; count: number }> {
  const active = incidents.filter((i) => i.state === "active");
  const totals = Object.keys(MEDICAL_NEEDS)
    .map((flag) => ({
      key: flag,
      label: MEDICAL_NEEDS[flag].label,
      count: active.filter((i) => i.medical.includes(flag)).length,
    }))
    .filter((t) => t.count > 0);
  const children = active.reduce((sum, i) => sum + i.children, 0);
  if (children) totals.push({ key: "children", label: children === 1 ? "child" : "children", count: children });
  return totals;
}

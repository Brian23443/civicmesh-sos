export type PriorityColor = "red" | "yellow" | "green" | "black";

export interface TriagePriority {
  value: number;
  name: string;
  color: PriorityColor;
}

export interface HazardClass {
  value: number;
  name: string;
}

export interface RescueStatus {
  value: number;
  name: string;
}

export interface GpsAccuracy {
  value: number;
  name: string;
  meters_max: number | null;
}

export interface Incident {
  id: string;
  frame_hex: string;
  device_id: number;
  seq: number;
  rssi: number | null;
  snr: number | null;
  heard_count: number;
  priority: TriagePriority;
  hazard: HazardClass;
  status: RescueStatus;
  adults: number;
  children: number;
  medical: string[];
  third_party: boolean;
  location_type: string;
  location_discrepancy: boolean;
  lat: number;
  lon: number;
  gps_accuracy: GpsAccuracy;
  sent_at: number;
  received_at: number;
  last_heard_at: number;
  state: "active" | "removed";
  removed_at: number | null;
}

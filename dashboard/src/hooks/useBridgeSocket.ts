import { useEffect, useRef, useState } from "react";

import type { BridgeHealth } from "../services/api";
import type { Incident } from "../types/incident";

export type BridgeConnectionState =
  | "connecting"
  | "connected"
  | "reconnecting";

type IncidentEventType =
  | "incident.new"
  | "incident.updated"
  | "incident.removed"
  | "incident.restored";

interface IncidentMessage {
  type: IncidentEventType;
  incident: Incident;
}

interface HealthMessage {
  type: "health";
  health: BridgeHealth;
}

type BridgeMessage = IncidentMessage | HealthMessage;

interface UseBridgeSocketOptions {
  onIncident: (type: IncidentEventType, incident: Incident) => void;
  onHealth: (health: BridgeHealth) => void;
}

function socketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/ws`;
}

function parseMessage(value: string): BridgeMessage | null {
  try {
    const parsed = JSON.parse(value) as Partial<BridgeMessage>;
    if (parsed.type === "health" && "health" in parsed && parsed.health) {
      return parsed as HealthMessage;
    }
    if (
      (parsed.type === "incident.new" ||
        parsed.type === "incident.updated" ||
        parsed.type === "incident.removed" ||
        parsed.type === "incident.restored") &&
      "incident" in parsed &&
      parsed.incident
    ) {
      return parsed as IncidentMessage;
    }
  } catch {
    // Malformed bridge messages are ignored; the socket remains available.
  }
  return null;
}

export function useBridgeSocket({
  onIncident,
  onHealth,
}: UseBridgeSocketOptions) {
  const [connectionState, setConnectionState] =
    useState<BridgeConnectionState>("connecting");
  const [retryCount, setRetryCount] = useState(0);
  const handlersRef = useRef({ onIncident, onHealth });

  useEffect(() => {
    handlersRef.current = { onIncident, onHealth };
  }, [onHealth, onIncident]);

  useEffect(() => {
    let disposed = false;
    let socket: WebSocket | null = null;
    let reconnectTimer: number | null = null;
    let attempt = 0;

    const connect = () => {
      if (disposed) return;
      setConnectionState(attempt === 0 ? "connecting" : "reconnecting");

      socket = new WebSocket(socketUrl());

      socket.addEventListener("open", () => {
        attempt = 0;
        setRetryCount(0);
        setConnectionState("connected");
      });

      socket.addEventListener("message", (event) => {
        if (typeof event.data !== "string") return;
        const message = parseMessage(event.data);
        if (!message) return;

        if (message.type === "health") {
          handlersRef.current.onHealth(message.health);
        } else {
          handlersRef.current.onIncident(message.type, message.incident);
        }
      });

      socket.addEventListener("close", () => {
        if (disposed) return;
        attempt += 1;
        setRetryCount(attempt);
        setConnectionState("reconnecting");
        const delay = Math.min(1_000 * 2 ** (attempt - 1), 15_000);
        reconnectTimer = window.setTimeout(connect, delay);
      });

      socket.addEventListener("error", () => {
        socket?.close();
      });
    };

    connect();

    return () => {
      disposed = true;
      if (reconnectTimer !== null) window.clearTimeout(reconnectTimer);
      socket?.close();
    };
  }, []);

  return { connectionState, retryCount };
}

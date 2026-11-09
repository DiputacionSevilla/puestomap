export type TriStateValue = "YES" | "NO" | "UNKNOWN";

export type VncUiState =
  | "READY"
  | "NOT_LISTENING"
  | "NOT_INSTALLED"
  | "OFFLINE"
  | "UNKNOWN";

export type MultiState = "SINGLE" | "MULTI_OK" | "MULTI_PENDING";

export type RoleValue = "ADMIN" | "TECH" | "VIEWER";

export type SessionModeValue = "WEB" | "NATIVE";

export type SessionStatusValue =
  | "PENDING"
  | "ACTIVE"
  | "ENDED"
  | "FAILED"
  | "EXPIRED";

export type PlanSize = {
  planWidth: number;
  planHeight: number;
};

export type LatLng = {
  lat: number;
  lng: number;
};

export type ScreenInput = {
  index: number;
  port: number;
  label?: string;
  enabled?: boolean;
};

export type ScreenLike = {
  index: number;
  port: number;
  label: string;
  enabled: boolean;
  source: string;
};

export type VncInstalledInput = {
  lastVncOkAt: Date | null;
  ocsInventoryRecent: boolean;
  ocsHasTightVnc: boolean | null;
  lastProbeOnline: boolean | null;
  lastProbeVncRefused: boolean;
  now?: Date;
};

export type VncInstalledResult = {
  state: TriStateValue;
  src: "PROBE" | "OCS" | "MANUAL" | null;
};

export type DebugEventType =
  | 'runtime-error'
  | 'unhandled-rejection'
  | 'network-failure';

export type DebugEventSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'active' | 'exorcised' | 'resurrected';

export type PersistedDiagnosis = {
  status: 'ready' | 'error';
  result?: import('../ai/diagnosis').DiagnosisResult;
  error?: string;
  updatedAt: number;
};

export type DebugEvent = {
  id: string;
  type: DebugEventType;
  timestamp: number;
  severity: DebugEventSeverity;
  title: string;
  message: string;
  fingerprint: string;
  occurrences: number;
  firstSeenAt?: number;
  lastSeenAt?: number;
  diagnosis?: PersistedDiagnosis;
  incidentStatus?: IncidentStatus;
  resurrectionCount?: number;
  exorcisedAt?: number;
  resurrectedAt?: number;
  source?: {
    url: string;
    line?: number;
    column?: number;
  };
  request?: {
    method: string;
    url: string;
    status?: number;
    statusText?: string;
  };
};

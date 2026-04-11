import type { AuditEntry, OverrideEvent } from "../domain/types";

export function buildAuditLog(overrides: OverrideEvent[] = []): AuditEntry[] {
  return overrides.map((override) => ({
    timestamp: new Date().toISOString(),
    actor: "user",
    action: `override:${override.kind}`,
    targetId: override.targetId,
    newValue: override.value,
    reason: override.reason,
    sourceRef: override.sourceRef,
  }));
}

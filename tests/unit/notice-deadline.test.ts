/**
 * Unit-Tests für `calculateNoticeDeadline`.
 *
 * BGB §573c-Tabelle, Werktag-Korrektur, Mieter-vs-Vermieter-Pfade.
 */

import { describe, it, expect } from "vitest";
import { calculateNoticeDeadline } from "@/lib/tenants/noticeDeadline";

describe("calculateNoticeDeadline", () => {
  it("Mieter, Eingang am 1. Werktag → 3 Monate, Ende am letzten Tag des 3. Folgemonats", () => {
    // 2024-04-02 (Dienstag) → 1. Werktag April 2024.
    // 3 Monate ab April → Ende = 30. Juni 2024.
    const r = calculateNoticeDeadline({
      notice_received_date: "2024-04-02",
      notice_party: "tenant",
    });
    expect(r.notice_period_months).toBe(3);
    expect(r.workday_correction_applied).toBe(false);
    expect(r.lease_end_date).toBe("2024-06-30");
  });

  it("Mieter, Eingang nach dem 3. Werktag → Korrektur, Frist startet im Folgemonat", () => {
    // April 2024: Mo 1, Di 2, Mi 3, Do 4 → 3. Werktag = 3.
    // Eingang am 4. → korrigiert. Frist beginnt Mai → Ende = 31. Juli.
    const r = calculateNoticeDeadline({
      notice_received_date: "2024-04-04",
      notice_party: "tenant",
    });
    expect(r.workday_correction_applied).toBe(true);
    expect(r.lease_end_date).toBe("2024-07-31");
  });

  it("Vermieter, Mietdauer < 5 Jahre → 3 Monate", () => {
    const r = calculateNoticeDeadline({
      notice_received_date: "2024-04-02",
      notice_party: "landlord",
      lease_duration_years: 3,
    });
    expect(r.notice_period_months).toBe(3);
    expect(r.lease_end_date).toBe("2024-06-30");
  });

  it("Vermieter, Mietdauer 5..7 Jahre → 6 Monate", () => {
    const r = calculateNoticeDeadline({
      notice_received_date: "2024-04-02",
      notice_party: "landlord",
      lease_duration_years: 5,
    });
    expect(r.notice_period_months).toBe(6);
    // April + 6 Monate = September → Ende 30.09.2024
    expect(r.lease_end_date).toBe("2024-09-30");
  });

  it("Vermieter, Mietdauer ≥ 8 Jahre → 9 Monate", () => {
    const r = calculateNoticeDeadline({
      notice_received_date: "2024-04-02",
      notice_party: "landlord",
      lease_duration_years: 10,
    });
    expect(r.notice_period_months).toBe(9);
    // April + 9 Monate = Dezember → 31.12.2024
    expect(r.lease_end_date).toBe("2024-12-31");
  });

  it("Manuelles Override notice_period_months gewinnt", () => {
    const r = calculateNoticeDeadline({
      notice_received_date: "2024-04-02",
      notice_party: "tenant",
      notice_period_months: 6,
    });
    expect(r.notice_period_months).toBe(6);
    expect(r.lease_end_date).toBe("2024-09-30");
  });
});

import { describe, expect, test } from "bun:test";
import { dateOrDatetime, toIso } from "../src/dates";

describe("dateOrDatetime", () => {
  test.each([
    "2026-09-10",
    "2026-09-10T00:00:00Z",
    "2026-09-10T08:30:00.123Z",
    "2026-09-10T08:30:00-05:00",
    "2026-09-10T08:30:00",
    "2026-09-10T08:30",
  ])("accepts %s", (v) => {
    expect(dateOrDatetime.safeParse(v).success).toBe(true);
  });
  test.each([
    "yesterday",
    "10/09/2026",
    "",
    "2026-9-1",
    "2026-09-10 08:30:00",
    // Calendar-invalid values must be rejected, not rolled over to a nearby date.
    "2026-02-30",
    "2026-13-45",
    "2026-02-30T00:00:00Z",
    "2026-13-45T00:00:00Z",
  ])("rejects %s", (v) => {
    const r = dateOrDatetime.safeParse(v);
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0]!.message).toContain("YYYY-MM-DD");
  });
});

describe("toIso", () => {
  test("undefined passes through", () => {
    expect(toIso(undefined, "start")).toBeUndefined();
  });

  test("date-only start is local midnight of that day", () => {
    expect(toIso("2026-09-10", "start")).toBe(new Date(2026, 8, 10).toISOString());
  });

  test("date-only end is local midnight of the next day (inclusive)", () => {
    expect(toIso("2026-09-10", "end")).toBe(new Date(2026, 8, 11).toISOString());
  });

  test("date-only end rolls over month boundaries", () => {
    expect(toIso("2026-09-30", "end")).toBe(new Date(2026, 9, 1).toISOString());
  });

  test("full datetime is normalised to UTC and not shifted", () => {
    expect(toIso("2026-09-10T08:30:00-05:00", "end")).toBe("2026-09-10T13:30:00.000Z");
    expect(toIso("2026-09-10T00:00:00Z", "start")).toBe("2026-09-10T00:00:00.000Z");
  });

  test("datetime without an offset is read as local time", () => {
    expect(toIso("2026-09-10T08:30:00", "start")).toBe(new Date(2026, 8, 10, 8, 30).toISOString());
  });
});

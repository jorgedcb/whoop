import { describe, expect, test } from "bun:test";
import * as s from "../src/schemas";
import recovery from "./fixtures/recovery.json";
import sleep from "./fixtures/sleep.json";
import cycle from "./fixtures/cycle.json";
import workout from "./fixtures/workout.json";
import profile from "./fixtures/profile.json";
import body from "./fixtures/body.json";

describe("schemas parse real API shapes", () => {
  test("recovery collection, including an unscored record with score: null", () => {
    const parsed = s.paginated(s.recoverySchema).parse(recovery);
    expect(parsed.records).toHaveLength(2);
    expect(parsed.records[1]!.score).toBeNull();
  });

  test("sleep collection with v1_id: null", () => {
    const parsed = s.paginated(s.sleepSchema).parse(sleep);
    expect(parsed.records[0]!.score?.stage_summary.sleep_cycle_count).toBe(3);
  });

  test("cycle collection with an in-progress cycle (end: null)", () => {
    const parsed = s.paginated(s.cycleSchema).parse(cycle);
    expect(parsed.records[0]!.end).toBeNull();
    expect(parsed.records[1]!.score?.strain).toBeCloseTo(5.295, 2);
  });

  test("workout with null GPS fields", () => {
    const parsed = s.paginated(s.workoutSchema).parse(workout);
    expect(parsed.records[0]!.score?.distance_meter).toBeNull();
    expect(parsed.records[0]!.score?.zone_durations.zone_two_milli).toBe(900000);
  });

  test("profile and body measurements", () => {
    expect(s.profileSchema.parse(profile).first_name).toBe("John");
    expect(s.bodyMeasurementSchema.parse(body).max_heart_rate).toBe(200);
  });

  test("schemas are strict enough to reject a wrong shape", () => {
    expect(s.recoverySchema.safeParse({ cycle_id: "not-a-number" }).success).toBe(false);
    expect(s.cycleSchema.safeParse({ ...cycle.records[1], score_state: "BOGUS" }).success).toBe(false);
  });
});

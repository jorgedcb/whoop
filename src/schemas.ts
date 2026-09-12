/**
 * Zod schemas mirroring the WHOOP v2 API response shapes.
 * https://developer.whoop.com/api
 *
 * These double as MCP outputSchemas and as the TypeScript types for the client.
 * `user_id` is omitted everywhere: this server only ever serves one user.
 */
import { z } from "zod";

export const scoreState = z.enum(["SCORED", "PENDING_SCORE", "UNSCORABLE"]);

const timestamps = {
  created_at: z.string(),
  updated_at: z.string(),
};

const activityWindow = {
  start: z.string(),
  end: z.string().nullish().describe("Absent while the activity is still in progress"),
  timezone_offset: z.string(),
};

// ---- Recovery ----

export const recoverySchema = z.object({
  cycle_id: z.number(),
  sleep_id: z.string(),
  ...timestamps,
  score_state: scoreState,
  score: z
    .object({
      user_calibrating: z.boolean(),
      recovery_score: z.number(),
      resting_heart_rate: z.number(),
      hrv_rmssd_milli: z.number(),
      spo2_percentage: z.number().nullish(),
      skin_temp_celsius: z.number().nullish(),
    })
    .nullish(),
});

// ---- Sleep ----

export const sleepSchema = z.object({
  id: z.string(),
  v1_id: z.number().nullish(),
  cycle_id: z.number(),
  ...timestamps,
  ...activityWindow,
  nap: z.boolean(),
  score_state: scoreState,
  score: z
    .object({
      stage_summary: z.object({
        total_in_bed_time_milli: z.number(),
        total_awake_time_milli: z.number(),
        total_no_data_time_milli: z.number(),
        total_light_sleep_time_milli: z.number(),
        total_slow_wave_sleep_time_milli: z.number(),
        total_rem_sleep_time_milli: z.number(),
        sleep_cycle_count: z.number(),
        disturbance_count: z.number(),
      }),
      sleep_needed: z.object({
        baseline_milli: z.number(),
        need_from_sleep_debt_milli: z.number(),
        need_from_recent_strain_milli: z.number(),
        need_from_recent_nap_milli: z.number(),
      }),
      respiratory_rate: z.number().nullish(),
      sleep_performance_percentage: z.number().nullish(),
      sleep_consistency_percentage: z.number().nullish(),
      sleep_efficiency_percentage: z.number().nullish(),
    })
    .nullish(),
});

// ---- Cycle ----

export const cycleSchema = z.object({
  id: z.number(),
  ...timestamps,
  ...activityWindow,
  score_state: scoreState,
  score: z
    .object({
      strain: z.number(),
      kilojoule: z.number(),
      average_heart_rate: z.number(),
      max_heart_rate: z.number(),
    })
    .nullish(),
});

// ---- Workout ----

export const workoutSchema = z.object({
  id: z.string(),
  v1_id: z.number().nullish(),
  ...timestamps,
  ...activityWindow,
  sport_id: z.number(),
  sport_name: z.string().nullish(),
  score_state: scoreState,
  score: z
    .object({
      strain: z.number(),
      average_heart_rate: z.number(),
      max_heart_rate: z.number(),
      kilojoule: z.number(),
      percent_recorded: z.number(),
      distance_meter: z.number().nullish(),
      altitude_gain_meter: z.number().nullish(),
      altitude_change_meter: z.number().nullish(),
      zone_durations: z.object({
        zone_zero_milli: z.number(),
        zone_one_milli: z.number(),
        zone_two_milli: z.number(),
        zone_three_milli: z.number(),
        zone_four_milli: z.number(),
        zone_five_milli: z.number(),
      }),
    })
    .nullish(),
});

// ---- User ----

export const profileSchema = z.object({
  email: z.string(),
  first_name: z.string(),
  last_name: z.string(),
});

export const bodyMeasurementSchema = z.object({
  height_meter: z.number(),
  weight_kilogram: z.number(),
  max_heart_rate: z.number(),
});

// ---- Helpers ----

export const paginated = <T extends z.ZodTypeAny>(record: T) =>
  z.object({ records: z.array(record), next_token: z.string().nullable() });

export type Recovery = z.infer<typeof recoverySchema>;
export type Sleep = z.infer<typeof sleepSchema>;
export type Cycle = z.infer<typeof cycleSchema>;
export type Workout = z.infer<typeof workoutSchema>;
export type Profile = z.infer<typeof profileSchema>;
export type BodyMeasurement = z.infer<typeof bodyMeasurementSchema>;

import { pool } from "../lib/db.js";

export async function reserveUsageSlot(params: {
  subjectType: "invite" | "session";
  subjectId: string;
  kind: "chat" | "image";
  limit: number;
}): Promise<boolean> {
  if (params.limit <= 0) {
    return true;
  }

  const result = await pool.query(
    `with upserted as (
       insert into usage_counters (subject_type, subject_id, kind, count)
       values ($1, $2, $3, 1)
       on conflict (subject_type, subject_id, counter_date, kind)
       do update set count = usage_counters.count + 1
       where usage_counters.count < $4
       returning 1
     )
     select 1 from upserted`,
    [params.subjectType, params.subjectId, params.kind, params.limit]
  );

  return (result.rowCount ?? 0) > 0;
}

export async function releaseUsageSlot(params: {
  subjectType: "invite" | "session";
  subjectId: string;
  kind: "chat" | "image";
}): Promise<void> {
  await pool.query(
    `update usage_counters
     set count = greatest(count - 1, 0)
     where subject_type = $1 and subject_id = $2 and kind = $3 and counter_date = current_date`,
    [params.subjectType, params.subjectId, params.kind]
  );
}

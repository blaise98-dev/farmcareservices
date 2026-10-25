"""
Time ranges for history charts and lists: hours > 0 means the last N hours,
0 (or less) means all time, since the first reading.

Devices post every 10 s (about 8,600 readings a day), so a long range is
averaged into at most MAX_POINTS time buckets instead of sending every row.
"""
import math

from database import fetchall, fetchone

MAX_POINTS = 400
MAX_HOURS = 24 * 366 * 20          # anything longer is "all time" in practice


def period_hours(hours: int) -> int:
    """0 for all time, otherwise the hours clamped to a sane range."""
    return 0 if hours <= 0 else min(hours, MAX_HOURS)


def period_days(days: int) -> int:
    """0 for all time, otherwise the days clamped to a sane range."""
    return 0 if days <= 0 else min(days, MAX_HOURS // 24)


async def bucketed_series(table: str, time_col: str, avg_cols: list, max_cols: list,
                          where: str, args: tuple, hours: int) -> list:
    """Readings of `table` over the period, oldest first.

    Up to MAX_POINTS rows come back as recorded; beyond that each bucket gives
    the average of `avg_cols` and the maximum of `max_cols` (on/off states, so
    a pump that ran at any time in the bucket shows as on). `where`/`args` hold
    the caller's farm, device or cow condition; column names are fixed strings.
    """
    hours = period_hours(hours)
    cond, cargs = (f"{time_col} >= NOW() - INTERVAL %s HOUR", (hours,)) if hours else ("1=1", ())
    span = await fetchone(
        f"SELECT COUNT(*) AS n, UNIX_TIMESTAMP(MIN({time_col})) AS first_ts, UNIX_TIMESTAMP(MAX({time_col})) AS last_ts "
        f"FROM {table} WHERE {where} AND {cond}",
        (*args, *cargs),
    )
    if not span or not span["n"]:
        return []
    cols = list(avg_cols) + list(max_cols)
    if span["n"] <= MAX_POINTS:
        return await fetchall(
            f"SELECT {time_col} AS recorded_at, {', '.join(cols)} FROM {table} "
            f"WHERE {where} AND {cond} ORDER BY {time_col} ASC",
            (*args, *cargs),
        )
    # Buckets are aligned to the clock, so the range can straddle one more
    # bucket than it spans: size them for MAX_POINTS - 1 to stay within MAX_POINTS.
    bucket = max(1, math.ceil((float(span["last_ts"]) - float(span["first_ts"]) + 1) / (MAX_POINTS - 1)))
    picks = [f"AVG({c}) AS {c}" for c in avg_cols] + [f"MAX({c}) AS {c}" for c in max_cols]
    return await fetchall(
        f"""
        SELECT FROM_UNIXTIME(FLOOR(UNIX_TIMESTAMP({time_col}) / %s) * %s) AS recorded_at, {', '.join(picks)}
        FROM {table}
        WHERE {where} AND {cond}
        GROUP BY 1
        ORDER BY 1
        """,
        (bucket, bucket, *args, *cargs),
    )

# VNG Headcount Dashboard — Build & Refresh Spec

This pack turns the TSE Datahub headcount view into a live, in-app dashboard. The agent reads this
file, runs the SQL below through the **TSE Datahub MCP** (`execute_query`), injects the results into
`template.html`'s `window.DASH_DATA` block, writes the file to the workspace, and the Preview panel
renders it. "Refresh" = re-run the SQL and rewrite only the `DASH_DATA` block. "Restyle / retitle /
redefine a metric" = edit the theme tokens / text / a metric's SQL below, then re-render.

- **Data source:** `hr_data_headcount_dev.hrdev.v_hr_headcount` (the `hrdev` schema is the queryable
  one; `hruser` / `hrmgr` are permission-denied for this connection).
- **Grain:** one row per employee per monthly `snapshot_date`. `end_date IS NULL` ⇒ active. Leaver rows
  carry `end_date`, `leaving_type`, and `leaving_reason_group_1..3`.
- **Chart engines (hybrid):** Chart.js for Demographic + Attrition tabs; ECharts for the Cohort & Flows
  tab (heatmap, retention curves, bubble, sankey) and the Attrition waterfall.
- **Data anomaly:** the `2025-05-30` snapshot double-counts (≈8,572 vs ~4,300 norm) — exclude it from
  trend/series unless investigating.

## Parameters

| Param | Meaning | Default |
| --- | --- | --- |
| `:snap` | snapshot date for point-in-time views | latest `MAX(snapshot_date)` |
| `:year` | attrition / cohort year | current year |
| `:ee` | `type_of_employee` filter, or `ALL` | `ALL` |
| `:view` | `bu` or `job_family` for the breakdown axis | `bu` |

Apply `:ee` as `AND (:ee = 'ALL' OR type_of_employee = :ee)` on any point-in-time query.

## Metric definitions (editable — change here, then re-render)

- **Gross Headcount** — `COUNT(*)` at `:snap` (all employee types).
- **Official Staff** — `COUNT(*) WHERE type_of_employee = 'official'`.
- **MoM** — gross at `:snap` minus gross at the previous snapshot.
- **Leavers (YTD)** — `COUNT(*) WHERE end_date IS NOT NULL AND year(end_date) = :year`.
- **Voluntary / Involuntary** — `leaving_type IN ('VS','VSP')` / `('IS','ISP')`.
- **Annualized attrition %** — `leavers_YTD / months_elapsed * 12 / avg_headcount`.
- **Cohort retention @k** — of employees whose `join_date` is in a cohort quarter, the share with
  `end_date IS NULL OR date_diff('month', join_date, end_date) >= k`.
- **Avg tenure (yrs)** — `AVG(date_diff('day', join_date, :snap) / 365.0)` over active rows.

## FACTS — demographic cross-tab (drives the client-side slicers)

The Demographic tab (KPIs, HC-by-BU, HC-by-Job-Family, age/gender pyramid, employee-type mix, HC
trend) is **not** a set of per-cut slots. It is computed in the browser from `window.FACTS`, so the
Year/Month/EE-Type/View-by slicers filter instantly with no re-query. Regenerate `FACTS` by running the
four queries below across **all** snapshots and employee types, then shaping into:

```
FACTS = { snaps: ["YYYY-MM-DD", …],            // ascending, excludes the 2025-05-30 anomaly
          market: { "<snap>": [vietnam, oversea] },
          data:   { "<snap>": { "<ee_type>": { bu:{K:n}, fam:{K:n}, pyr:{ "<band>":[male,female] } } } } }
```

Client rules: `ALL` employee-type = sum across ee; Gross HC / Official / Gender all derive from `data`
so they reconcile (BU nulls are bucketed as `(Other)` so totals equal true headcount); Vietnam/Oversea
comes from `market`; the trend plots the selected ee across `snaps`.

```sql
-- bu  (nulls bucketed so the total reconciles with headcount)
SELECT CAST(snapshot_date AS varchar) snap, type_of_employee ee, COALESCE(bu,'(Other)') k, COUNT(*) n
FROM hr_data_headcount_dev.hrdev.v_hr_headcount WHERE snapshot_date <> DATE '2025-05-30' GROUP BY 1,2,3;
-- fam
SELECT CAST(snapshot_date AS varchar) snap, type_of_employee ee, job_family k, COUNT(*) n
FROM hr_data_headcount_dev.hrdev.v_hr_headcount
WHERE job_family IS NOT NULL AND snapshot_date <> DATE '2025-05-30' GROUP BY 1,2,3;
-- pyr  (age band uses the snapshot year; band → [male, female])
SELECT CAST(snapshot_date AS varchar) snap, type_of_employee ee,
  CASE WHEN year(snapshot_date)-year_of_birth < 25 THEN '<25'
       WHEN year(snapshot_date)-year_of_birth < 30 THEN '25-29'
       WHEN year(snapshot_date)-year_of_birth < 35 THEN '30-34'
       WHEN year(snapshot_date)-year_of_birth < 40 THEN '35-39'
       WHEN year(snapshot_date)-year_of_birth < 45 THEN '40-44' ELSE '45+' END band,
  gender, COUNT(*) n
FROM hr_data_headcount_dev.hrdev.v_hr_headcount
WHERE year_of_birth IS NOT NULL AND gender IS NOT NULL AND snapshot_date <> DATE '2025-05-30' GROUP BY 1,2,3,4;
-- market  (per snapshot, ee=ALL)
SELECT CAST(snapshot_date AS varchar) snap,
  SUM(CASE WHEN market='Viet Nam' THEN 1 ELSE 0 END) vn, SUM(CASE WHEN market='Oversea' THEN 1 ELSE 0 END) os
FROM hr_data_headcount_dev.hrdev.v_hr_headcount WHERE snapshot_date <> DATE '2025-05-30' GROUP BY 1;
```

## SQL per DASH_DATA slot (attrition + cohort — keyed by year)

These slots live under `DASH_DATA.years["<year>"]` and switch with the **Year** slicer (run each query
per year; `attrKpis.partial` = true for the still-running year so the KPI reads "YTD" vs "FY"). Month,
EE Type, and View-by do not apply here.


`SLOT:attrKpis`
```sql
SELECT COUNT(*) leavers,
  SUM(CASE WHEN leaving_type IN ('VS','VSP') THEN 1 ELSE 0 END) voluntary,
  SUM(CASE WHEN leaving_type IN ('IS','ISP') THEN 1 ELSE 0 END) involuntary
FROM hr_data_headcount_dev.hrdev.v_hr_headcount
WHERE end_date IS NOT NULL AND year(end_date) = :year;
```

`SLOT:reasonGroups`
```sql
SELECT leaving_reason_group_1 k, COUNT(*) v FROM hr_data_headcount_dev.hrdev.v_hr_headcount
WHERE end_date IS NOT NULL AND year(end_date) = :year AND leaving_reason_group_1 IS NOT NULL
GROUP BY leaving_reason_group_1 ORDER BY v DESC;
```

`SLOT:attrByBu` (leavers + current headcount denominator)
```sql
SELECT l.bu, l.leavers, h.hc FROM
  (SELECT bu, COUNT(*) leavers FROM hr_data_headcount_dev.hrdev.v_hr_headcount
   WHERE end_date IS NOT NULL AND year(end_date)=:year AND bu IS NOT NULL GROUP BY bu) l
JOIN
  (SELECT bu, COUNT(*) hc FROM hr_data_headcount_dev.hrdev.v_hr_headcount
   WHERE snapshot_date = DATE :snap AND bu IS NOT NULL GROUP BY bu) h ON l.bu = h.bu
ORDER BY l.leavers DESC;
```

`SLOT:monthlyFlow`
```sql
SELECT m month,
  (SELECT COUNT(*) FROM hr_data_headcount_dev.hrdev.v_hr_headcount WHERE year(join_date)=:year AND month(join_date)=m) joiners,
  (SELECT COUNT(*) FROM hr_data_headcount_dev.hrdev.v_hr_headcount WHERE year(end_date)=:year AND month(end_date)=m) leavers
FROM UNNEST(SEQUENCE(1, month(current_date))) AS t(m) ORDER BY m;
```

`SLOT:waterfall` — derived, reconciling bridge:
`Opening` = gross at last snapshot of `:year-1`; `Voluntary`/`Involuntary` = negated from `attrKpis`;
`Net Joiners` = `Closing − Opening + leavers` (balances hires, conversions, transfers);
`Closing` = gross at `:snap`.

`SLOT:cohort`
```sql
WITH j AS (
  SELECT DISTINCT id, join_date, end_date FROM hr_data_headcount_dev.hrdev.v_hr_headcount
  WHERE join_date >= DATE '2024-01-01' AND join_date < DATE :year || '-01-01')
SELECT date_format(date_trunc('quarter', join_date), '%Y') || '-Q' ||
       CAST(quarter(join_date) AS varchar) cohort,
  COUNT(*) size,
  ROUND(100.0*AVG(CASE WHEN end_date IS NULL OR date_diff('month',join_date,end_date)>=3  THEN 1 ELSE 0 END)) ret3,
  ROUND(100.0*AVG(CASE WHEN end_date IS NULL OR date_diff('month',join_date,end_date)>=6  THEN 1 ELSE 0 END)) ret6,
  ROUND(100.0*AVG(CASE WHEN end_date IS NULL OR date_diff('month',join_date,end_date)>=12 THEN 1 ELSE 0 END)) ret12
FROM j GROUP BY date_trunc('quarter', join_date), quarter(join_date) ORDER BY 1;
```

`SLOT:bubble`
```sql
SELECT h.bu, ROUND(100.0*l.leavers/h.hc,1) attrition_pct,
  ROUND(t.tenure,1) tenure_yrs, h.hc
FROM (SELECT bu, COUNT(*) hc,
        AVG(date_diff('day',join_date,DATE :snap)/365.0) tenure
      FROM hr_data_headcount_dev.hrdev.v_hr_headcount
      WHERE snapshot_date = DATE :snap AND bu IS NOT NULL GROUP BY bu) h
JOIN (SELECT bu, COUNT(*) leavers FROM hr_data_headcount_dev.hrdev.v_hr_headcount
      WHERE end_date IS NOT NULL AND year(end_date)=:year AND bu IS NOT NULL GROUP BY bu) l ON h.bu=l.bu
JOIN (SELECT bu, AVG(date_diff('day',join_date,DATE :snap)/365.0) tenure
      FROM hr_data_headcount_dev.hrdev.v_hr_headcount
      WHERE snapshot_date = DATE :snap AND bu IS NOT NULL GROUP BY bu) t ON h.bu=t.bu
ORDER BY h.hc DESC;
```

`SLOT:sankey`
```sql
SELECT bu, leaving_reason_group_1 reason, COUNT(*) leavers
FROM hr_data_headcount_dev.hrdev.v_hr_headcount
WHERE end_date IS NOT NULL AND year(end_date)=:year
  AND bu IS NOT NULL AND leaving_reason_group_1 IS NOT NULL
GROUP BY bu, leaving_reason_group_1 HAVING COUNT(*) >= 3 ORDER BY leavers DESC;
```

## Theme tokens (edit in `template.html` `:root`)

`--vng #F26F21` (brand/orange, voluntary) · `--zalo #2F7FF0` (blue, involuntary) · `--green #16A34A`
(positive) · `--purple #7C6CF0`. Light is default; `[data-theme=dark]` overrides. To retheme, change
these tokens only — every chart reads them at render time.

## Agent build loop

1. Resolve params from the chat + filter bar (`:snap`, `:year`, `:ee`, `:view`).
2. Run each SQL above via TSE Datahub MCP; shape rows to the `DASH_DATA` key format shown in
   `template.html` (arrays-of-arrays, order preserved).
3. Replace **only** the `window.DASH_DATA = {…}` block; leave render logic and CSS untouched.
4. Write the `.html` to the workspace → Preview renders live.
5. On "refresh" repeat 1–4. On "change metric X / restyle / retitle", edit the relevant definition or
   token first, then repeat.

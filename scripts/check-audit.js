#!/usr/bin/env node
/**
 * Dependency audit gate.
 *
 * Runs `bun audit --json`, extracts every critical/high advisory ID, and diffs
 * them against the accepted-risk baseline in `.security/audit-baseline.json`.
 *
 * Exit codes:
 *   0  - no new critical/high advisories (all present ones are in the baseline)
 *   1  - one or more critical/high advisories are NOT in the baseline (new finding),
 *        OR the audit looks degraded/empty and cannot be trusted (fail-closed)
 *   2  - the audit could not be run or parsed
 *
 * Fail-closed sanity floor: a non-empty baseline expects its known advisory IDs
 * to still be reported. If the audit returns zero advisories total, or every
 * baselined ID has simultaneously disappeared, the audit is treated as degraded
 * (it must not silently mask vulnerabilities) and the gate fails.
 *
 * Non-fatal warnings are printed for:
 *   - baseline entries whose `review_by` date has passed
 *   - SOME (but not all) baseline entries no longer present in the audit (prune hint)
 *
 * Usage: node scripts/check-audit.js
 */

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const BASELINE_PATH = path.resolve(__dirname, '../.security/audit-baseline.json');
const GATED_SEVERITIES = new Set(['critical', 'high']);

function fail(message) {
  console.error(`❌ ${message}`);
  process.exit(2);
}

const AUDIT_ATTEMPTS = 3;

/**
 * Run `bun audit --json` once and return its raw stdout, or '' if nothing was
 * captured. `bun audit` exits non-zero when advisories exist, so stdout must be
 * read from the thrown error too.
 */
function runAuditOnce() {
  try {
    return execFileSync('bun', ['audit', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
  } catch (err) {
    return err.stdout ? err.stdout.toString() : '';
  }
}

/** Run `bun audit --json` (with retries) and return the parsed advisory map. */
function runAudit() {
  let raw = '';
  // `bun audit` is network-dependent; retry a couple of times so a transient
  // blip does not turn the gate flaky.
  for (let attempt = 1; attempt <= AUDIT_ATTEMPTS; attempt++) {
    raw = runAuditOnce();
    if (raw.indexOf('{') !== -1) break;
    if (attempt < AUDIT_ATTEMPTS) {
      console.warn(`⚠️  "bun audit --json" produced no JSON (attempt ${attempt}/${AUDIT_ATTEMPTS}); retrying…`);
    }
  }
  // bun prints a human-readable header line before the JSON payload.
  const start = raw.indexOf('{');
  if (start === -1) {
    fail(`Could not obtain JSON from "bun audit --json" after ${AUDIT_ATTEMPTS} attempts (network issue?).`);
  }
  try {
    return JSON.parse(raw.slice(start));
  } catch (err) {
    fail(`Failed to parse "bun audit --json" output: ${err.message}`);
  }
}

/** Total number of advisories across all severities in the audit map. */
function countAllAdvisories(auditMap) {
  let total = 0;
  for (const advisories of Object.values(auditMap)) {
    if (Array.isArray(advisories)) total += advisories.length;
  }
  return total;
}

/** Flatten the audit map into an array of critical/high advisories. */
function extractGated(auditMap) {
  const rows = [];
  for (const [pkg, advisories] of Object.entries(auditMap)) {
    if (!Array.isArray(advisories)) continue;
    for (const advisory of advisories) {
      if (GATED_SEVERITIES.has(advisory.severity)) {
        rows.push({
          id: advisory.id,
          package: pkg,
          severity: advisory.severity,
          title: advisory.title || '',
          vulnerable: advisory.vulnerable_versions || '',
        });
      }
    }
  }
  return rows;
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE_PATH)) {
    fail(`Baseline file not found at ${BASELINE_PATH}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8'));
  } catch (err) {
    fail(`Failed to parse baseline ${BASELINE_PATH}: ${err.message}`);
  }
  const advisories = Array.isArray(parsed.advisories) ? parsed.advisories : [];
  const byId = new Map();
  for (const entry of advisories) {
    if (entry && entry.id != null) byId.set(entry.id, entry);
  }
  return byId;
}

function main() {
  const baseline = loadBaseline();
  const auditMap = runAudit();
  const totalAdvisories = countAllAdvisories(auditMap);
  const gated = extractGated(auditMap);
  const seenIds = new Set();

  const newFindings = [];
  for (const advisory of gated) {
    seenIds.add(advisory.id);
    if (!baseline.has(advisory.id)) {
      newFindings.push(advisory);
    }
  }

  // Which baselined IDs are still reported vs. gone this run.
  const missingBaselineIds = [];
  for (const [id] of baseline) {
    if (!seenIds.has(id)) missingBaselineIds.push(id);
  }

  // Fail-closed sanity floor: a well-formed but empty/degraded audit must not
  // silently pass. If the baseline is non-empty but the audit reports zero
  // advisories at all, or every single baselined ID vanished at once, the audit
  // is untrustworthy this run — fail rather than mask potential vulnerabilities.
  if (baseline.size > 0 && (totalAdvisories === 0 || missingBaselineIds.length === baseline.size)) {
    const reason =
      totalAdvisories === 0
        ? 'the audit reported zero advisories of any severity'
        : `all ${baseline.size} baselined advisories disappeared from the audit at once`;
    console.error(`\n❌ Audit looks degraded: ${reason}.`);
    console.error('   A trustworthy audit should still report the known accepted-risk advisories.');
    console.error('   This is treated as a failure (fail-closed) so a broken audit cannot mask vulnerabilities.');
    console.error('   If the disappearance is genuine (all advisories truly fixed/removed), clear the resolved');
    console.error(`   entries from ${path.relative(process.cwd(), BASELINE_PATH)} and re-run.`);
    process.exit(1);
  }

  // Warn about baseline entries that are past their review date.
  const now = new Date();
  for (const [id, entry] of baseline) {
    if (!entry.review_by) continue;
    const reviewBy = new Date(entry.review_by);
    if (!Number.isNaN(reviewBy.getTime()) && reviewBy < now) {
      console.warn(
        `⚠️  Baseline advisory ${id} (${entry.package}) is past its review_by date ${entry.review_by} — re-review the accepted risk.`
      );
    }
  }

  // Note baseline entries no longer present in the audit (partial disappearance
  // only; a total disappearance is handled by the fail-closed floor above).
  for (const id of missingBaselineIds) {
    const entry = baseline.get(id);
    console.log(
      `ℹ️  Baseline advisory ${id} (${entry.package}) is no longer reported by the audit — it may be removed from the baseline.`
    );
  }

  if (newFindings.length > 0) {
    console.error(
      `\n❌ ${newFindings.length} new critical/high advisor${newFindings.length === 1 ? 'y is' : 'ies are'} not in the accepted-risk baseline:`
    );
    for (const advisory of newFindings) {
      console.error(`   - [${advisory.severity}] ${advisory.package} (id ${advisory.id}): ${advisory.title}`);
      if (advisory.vulnerable) console.error(`       vulnerable: ${advisory.vulnerable}`);
    }
    console.error(
      `\nFix the advisory, or (if it is an accepted risk) add it to ${path.relative(process.cwd(), BASELINE_PATH)}.`
    );
    process.exit(1);
  }

  console.log(
    `\n✅ Audit gate passed: ${gated.length} critical/high advisor${gated.length === 1 ? 'y' : 'ies'} present, all in the accepted-risk baseline.`
  );
  process.exit(0);
}

main();

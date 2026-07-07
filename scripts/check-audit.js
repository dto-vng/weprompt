#!/usr/bin/env node
/**
 * Dependency audit gate.
 *
 * Runs `bun audit --json`, extracts every critical/high advisory ID, and diffs
 * them against the accepted-risk baseline in `.security/audit-baseline.json`.
 *
 * Exit codes:
 *   0  - no new critical/high advisories (all present ones are in the baseline)
 *   1  - one or more critical/high advisories are NOT in the baseline (new finding)
 *   2  - the audit could not be run or parsed
 *
 * Non-fatal warnings are printed for:
 *   - baseline entries whose `review_by` date has passed
 *   - baseline entries that are no longer present in the audit (stale IDs)
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
  const gated = extractGated(runAudit());
  const seenIds = new Set();

  const newFindings = [];
  for (const advisory of gated) {
    seenIds.add(advisory.id);
    if (!baseline.has(advisory.id)) {
      newFindings.push(advisory);
    }
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

  // Note baseline entries no longer present in the audit (candidates for removal).
  for (const [id, entry] of baseline) {
    if (!seenIds.has(id)) {
      console.log(
        `ℹ️  Baseline advisory ${id} (${entry.package}) is no longer reported by the audit — it may be removed from the baseline.`
      );
    }
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

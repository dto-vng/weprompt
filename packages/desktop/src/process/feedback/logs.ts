/**
 * @license
 * Copyright 2025 AionUi (aionui.com)
 * SPDX-License-Identifier: Apache-2.0
 */

import * as fs from 'node:fs';
import { stat } from 'node:fs/promises';
import * as path from 'node:path';

const LOG_SUFFIXES = ['.log', '.aioncore.log', '.aionrs.log'];
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}/;
const YEAR_DIR_PATTERN = /^\d{4}$/;
const MONTH_OR_DAY_DIR_PATTERN = /^\d{2}$/;
const DEFAULT_LOG_DAYS = 3;
const MAX_LOG_FILES = 12;

export type FeedbackLogAttachment = {
  filename: string;
  data: Buffer;
  contentType: 'application/json';
};

type FeedbackLogCandidate = {
  date: string;
  path: string;
};

function isFeedbackLogFileForDate(file: string, date: string): boolean {
  return LOG_SUFFIXES.some((suffix) => file === `${date}${suffix}`);
}

function normalizeLogDirs(logsDirs: string | string[]): string[] {
  const dirs = Array.isArray(logsDirs) ? logsDirs : [logsDirs];
  const seen = new Set<string>();
  const normalizedDirs: string[] = [];
  for (const dir of dirs) {
    const normalizedDir = path.resolve(dir);
    if (!seen.has(normalizedDir)) {
      seen.add(normalizedDir);
      normalizedDirs.push(normalizedDir);
    }
  }

  return normalizedDirs;
}

export function getRecentFeedbackLogPathsFromDirs(logsDirs: string[], days = DEFAULT_LOG_DAYS): string[] {
  const pathsByDate = new Map<string, Set<string>>();

  for (const logsDir of normalizeLogDirs(logsDirs)) {
    for (const candidate of collectFeedbackLogCandidates(logsDir)) {
      let paths = pathsByDate.get(candidate.date);
      if (!paths) {
        paths = new Set<string>();
        pathsByDate.set(candidate.date, paths);
      }
      paths.add(candidate.path);
    }
  }

  const recentDates = [...pathsByDate.keys()].toSorted().toReversed().slice(0, days);
  return recentDates.flatMap((dateStr) => [...(pathsByDate.get(dateStr) ?? [])].toSorted());
}

function collectFeedbackLogCandidates(logsDir: string): FeedbackLogCandidate[] {
  const candidates: FeedbackLogCandidate[] = [];
  let yearsOrFiles: string[];
  try {
    yearsOrFiles = fs.readdirSync(logsDir);
  } catch {
    return candidates;
  }

  for (const name of yearsOrFiles) {
    const fullPath = path.join(logsDir, name);
    try {
      const stat = fs.statSync(fullPath);
      if (stat.isFile()) {
        const match = DATE_PATTERN.exec(name);
        if (match && isFeedbackLogFileForDate(name, match[0])) {
          candidates.push({ date: match[0], path: fullPath });
        }
        continue;
      }

      if (stat.isDirectory() && YEAR_DIR_PATTERN.test(name)) {
        collectDatedLogCandidates(candidates, fullPath, name);
      }
    } catch {
      // skip unreadable entries
    }
  }

  return candidates;
}

function collectDatedLogCandidates(candidates: FeedbackLogCandidate[], yearDir: string, year: string): void {
  for (const month of readDirNames(yearDir)) {
    if (!MONTH_OR_DAY_DIR_PATTERN.test(month)) {
      continue;
    }

    const monthDir = path.join(yearDir, month);
    if (!isDirectory(monthDir)) {
      continue;
    }

    for (const day of readDirNames(monthDir)) {
      if (!MONTH_OR_DAY_DIR_PATTERN.test(day)) {
        continue;
      }

      const dayDir = path.join(monthDir, day);
      if (!isDirectory(dayDir)) {
        continue;
      }

      const date = `${year}-${month}-${day}`;
      for (const file of readDirNames(dayDir)) {
        const filePath = path.join(dayDir, file);
        if (isFile(filePath) && isFeedbackLogFileForDate(file, date)) {
          candidates.push({ date, path: filePath });
        }
      }
    }
  }
}

function readDirNames(dir: string): string[] {
  try {
    return fs.readdirSync(dir);
  } catch {
    return [];
  }
}

function isDirectory(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isDirectory();
  } catch {
    return false;
  }
}

function isFile(filePath: string): boolean {
  try {
    return fs.statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function getLogHeaderName(logPath: string, rootDir: string, showRelativePath: boolean): string {
  if (!showRelativePath) {
    return path.basename(logPath);
  }

  const relativePath = path.relative(rootDir, logPath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath)) {
    return path.basename(logPath);
  }

  return relativePath.split(path.sep).join('/');
}

export function getRecentFeedbackLogPaths(logsDir: string, days = DEFAULT_LOG_DAYS): string[] {
  const normalizedDir = normalizeLogDirs(logsDir)[0];
  return getRecentFeedbackLogPathsFromDirs([normalizedDir], days);
}

function sanitizeLogMetadataName(logPath: string, rootDir: string): string {
  return getLogHeaderName(logPath, rootDir, true)
    .replace(/[^A-Za-z0-9._/-]/g, '_')
    .slice(0, 200);
}

export async function collectFeedbackLogAttachment(logsDirs: string | string[]): Promise<FeedbackLogAttachment | null> {
  const normalizedDirs = normalizeLogDirs(logsDirs);
  const logPaths =
    normalizedDirs.length === 1
      ? getRecentFeedbackLogPaths(normalizedDirs[0])
      : getRecentFeedbackLogPathsFromDirs(normalizedDirs);
  if (logPaths.length === 0) {
    return null;
  }

  const files: Array<{ date: string; name: string; size_bytes: number }> = [];
  for (const logPath of logPaths.slice(0, MAX_LOG_FILES)) {
    try {
      const fileStat = await stat(logPath);
      const date = DATE_PATTERN.exec(path.basename(logPath))?.[0];
      if (!date || !fileStat.isFile()) continue;
      files.push({
        date,
        name: sanitizeLogMetadataName(logPath, normalizedDirs[0]),
        size_bytes: Math.max(0, Number(fileStat.size)),
      });
    } catch {
      // Skip files that become unreadable between discovery and collection.
    }
  }
  if (files.length === 0) return null;

  return {
    filename: 'logs-metadata.json',
    data: Buffer.from(JSON.stringify({ files, schema_version: 'weprompt-log-metadata/v1' }), 'utf8'),
    contentType: 'application/json',
  };
}

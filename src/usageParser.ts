import { UsageEntry } from './types';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

function walkDir(dir: string): string[] {
  const results: string[] = [];
  let entries: fs.Dirent[];
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return results;
  }
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...walkDir(fullPath));
    } else if (entry.isFile() && entry.name.endsWith('.jsonl')) {
      results.push(fullPath);
    }
  }
  return results;
}

export function parseUsageData(): UsageEntry[] {
  const baseDir = path.join(os.homedir(), '.claude', 'projects');

  if (!fs.existsSync(baseDir)) {
    return [];
  }

  const files = walkDir(baseDir);
  const entries: UsageEntry[] = [];

  for (const file of files) {
    let content: string;
    try {
      content = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const lines = content.split('\n');
    for (const line of lines) {
      if (!line.trim()) {
        continue;
      }

      let entry: any;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }

      if (entry.type !== 'assistant' || !entry.message?.usage) {
        continue;
      }

      entries.push({
        timestamp: entry.timestamp,
        sessionId: entry.sessionId,
        cwd: entry.cwd,
        model: entry.message.model ?? 'unknown',
        inputTokens: entry.message.usage.input_tokens ?? 0,
        outputTokens: entry.message.usage.output_tokens ?? 0,
        cacheCreationTokens: entry.message.usage.cache_creation_input_tokens ?? 0,
        cacheReadTokens: entry.message.usage.cache_read_input_tokens ?? 0,
      });
    }
  }

  return entries;
}

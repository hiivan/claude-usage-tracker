export interface UsageEntry {
  timestamp: string;             // ISO string from entry.timestamp
  sessionId: string;             // entry.sessionId (UUID)
  cwd: string;                   // entry.cwd (full path, e.g. "/Users/ivan/my-project")
  model: string;                 // entry.message.model
  inputTokens: number;           // entry.message.usage.input_tokens
  outputTokens: number;          // entry.message.usage.output_tokens
  cacheCreationTokens: number;   // entry.message.usage.cache_creation_input_tokens ?? 0
  cacheReadTokens: number;       // entry.message.usage.cache_read_input_tokens ?? 0
}

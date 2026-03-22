// Subscribable logger — create a Logger instance at the top of any file that needs logging.
// Subscribers receive every log entry emitted across all logger instances.
// Two built-in subscribers are provided: one that writes to the browser console (auto-attached)
// and one that feeds the DebugScreen text box (attached by the DebugScreen component).

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  source: string;
  message: string;
  /** Optional structured payload — may contain ArrayBuffers, objects, etc. */
  data?: unknown;
}

type LogSubscriber = (entry: LogEntry) => void;

// ---------------------------------------------------------------------------
// Global log bus — all Logger instances share this set of subscribers.
// ---------------------------------------------------------------------------
const subscribers = new Set<LogSubscriber>();

function emit(entry: LogEntry): void {
  for (const sub of subscribers) {
    try {
      sub(entry);
    } catch {
      // Prevent a misbehaving subscriber from silencing other subscribers.
    }
  }
}

/**
 * Subscribe to all log entries emitted by any Logger instance.
 * Returns an unsubscribe function.
 */
export function subscribeToLogs(subscriber: LogSubscriber): () => void {
  subscribers.add(subscriber);
  return () => subscribers.delete(subscriber);
}

// ---------------------------------------------------------------------------
// Logger class — create one per module/file.
// ---------------------------------------------------------------------------
export class Logger {
  constructor(private readonly source: string) {}

  info(message: string, data?: unknown): void {
    emit({ timestamp: new Date(), level: 'info', source: this.source, message, data });
  }

  warn(message: string, data?: unknown): void {
    emit({ timestamp: new Date(), level: 'warn', source: this.source, message, data });
  }

  error(message: string, data?: unknown): void {
    emit({ timestamp: new Date(), level: 'error', source: this.source, message, data });
  }
}

// ---------------------------------------------------------------------------
// Console subscriber — auto-attached so logs appear in browser DevTools.
// ---------------------------------------------------------------------------
subscribeToLogs((entry) => {
  const prefix = `[${entry.source}]`;
  if (entry.level === 'error') {
    console.error(prefix, entry.message, entry.data ?? '');
  } else if (entry.level === 'warn') {
    console.warn(prefix, entry.message, entry.data ?? '');
  } else {
    console.log(prefix, entry.message, entry.data ?? '');
  }
});

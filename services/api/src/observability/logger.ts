export type ObservabilityEnvironment = "local" | "test";
export type ObservabilityLogLevel = "debug" | "info" | "warn" | "error";
export type StructuredLogValue = string | number | boolean | null | StructuredLogFields | StructuredLogValue[];

export interface StructuredLogFields {
  [key: string]: StructuredLogValue;
}

export interface StructuredLogEntry {
  timestamp: string;
  runtime: "api";
  environment: ObservabilityEnvironment;
  level: ObservabilityLogLevel;
  event: string;
  data: StructuredLogFields;
}

export interface StructuredLogger {
  log(level: ObservabilityLogLevel, event: string, data?: Record<string, unknown>): StructuredLogEntry;
  debug(event: string, data?: Record<string, unknown>): StructuredLogEntry;
  info(event: string, data?: Record<string, unknown>): StructuredLogEntry;
  warn(event: string, data?: Record<string, unknown>): StructuredLogEntry;
  error(event: string, data?: Record<string, unknown>): StructuredLogEntry;
}

export interface CreateLoggerOptions {
  environment?: ObservabilityEnvironment;
  now?: () => Date;
  write?: (line: string, entry: StructuredLogEntry) => void;
}

const REDACTED_VALUE = "[REDACTED]";
const CIRCULAR_VALUE = "[Circular]";
const TRUNCATED_VALUE = "[Truncated]";
const SECRET_FIELD_PATTERN = /authorization|cookie|password|passwd|secret|token|api[-_]?key|session/i;
const MAX_DEPTH = 6;

export function createLogger(options: CreateLoggerOptions = {}): StructuredLogger {
  const environment = options.environment ?? "local";
  const now = options.now ?? (() => new Date());
  const write = options.write ?? defaultWrite;

  const log = (level: ObservabilityLogLevel, event: string, data?: Record<string, unknown>): StructuredLogEntry => {
    const entry: StructuredLogEntry = {
      timestamp: now().toISOString(),
      runtime: "api",
      environment,
      level,
      event,
      data: sanitizeFields(data ?? {}, 0, new WeakSet<object>()),
    };

    write(JSON.stringify(entry), entry);
    return entry;
  };

  return {
    log,
    debug: (event, data) => log("debug", event, data),
    info: (event, data) => log("info", event, data),
    warn: (event, data) => log("warn", event, data),
    error: (event, data) => log("error", event, data),
  };
}

function sanitizeFields(value: Record<string, unknown>, depth: number, seen: WeakSet<object>): StructuredLogFields {
  if (depth >= MAX_DEPTH) {
    return { truncated: TRUNCATED_VALUE };
  }

  const sanitized: StructuredLogFields = {};

  for (const [key, entry] of Object.entries(value)) {
    if (typeof entry === "undefined") {
      continue;
    }

    if (SECRET_FIELD_PATTERN.test(key)) {
      sanitized[key] = REDACTED_VALUE;
      continue;
    }

    sanitized[key] = sanitizeValue(entry, depth + 1, seen);
  }

  return sanitized;
}

function sanitizeValue(value: unknown, depth: number, seen: WeakSet<object>): StructuredLogValue {
  if (depth >= MAX_DEPTH) {
    return TRUNCATED_VALUE;
  }

  if (value === null) {
    return null;
  }

  switch (typeof value) {
    case "string":
    case "number":
    case "boolean":
      return value;
    case "bigint":
      return value.toString();
    case "undefined":
      return null;
    case "symbol":
    case "function":
      return String(value);
    case "object":
      if (value instanceof Date) {
        return value.toISOString();
      }
      if (Array.isArray(value)) {
        return value.map((entry) => sanitizeValue(entry, depth + 1, seen));
      }
      if (!isPlainObject(value)) {
        return String(value);
      }
      if (seen.has(value)) {
        return CIRCULAR_VALUE;
      }
      seen.add(value);
      const sanitized = sanitizeFields(value, depth + 1, seen);
      seen.delete(value);
      return sanitized;
  }
}

function isPlainObject(value: object): value is Record<string, unknown> {
  return Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null;
}

function defaultWrite(line: string, entry: StructuredLogEntry): void {
  const writer = entry.level === "error"
    ? console.error
    : entry.level === "warn"
      ? console.warn
      : entry.level === "debug"
        ? console.debug
        : console.info;

  writer(line);
}

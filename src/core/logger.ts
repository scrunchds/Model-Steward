export type LogLevel = "debug" | "info" | "warn" | "error";

export interface LogContext {
  readonly [key: string]: unknown;
}

export interface Logger {
  debug(message: string, context?: LogContext): void;
  info(message: string, context?: LogContext): void;
  warn(message: string, context?: LogContext): void;
  error(message: string, context?: LogContext): void;
  child(context: LogContext): Logger;
}

interface LogRecord {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly scope: string;
  readonly message: string;
  readonly context?: LogContext;
}

export function createLogger(
  scope: string,
  baseContext: LogContext = {},
): Logger {
  const normalizedScope = scope.trim() || "model-steward";
  const normalizedBaseContext = { ...baseContext };
  return {
    debug(message, context) {
      writeLog(
        normalizedScope,
        "debug",
        message,
        normalizedBaseContext,
        context,
      );
    },
    info(message, context) {
      writeLog(
        normalizedScope,
        "info",
        message,
        normalizedBaseContext,
        context,
      );
    },
    warn(message, context) {
      writeLog(
        normalizedScope,
        "warn",
        message,
        normalizedBaseContext,
        context,
      );
    },
    error(message, context) {
      writeLog(
        normalizedScope,
        "error",
        message,
        normalizedBaseContext,
        context,
      );
    },
    child(context) {
      return createLogger(normalizedScope, {
        ...normalizedBaseContext,
        ...context,
      });
    },
  };
}

export function describeError(error: unknown): string {
  if (error instanceof Error) return error.message;
  return typeof error === "string" ? error : String(error);
}

export function errorContext(error: unknown): LogContext {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }
  return { value: error };
}

function writeLog(
  scope: string,
  level: LogLevel,
  message: string,
  baseContext: LogContext,
  context?: LogContext,
): void {
  const mergedContext = mergeContext(baseContext, context);
  const record: LogRecord = {
    timestamp: new Date().toISOString(),
    level,
    scope,
    message,
    ...(mergedContext === undefined ? {} : { context: mergedContext }),
  };
  process.stderr.write(`${safeStringify(record)}\n`);
}

function mergeContext(
  left: LogContext,
  right: LogContext | undefined,
): LogContext | undefined {
  const merged = right === undefined ? { ...left } : { ...left, ...right };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value, replacer);
  } catch {
    return JSON.stringify({
      timestamp: new Date().toISOString(),
      level: "error",
      scope: "logger",
      message: "Failed to serialise structured log record.",
    });
  }
}

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      stack: value.stack,
    };
  }
  if (typeof value === "bigint") return value.toString();
  return value;
}

## 13. Observability System

<!-- =============================================================================
WHY: Structured Logging Infrastructure (DECISIONS.md D028-D029 deferred)
================================================================================

1. OPERATIONAL VISIBILITY
   - JSONL format for machine-readable logs
   - Session-ID correlation for tracing workflows
   - Performance metrics for optimization
   - Error tracking for debugging

2. CONFIGURABLE OVERHEAD
   - Minimal overhead (1-5%) for production use
   - Levels: minimal (ERROR only), standard (INFO+), verbose (DEBUG)
   - Rotation to prevent disk bloat
   - Optional user opt-out via config

3. DEBUGGING SUPPORT
   - Detailed traces in verbose mode
   - Tool execution timing
   - Background task lifecycle events
   - Quality gate decisions with rationale

============================================================================= -->

### 13.1 Logger Interface

```typescript
// src/features/observability/logger.ts
export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR" | "AUDIT";

export interface LogEntry {
  timestamp: string;         // ISO 8601
  level: LogLevel;          // Log level
  sessionId?: string;       // Correlation ID
  agent?: string;           // Agent name if applicable
  tool?: string;            // Tool name if applicable
  phase?: string;           // Workflow phase if applicable
  message: string;          // Main log message
  data?: Record<string, unknown>; // Structured data
  duration?: number;        // Timing in ms
  error?: {               // Error details if applicable
    name: string;
    message: string;
    stack?: string;
  };
}

export interface LoggerConfig {
  level: LogLevel;         // Minimum level to log
  file?: string;          // Log file path (default: .opencode/logs.jsonl)
  maxSize?: number;        // Max file size in bytes (default: 10MB)
  maxFiles?: number;       // Max rotated files (default: 5)
  enableConsole?: boolean;  // Also log to console (default: false)
}
```

### 13.2 Structured Logger Implementation

```typescript
// src/features/observability/structured-logger.ts
import { writeFileSync, appendFileSync, existsSync, mkdirSync, statSync } from "fs";
import { join } from "path";

export class StructuredLogger {
  private config: LoggerConfig;
  private currentSize = 0;

  constructor(config: LoggerConfig) {
    this.config = config;
    this.ensureLogDirectory();
    this.initializeFileSize();
  }

  private ensureLogDirectory(): void {
    const logDir = dirname(this.config.file ?? ".opencode/logs.jsonl");
    if (!existsSync(logDir)) {
      mkdirSync(logDir, { recursive: true });
    }
  }

  private initializeFileSize(): void {
    const logFile = this.config.file ?? ".opencode/logs.jsonl";
    if (existsSync(logFile)) {
      const stats = statSync(logFile);
      this.currentSize = stats.size;
    }
  }

  debug(message: string, data?: LogEntry["data"], context?: Partial<LogEntry>): void {
    this.log("DEBUG", message, data, context);
  }

  info(message: string, data?: LogEntry["data"], context?: Partial<LogEntry>): void {
    this.log("INFO", message, data, context);
  }

  warn(message: string, data?: LogEntry["data"], context?: Partial<LogEntry>): void {
    this.log("WARN", message, data, context);
  }

  error(message: string, error?: Error, data?: LogEntry["data"], context?: Partial<LogEntry>): void {
    this.log("ERROR", message, data, context, error);
  }

  audit(message: string, data?: LogEntry["data"], context?: Partial<LogEntry>): void {
    this.log("AUDIT", message, data, context);
  }

  private log(
    level: LogLevel,
    message: string,
    data?: LogEntry["data"],
    context?: Partial<LogEntry>,
    error?: Error
  ): void {
    // Skip if below configured level
    if (!this.shouldLog(level)) return;

    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message,
      data,
      error: error ? {
        name: error.name,
        message: error.message,
        stack: error.stack,
      } : undefined,
      ...context,
    };

    // Write to file
    this.writeToFile(entry);

    // Optional console output
    if (this.config.enableConsole) {
      this.writeToConsole(entry);
    }
  }

  private shouldLog(level: LogLevel): boolean {
    const levels = ["DEBUG", "INFO", "WARN", "ERROR", "AUDIT"];
    const configLevel = levels.indexOf(this.config.level);
    const entryLevel = levels.indexOf(level);
    return entryLevel >= configLevel;
  }

  private writeToFile(entry: LogEntry): void {
    const jsonLine = JSON.stringify(entry) + "\n";
    
    // Check rotation
    this.checkAndRotate();
    
    const logFile = this.config.file ?? ".opencode/logs.jsonl";
    appendFileSync(logFile, jsonLine, "utf-8");
    this.currentSize += Buffer.byteLength(jsonLine, "utf-8");
  }

  private writeToConsole(entry: LogEntry): void {
    const timestamp = entry.timestamp.substring(11, 19); // HH:MM:SS
    const prefix = `[${timestamp}] ${entry.level}`;
    
    if (entry.sessionId) {
      console.log(`${prefix} [${entry.sessionId}] ${entry.message}`, entry.data);
    } else {
      console.log(`${prefix} ${entry.message}`, entry.data);
    }
  }

  private checkAndRotate(): void {
    const maxSize = this.config.maxSize ?? 10 * 1024 * 1024; // 10MB
    const maxFiles = this.config.maxFiles ?? 5;
    
    if (this.currentSize < maxSize) return;
    
    const logFile = this.config.file ?? ".opencode/logs.jsonl";
    const logDir = dirname(logFile);
    const basename = logFile.replace(/\.jsonl$/, "");
    
    // Rotate files
    for (let i = maxFiles - 1; i > 0; i--) {
      const oldFile = `${basename}.${i}.jsonl`;
      const newFile = `${basename}.${i + 1}.jsonl`;
      if (existsSync(oldFile)) {
        renameSync(oldFile, newFile);
      }
    }
    
    // Move current to .1
    if (existsSync(logFile)) {
      renameSync(logFile, `${basename}.1.jsonl`);
    }
    
    // Reset size counter
    this.currentSize = 0;
  }

  updateConfig(newConfig: Partial<LoggerConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.initializeFileSize();
  }
}

// src/features/observability/index.ts
import { DEFAULT_CONFIG } from "../../config/schema";

// Create singleton logger instance with defaults
export const logger = new StructuredLogger(DEFAULT_CONFIG.observability || {
  enabled: false,
  level: "INFO",
  file: ".opencode/logs.jsonl",
  enableConsole: false
});

export const tracer = new PerformanceTracer();

export function configureObservability(config: LoggerConfig) {
  logger.updateConfig(config);
}

export * from "./logger";
export * from "./structured-logger";
export * from "./tracer";
export * from "./hooks";
```

### 13.3 Performance Tracing

```typescript
// src/features/observability/tracer.ts
export class PerformanceTracer {
  private spans = new Map<string, { start: number; data?: Record<string, unknown> }>();

  startSpan(
    name: string,
    data?: Record<string, unknown>,
    context?: { sessionId?: string; agent?: string }
  ): string {
    const spanId = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.spans.set(spanId, {
      start: Date.now(),
      data,
    });

    // Log start
    logger.debug(`Span started: ${name}`, {
      ...context,
      spanId,
      spanName: name,
      type: "span_start",
    });

    return spanId;
  }

  endSpan(
    spanId: string,
    result?: unknown,
    error?: Error,
    context?: { sessionId?: string; agent?: string }
  ): void {
    const span = this.spans.get(spanId);
    if (!span) return;

    const duration = Date.now() - span.start;
    this.spans.delete(spanId);

    // Log end
    logger.debug(`Span ended: ${duration}ms`, {
      ...context,
      spanId,
      duration,
      result,
      error: error ? {
        name: error.name,
        message: error.message,
      } : undefined,
      type: "span_end",
    });
  }

  // Convenience method for wrapping functions
  async traceAsync<T>(
    name: string,
    fn: () => Promise<T>,
    context?: { sessionId?: string; agent?: string }
  ): Promise<T> {
    const spanId = this.startSpan(name, undefined, context);
    try {
      const result = await fn();
      this.endSpan(spanId, result, undefined, context);
      return result;
    } catch (error) {
      this.endSpan(spanId, undefined, error as Error, context);
      throw error;
    }
  }
}
```

### 13.4 Integration Points

```typescript
// src/features/observability/hooks.ts
import type { ToolContext } from "../../types";

// Tool execution tracing hook
export function createToolTraceHook() {
  return {
    "tool.execute.before": async (
      input: { tool: string; sessionID: string; callID: string },
      output: { args: Record<string, unknown> }
    ) => {
      const spanId = tracer.startSpan(`tool:${input.tool}`, {
        args: sanitizeArgs(output.args),
      }, { sessionId: input.sessionID });

      // Store span ID in context for after hook
      (output as { __spanId?: string }).__spanId = spanId;
    },

    "tool.execute.after": async (
      input: { tool: string; callID: string },
      output: { output: string; args?: Record<string, unknown> }
    ) => {
      const spanId = (input as { __spanId?: string }).__spanId;
      if (spanId) {
        this.endSpan(spanId, {
          success: !output.output.includes("Error:"),
          outputLength: output.output.length,
        });
      }
    },
  };
}

// Quality gate decision logging
export function logQualityGateDecision(
  gateType: string,
  result: { passed: boolean; reason?: string },
  context: { sessionId: string; phase: string }
): void {
  logger.audit(`Quality gate decision: ${gateType}`, {
    gateType,
    passed: result.passed,
    reason: result.reason,
    ...context,
  });
}

// Background task lifecycle logging
export function logBackgroundTask(
  event: "launched" | "completed" | "error",
  task: BackgroundTask,
  additional?: Record<string, unknown>
): void {
  const data = {
    taskId: task.id,
    sessionId: task.sessionID,
    agent: task.agent,
    status: task.status,
    ...additional,
  };

  switch (event) {
    case "launched":
      logger.info(`Background task launched`, data);
      break;
    case "completed":
      logger.info(`Background task completed`, {
        ...data,
        duration: task.completedAt!.getTime() - task.startedAt.getTime(),
      });
      break;
    case "error":
      logger.error(`Background task failed`, undefined, data, new Error(task.error!));
      break;
  }
}
```

### 13.5 Configuration Integration

```typescript
// In magnus-opus.schema.json (add to root schema)
{
  "observability": {
    "type": "object",
    "description": "Observability and logging configuration",
    "properties": {
      "enabled": {
        "type": "boolean",
        "description": "Enable structured logging",
        "default": false
      },
      "level": {
        "type": "string",
        "enum": ["DEBUG", "INFO", "WARN", "ERROR"],
        "description": "Minimum log level",
        "default": "INFO"
      },
      "file": {
        "type": "string",
        "description": "Log file path",
        "default": ".opencode/logs.jsonl"
      },
      "maxSize": {
        "type": "number",
        "description": "Maximum file size before rotation (bytes)",
        "default": 10485760
      },
      "enableConsole": {
        "type": "boolean",
        "description": "Also output to console",
        "default": false
      }
    }
  }
}
```

### 13.6 Usage Examples

```typescript
// In tool implementations
import { logger, tracer } from "../features/observability";

export const myTool = tool({
  description: "Example tool with observability",
  args: { /* ... */ },
  
  async execute(args, ctx) {
    return await tracer.traceAsync("myTool", async () => {
      logger.info("Executing myTool", { args }, {
        sessionId: ctx.sessionID,
        tool: "myTool",
      });
      
      try {
        // Tool implementation
        const result = await doWork(args);
        
        logger.info("Tool completed successfully", { result }, {
          sessionId: ctx.sessionID,
          tool: "myTool",
        });
        
        return result;
      } catch (error) {
        logger.error("Tool failed", error as Error, { args }, {
          sessionId: ctx.sessionID,
          tool: "myTool",
        });
        throw error;
      }
    });
  },
});
```

This observability system provides:
- **Structured JSONL logs** for machine processing
- **Session correlation** for workflow tracing
- **Performance metrics** for optimization
- **Configurable overhead** (1-5% in production)
- **Error tracking** with full context
- **Rotation** to prevent disk bloat
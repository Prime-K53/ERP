import { platform } from './platform';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface LogEntry {
  timestamp: Date;
  level: LogLevel;
  message: string;
  context?: Record<string, any>;
  error?: Error;
}

class Logger {
  private logs: LogEntry[] = [];
  private maxLogs = 1000;
  private notifyCallback: ((msg: string, type: 'error' | 'warning' | 'info' | 'success') => void) | null = null;

  setNotifyCallback(cb: (msg: string, type: 'error' | 'warning' | 'info' | 'success') => void) {
    this.notifyCallback = cb;
  }

  showUserNotification(message: string, level: LogLevel) {
    if (this.notifyCallback) {
      const type = level === 'error' ? 'error' : level === 'warn' ? 'warning' : 'info';
      this.notifyCallback(message, type);
    }
  }

  log(level: LogLevel, message: string, context?: Record<string, any>, error?: Error) {
    const entry: LogEntry = {
      timestamp: new Date(),
      level,
      message,
      context,
      error
    };
    
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) {
      this.logs.shift();
    }
    
    if (import.meta.env.DEV) {
      const logMethod = level === 'error' ? 'error' : level === 'warn' ? 'warn' : 'log';
      console[logMethod](`[${level.toUpperCase()}] ${message}`, context || '', error || '');
    }
    
    if (platform.isDesktop) {
      platform.api.log({
        timestamp: entry.timestamp.toISOString(),
        level: level.toUpperCase(),
        message,
        context,
        error: error ? {
          name: error.name,
          message: error.message,
          stack: error.stack
        } : undefined
      });
    } else if (level === 'error' && import.meta.env.PROD) {
      this.sendToServer(entry);
    }
  }

  debug(message: string, context?: Record<string, any>) {
    this.log('debug', message, context);
  }

  info(message: string, context?: Record<string, any>) {
    this.log('info', message, context);
  }

  warn(message: string, context?: Record<string, any>) {
    this.log('warn', message, context);
  }

  error(...args: any[]) {
    const message = typeof args[0] === 'string' ? args[0] : args[0]?.message || 'An error occurred';
    const err = args.find((a: any) => a instanceof Error) || undefined;
    const context = typeof args[args.length - 1] === 'object' && !(args[args.length - 1] instanceof Error) ? args[args.length - 1] : undefined;
    this.log('error', message, context, err);
    this.showUserNotification(message, 'error');
  }

  getLogs(level?: LogLevel): LogEntry[] {
    if (level) {
      return this.logs.filter(l => l.level === level);
    }
    return [...this.logs];
  }

  clearLogs() {
    this.logs = [];
  }

  private async sendToServer(_entry: LogEntry) {
  }
}

export const logger = new Logger();

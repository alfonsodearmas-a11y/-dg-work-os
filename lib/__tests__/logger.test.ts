import { describe, it, expect, beforeEach } from 'vitest';
import pino from 'pino';

let testLogger: pino.Logger;
let output: string[];

function createTestLogger(level = 'trace') {
  output = [];
  const stream = {
    write(msg: string) {
      output.push(msg);
    },
  };
  return pino({ level }, stream as unknown as pino.DestinationStream);
}

function lastLog(): Record<string, unknown> {
  return JSON.parse(output[output.length - 1]);
}

describe('logger', () => {
  beforeEach(() => {
    testLogger = createTestLogger();
  });

  describe('log levels', () => {
    it('error outputs level 50', () => {
      testLogger.error('broke');
      expect(lastLog().level).toBe(50);
      expect(lastLog().msg).toBe('broke');
    });

    it('warn outputs level 40', () => {
      testLogger.warn('caution');
      expect(lastLog().level).toBe(40);
    });

    it('info outputs level 30', () => {
      testLogger.info('status');
      expect(lastLog().level).toBe(30);
    });

    it('debug outputs level 20', () => {
      testLogger.debug('detail');
      expect(lastLog().level).toBe(20);
    });

    it('fatal outputs level 60', () => {
      testLogger.fatal('down');
      expect(lastLog().level).toBe(60);
    });
  });

  describe('error', () => {
    it('handles string message', () => {
      testLogger.error('db failed');
      expect(lastLog().msg).toBe('db failed');
    });

    it('handles Error object via err key', () => {
      testLogger.error({ err: new Error('timeout') }, 'request failed');
      const entry = lastLog();
      expect(entry.msg).toBe('request failed');
      expect(entry.err).toBeDefined();
      expect((entry.err as Record<string, unknown>).message).toBe('timeout');
    });

    it('includes additional context', () => {
      testLogger.error({ userId: 'u-1', action: 'fetch' }, 'op failed');
      expect(lastLog().userId).toBe('u-1');
      expect(lastLog().action).toBe('fetch');
    });
  });

  describe('warn', () => {
    it('handles string message', () => {
      testLogger.warn('disk low');
      expect(lastLog().msg).toBe('disk low');
    });

    it('includes structured context', () => {
      testLogger.warn({ diskPercent: 92 }, 'warning');
      expect(lastLog().diskPercent).toBe(92);
    });
  });

  describe('info', () => {
    it('handles string message', () => {
      testLogger.info('started');
      expect(lastLog().msg).toBe('started');
    });

    it('includes structured data', () => {
      testLogger.info({ port: 3000 }, 'listening');
      expect(lastLog().port).toBe(3000);
    });

    it('includes nested objects', () => {
      testLogger.info({ user: { id: 'u-1', role: 'dg' } }, 'authed');
      expect(lastLog().user).toEqual({ id: 'u-1', role: 'dg' });
    });
  });

  describe('level filtering', () => {
    it('suppresses debug when level is info', () => {
      const infoLogger = createTestLogger('info');
      infoLogger.debug('hidden');
      expect(output).toHaveLength(0);
    });

    it('suppresses info when level is warn', () => {
      const warnLogger = createTestLogger('warn');
      warnLogger.info('hidden');
      expect(output).toHaveLength(0);
    });

    it('allows error when level is warn', () => {
      const warnLogger = createTestLogger('warn');
      warnLogger.error('visible');
      expect(output).toHaveLength(1);
    });
  });

  describe('exported logger', () => {
    it('is a pino instance with info level', async () => {
      const mod = await import('@/lib/logger');
      expect(mod.logger).toBeDefined();
      expect(typeof mod.logger.info).toBe('function');
      expect(typeof mod.logger.warn).toBe('function');
      expect(typeof mod.logger.error).toBe('function');
      expect(mod.logger.level).toBe('info');
    });
  });

  describe('timestamp', () => {
    it('includes time in each entry', () => {
      testLogger.info('with time');
      expect(lastLog().time).toBeDefined();
      expect(typeof lastLog().time).toBe('number');
    });
  });
});

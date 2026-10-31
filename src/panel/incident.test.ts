import { describe, expect, it } from 'vitest';
import type { DebugEvent } from '../shared/events';
import {
  addToQueue,
  incidentState,
  lifecycleLabel,
  replaceOrPrepend,
} from './incident';

const event = (id: string): DebugEvent => ({
  id,
  type: 'runtime-error',
  timestamp: 1,
  severity: 'high',
  title: 'Test error',
  message: 'Test message',
  fingerprint: id,
  occurrences: 1,
});

describe('panel incident rules', () => {
  it('replaces incoming updates without changing event order', () => {
    const current = [event('new'), event('old')];
    expect(
      replaceOrPrepend(current, { ...current[1], title: 'Updated' }),
    ).toEqual([current[0], { ...current[1], title: 'Updated' }]);
  });

  it('does not add the same event to the diagnosis queue twice', () => {
    expect(
      addToQueue([event('one')], { ...event('one'), title: 'Updated' }),
    ).toEqual([{ ...event('one'), title: 'Updated' }]);
  });

  it('prioritizes a completed diagnosis over its stale queue entry', () => {
    expect(
      incidentState(
        event('one'),
        {
          eventId: 'one',
          status: 'ready',
          result: { kind: 'fallback', raw: 'response' },
        },
        [event('one')],
      ),
    ).toBe('diagnosed');
  });

  it('labels resurrected incidents with their count', () => {
    expect(
      lifecycleLabel({
        ...event('one'),
        incidentStatus: 'resurrected',
        resurrectionCount: 2,
      }),
    ).toBe('Resurrected ×2');
  });
});

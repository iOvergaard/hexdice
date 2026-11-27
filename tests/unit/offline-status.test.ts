import { describe, expect, it } from 'vitest';
import { offlineLabel, offlineStatus, onOfflineStatus, setOfflineStatus, statusOf } from '../../src/offline/status';

const reg = (active: boolean, installing = false, waiting = false) => ({ active: active || null, installing: installing || null, waiting: waiting || null });

describe('statusOf', () => {
  it('is none without a registration, or once a failed install leaves no worker', () => {
    expect(statusOf(undefined)).toBe('none');
    expect(statusOf(reg(false))).toBe('none');
  });

  it('is saving while the first worker installs or waits', () => {
    expect(statusOf(reg(false, true))).toBe('saving');
    expect(statusOf(reg(false, false, true))).toBe('saving');
  });

  it('is ready once a worker is active, even while an update installs', () => {
    expect(statusOf(reg(true))).toBe('ready');
    expect(statusOf(reg(true, true))).toBe('ready');
  });
});

describe('offlineLabel', () => {
  it('says nothing without a worker', () => {
    expect(offlineLabel('none')).toBe('');
    expect(offlineLabel('saving')).toBe('Saving for offline play…');
    expect(offlineLabel('ready')).toBe('Ready to play offline');
  });
});

describe('offline status', () => {
  it('tells listeners about changes only, until they unsubscribe', () => {
    const seen: string[] = [];
    const stop = onOfflineStatus((s) => seen.push(s));
    setOfflineStatus('saving');
    setOfflineStatus('saving');
    setOfflineStatus('ready');
    stop();
    setOfflineStatus('none');
    expect(seen).toEqual(['saving', 'ready']);
    expect(offlineStatus()).toBe('none');
  });
});

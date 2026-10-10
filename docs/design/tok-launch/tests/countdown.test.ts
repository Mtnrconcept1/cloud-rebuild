import assert from 'node:assert/strict';
import {test} from 'node:test';
import {
  TWENTY_DAYS,
  STORAGE_KEY,
  deadlineRemaining,
  frameRemaining,
  getDeadline,
  splitSeconds,
} from '../src/countdown.ts';

const start = Date.UTC(2026, 9, 10, 12);

function memoryStorage(initial: string | null = null) {
  const entries = new Map<string, string>();
  if (initial !== null) entries.set(STORAGE_KEY, initial);
  return {
    getItem: (key: string) => entries.get(key) ?? null,
    setItem: (key: string, value: string) => { entries.set(key, value); },
  };
}

for (const fps of [30, 60]) {
  test(`${fps} fps: starts at 20 days and borrows correctly after one second`, () => {
    assert.deepEqual(splitSeconds(frameRemaining(0, fps)), [20, 0, 0, 0]);
    assert.deepEqual(splitSeconds(frameRemaining(fps - 1, fps)), [20, 0, 0, 0]);
    assert.deepEqual(splitSeconds(frameRemaining(fps, fps)), [19, 23, 59, 59]);
    assert.deepEqual(splitSeconds(frameRemaining(2 * fps, fps)), [19, 23, 59, 58]);
  });

  test(`${fps} fps: minute, hour and day boundaries follow elapsed time`, () => {
    assert.deepEqual(splitSeconds(frameRemaining(60 * fps, fps)), [19, 23, 59, 0]);
    assert.deepEqual(splitSeconds(frameRemaining(3600 * fps, fps)), [19, 23, 0, 0]);
    assert.deepEqual(splitSeconds(frameRemaining(86400 * fps, fps)), [19, 0, 0, 0]);
    assert.deepEqual(splitSeconds(frameRemaining(86401 * fps, fps)), [18, 23, 59, 59]);
  });

  test(`${fps} fps: the last second expires and never becomes negative`, () => {
    assert.equal(frameRemaining(TWENTY_DAYS * fps - 1, fps), 1);
    assert.deepEqual(splitSeconds(frameRemaining(TWENTY_DAYS * fps, fps)), [0, 0, 0, 0]);
    assert.equal(frameRemaining((TWENTY_DAYS + 60) * fps, fps), 0);
  });
}

test('invalid frame rates fail explicitly', () => {
  for (const fps of [0, -30, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => frameRemaining(30, fps), RangeError);
  }
});

test('negative frames do not move the countdown before its start', () => {
  assert.equal(frameRemaining(-30, 30), TWENTY_DAYS);
});

test('splitting rejects unusable values and rounds down partial seconds', () => {
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.deepEqual(splitSeconds(value), [0, 0, 0, 0]);
  }
  assert.deepEqual(splitSeconds(3661.9), [0, 1, 1, 1]);
});

test('first visit creates and persists an exact 20-day deadline', () => {
  const storage = memoryStorage();
  const deadline = getDeadline(storage, start);
  assert.equal(deadline, start + 1_728_000_000);
  assert.equal(storage.getItem(STORAGE_KEY), String(deadline));
  assert.deepEqual(splitSeconds(deadlineRemaining(deadline, start)), [20, 0, 0, 0]);
});

test('real time countdown changes once per elapsed second', () => {
  const deadline = start + TWENTY_DAYS * 1000;
  assert.equal(deadlineRemaining(deadline, start + 999), TWENTY_DAYS);
  assert.deepEqual(splitSeconds(deadlineRemaining(deadline, start + 1000)), [19, 23, 59, 59]);
  assert.deepEqual(splitSeconds(deadlineRemaining(deadline, start + 2000)), [19, 23, 59, 58]);
});

test('refresh and a long suspended interval preserve the original deadline', () => {
  const storage = memoryStorage();
  const deadline = getDeadline(storage, start);
  const refreshedAt = start + (2 * 86400 + 3661) * 1000;
  const refreshedDeadline = getDeadline(storage, refreshedAt);
  assert.equal(refreshedDeadline, deadline);
  assert.deepEqual(splitSeconds(deadlineRemaining(refreshedDeadline, refreshedAt)), [17, 22, 58, 59]);
});

test('expired stored deadline remains expired after refreshing', () => {
  const expired = start - 1000;
  const storage = memoryStorage(String(expired));
  assert.equal(getDeadline(storage, start), expired);
  assert.equal(getDeadline(storage, start + 86400_000), expired);
  assert.equal(storage.getItem(STORAGE_KEY), String(expired));
  assert.equal(deadlineRemaining(expired, start), 0);
});

test('real time deadline reaches zero exactly and remains at zero', () => {
  assert.equal(deadlineRemaining(start, start - 1), 1);
  assert.equal(deadlineRemaining(start, start), 0);
  assert.equal(deadlineRemaining(start, start + 1000), 0);
});

test('missing or invalid saved data is replaced with a usable deadline', () => {
  for (const saved of [null, '', 'garbage', 'NaN', 'Infinity', '0', '-1', '   ']) {
    const storage = memoryStorage(saved);
    const deadline = getDeadline(storage, start);
    assert.equal(deadline, start + TWENTY_DAYS * 1000, `saved: ${String(saved)}`);
    assert.equal(storage.getItem(STORAGE_KEY), String(deadline));
  }
});

test('no storage still returns a working session deadline', () => {
  const deadline = getDeadline(null, start);
  assert.equal(deadline, start + TWENTY_DAYS * 1000);
  assert.equal(deadlineRemaining(deadline, start + 1000), TWENTY_DAYS - 1);
});

test('denied storage reads and writes do not crash the session countdown', () => {
  const denied = {
    getItem: () => { throw new Error('Access denied'); },
    setItem: () => { throw new Error('Access denied'); },
  };
  const deadline = getDeadline(denied, start);
  assert.equal(deadline, start + TWENTY_DAYS * 1000);
  assert.equal(deadlineRemaining(deadline, start + 2000), TWENTY_DAYS - 2);
});

test('quota failure on first save does not crash the session countdown', () => {
  const storage = {
    getItem: () => null,
    setItem: () => { throw new Error('Quota exceeded'); },
  };
  assert.equal(getDeadline(storage, start), start + TWENTY_DAYS * 1000);
});

test('a saved valid deadline is read without attempting another write', () => {
  const deadline = start + 60000;
  const storage = {
    getItem: () => String(deadline),
    setItem: () => { assert.fail('Existing deadlines must not be rewritten'); },
  };
  assert.equal(getDeadline(storage, start), deadline);
  assert.equal(deadlineRemaining(deadline, start), 60);
});

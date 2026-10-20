import { singleFlight } from '../singleFlight';

const deferred = <T,>() => {
  let resolve!: (v: T) => void;
  const promise = new Promise<T>((r) => (resolve = r));
  return { promise, resolve };
};

describe('singleFlight', () => {
  it('runs once when called alone', async () => {
    let runs = 0;
    const run = singleFlight(async () => ++runs);
    expect(await run()).toBe(1);
    expect(await run()).toBe(2);
  });

  it('gives a caller who arrives mid-run a fresh run, not the stale one', async () => {
    // Simulates: a reload starts, then the user saves, then asks for a reload.
    let saved = false;
    const gate = deferred<void>();
    let runs = 0;
    const run = singleFlight(async () => {
      runs += 1;
      const sawSave = saved;
      if (runs === 1) await gate.promise;
      return sawSave;
    });
    const first = run(); // started before the save
    saved = true;
    const second = run(); // asked for after the save
    gate.resolve();
    expect(await first).toBe(false);
    expect(await second).toBe(true);
    expect(runs).toBe(2);
  });

  it('shares one follow-up between several waiting callers', async () => {
    const gate = deferred<void>();
    let runs = 0;
    const run = singleFlight(async () => {
      runs += 1;
      if (runs === 1) await gate.promise;
      return runs;
    });
    run();
    const a = run();
    const b = run();
    gate.resolve();
    expect(await a).toBe(2);
    expect(await b).toBe(2);
    expect(runs).toBe(2);
  });

  it('still runs the follow-up if the first run fails', async () => {
    let runs = 0;
    const run = singleFlight(async () => {
      runs += 1;
      if (runs === 1) throw new Error('boom');
      return 'ok';
    });
    const first = run().catch((e: Error) => e.message);
    const second = run();
    expect(await first).toBe('boom');
    expect(await second).toBe('ok');
  });
});

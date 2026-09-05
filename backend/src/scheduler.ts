export interface Scheduler {
  now(): Date;
  set(delayMs: number, callback: () => void): unknown;
  clear(handle: unknown): void;
}

export const systemScheduler: Scheduler = {
  now: () => new Date(),
  set: (delayMs, callback) => setTimeout(callback, delayMs),
  clear: (handle) => clearTimeout(handle as NodeJS.Timeout)
};

export class FakeScheduler implements Scheduler {
  private time: number;
  private sequence = 0;
  private readonly jobs = new Map<number, { at: number; callback: () => void }>();

  public constructor(now = "2030-01-01T12:00:00.000Z") { this.time = Date.parse(now); }
  public now(): Date { return new Date(this.time); }
  public set(delayMs: number, callback: () => void): number {
    const id = ++this.sequence;
    this.jobs.set(id, { at: this.time + delayMs, callback });
    return id;
  }
  public clear(handle: unknown): void { this.jobs.delete(handle as number); }
  public advance(ms: number): void {
    this.time += ms;
    while (true) {
      const due = [...this.jobs].filter(([, job]) => job.at <= this.time).sort((a, b) => a[1].at - b[1].at)[0];
      if (!due) break;
      this.jobs.delete(due[0]);
      due[1].callback();
    }
  }
  public get pendingCount(): number { return this.jobs.size; }
}

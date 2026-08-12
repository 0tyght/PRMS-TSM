export class ScheduledTask {
  #running = false;
  #timer = null;

  constructor({ name, intervalMs, action, logger = console }) {
    this.name = name;
    this.intervalMs = intervalMs;
    this.action = action;
    this.logger = logger;
  }

  async run() {
    if (this.#running) return null;
    this.#running = true;
    try {
      return await this.action();
    } catch (error) {
      this.logger.error(`[${this.name}] failed`, String(error?.message || error));
      return null;
    } finally {
      this.#running = false;
    }
  }

  start({ runImmediately = true } = {}) {
    if (runImmediately) void this.run();
    this.#timer = setInterval(() => void this.run(), this.intervalMs);
    this.#timer.unref();
    return this;
  }

  stop() {
    if (this.#timer) clearInterval(this.#timer);
    this.#timer = null;
  }
}


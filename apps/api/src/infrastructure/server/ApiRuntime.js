export class ApiRuntime {
  constructor({ app, port, tasks = [], warmups = [], logger = console, shutdownTimeoutMs = 10_000 }) {
    this.app = app;
    this.port = port;
    this.tasks = tasks;
    this.warmups = warmups;
    this.logger = logger;
    this.shutdownTimeoutMs = shutdownTimeoutMs;
    this.server = null;
    this.shutdown = this.shutdown.bind(this);
  }

  start() {
    this.server = this.app.listen(this.port, () => {
      this.logger.log(`Smart Tha Pho API listening on http://localhost:${this.port}`);
    });
    this.tasks.forEach((task) => task.start());
    this.warmups.forEach((warmup) => void warmup());
    process.once("SIGINT", () => this.shutdown("SIGINT"));
    process.once("SIGTERM", () => this.shutdown("SIGTERM"));
    return this;
  }

  shutdown(signal) {
    this.logger.log(`[server] received ${signal}; shutting down`);
    this.tasks.forEach((task) => task.stop());
    if (!this.server) return;
    this.server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), this.shutdownTimeoutMs).unref();
  }
}


export class WasteDashboardQueryService {
  constructor({
    repository,
    now =
      () => new Date(),
    timeZone =
      "Asia/Bangkok",
  }) {
    if (!repository) {
      throw new TypeError(
        "WasteDashboardQueryService requires repository",
      );
    }

    if (
      typeof now !==
      "function"
    ) {
      throw new TypeError(
        "WasteDashboardQueryService requires now function",
      );
    }

    this.repository =
      repository;

    this.now =
      now;

    this.dateFormatter =
      new Intl.DateTimeFormat(
        "en-CA",
        {
          timeZone,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        },
      );
  }

  resolveDate(date) {
    if (date) {
      return date;
    }

    return this.dateFormatter
      .format(
        this.now(),
      );
  }

  async get({
    date = null,
  } = {}) {
    const selectedDate =
      this.resolveDate(date);

    return this.repository.load(
      selectedDate,
    );
  }
}

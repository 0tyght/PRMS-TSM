export class WasteReportQueryService {
  constructor({ repository }) {
    if (!repository) {
      throw new TypeError(
        "WasteReportQueryService requires repository",
      );
    }

    this.repository =
      repository;
  }

  async operations(
    query = {},
  ) {
    return this.repository
      .operations(query);
  }

  async billing(
    query = {},
  ) {
    return this.repository
      .billing(query);
  }
}

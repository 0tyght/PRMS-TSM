export class WastePlanResourceService {
  constructor({
    repository,
    policy,
    routeLifecycleService,
    now =
      () => new Date(),
  }) {
    if (!repository) {
      throw new TypeError(
        "WastePlanResourceService requires repository",
      );
    }

    if (!policy) {
      throw new TypeError(
        "WastePlanResourceService requires policy",
      );
    }

    if (!routeLifecycleService) {
      throw new TypeError(
        "WastePlanResourceService requires routeLifecycleService",
      );
    }

    if (
      typeof now !==
      "function"
    ) {
      throw new TypeError(
        "WastePlanResourceService requires now function",
      );
    }

    this.repository = repository;
    this.policy = policy;
    this.routeLifecycleService = routeLifecycleService;
    this.now = now;
  }

  toDateTime(value) {
    return value ? new Date(value) : null;
  }

  async assertAssignment(
    input,
    { excludePlanId = null } = {},
  ) {
    const startAt = this.toDateTime(input.scheduledStartAt);
    const endAt = this.toDateTime(input.scheduledEndAt);

    this.policy
      .assertNotPast(
        input.scheduledDate,
        startAt,
        this.now(),
      )
      .assertScheduleWindow(
        startAt,
        endAt,
      );

    const [route, vehicle, driver] = await Promise.all([
      this.repository.findRouteContext(input.routeId),
      this.repository.findVehicle(input.vehicleId),
      this.repository.findDriver(input.driverId),
    ]);

    const readiness = route
      ? this.routeLifecycleService.readiness(
          route.routeGeojson,
          route.activeStopCount,
        )
      : null;

    this.policy
      .assertRoute(route, readiness)
      .assertVehicle(vehicle)
      .assertDriver(driver);

    const conflict =
      await this.repository.findAssignmentConflict({
        scheduledDate: input.scheduledDate,
        vehicleId: input.vehicleId,
        driverId: input.driverId,
        startAt,
        endAt,
        excludePlanId,
        statuses: this.policy.resourceOccupyingStatuses,
      });

    this.policy.assertNoConflict(conflict);

    return {
      route,
      vehicle,
      driver,
    };
  }

  async getAvailability(input) {
    const startAt = this.toDateTime(input.scheduledStartAt);
    const endAt = this.toDateTime(input.scheduledEndAt);

    this.policy
      .assertNotPast(
        input.scheduledDate,
        startAt,
        this.now(),
      )
      .assertScheduleWindow(
        startAt,
        endAt,
      );

    const [vehicles, drivers, conflicts] =
      await Promise.all([
        this.repository.listVehicles(),
        this.repository.listDrivers(),
        this.repository.findConflicts({
          scheduledDate: input.scheduledDate,
          startAt,
          endAt,
          excludePlanId: input.excludePlanId || null,
          statuses: this.policy.resourceOccupyingStatuses,
        }),
      ]);

    const vehicleConflicts = new Map();
    const driverConflicts = new Map();

    for (const conflict of conflicts) {
      if (!vehicleConflicts.has(conflict.vehicleId)) {
        vehicleConflicts.set(conflict.vehicleId, conflict);
      }

      if (!driverConflicts.has(conflict.driverId)) {
        driverConflicts.set(conflict.driverId, conflict);
      }
    }

    return {
      vehicles: vehicles.map((vehicle) =>
        this.policy.vehicleAvailability(
          vehicle,
          vehicleConflicts.get(vehicle.id),
        ),
      ),

      drivers: drivers.map((driver) =>
        this.policy.driverAvailability(
          driver,
          driverConflicts.get(driver.id),
        ),
      ),
    };
  }
}

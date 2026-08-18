const DAY_TO_JAVASCRIPT_DAY = Object.freeze({ 7: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 });

function validDate(value) {
  if (!value) {
    return null;
  }

  const date =
    new Date(value);

  return Number.isNaN(
    date.getTime(),
  )
    ? null
    : date;
}

export class WastePlanPolicy {
  officialSchedule(route, scheduledDate) {
    if (!route || !scheduledDate) return null;
    const day = new Date(`${scheduledDate}T12:00:00+07:00`).getDay();
    const schedules = route.routeGeojson?.properties?.officialSchedules || [];
    return schedules.find((item) => DAY_TO_JAVASCRIPT_DAY[item.day] === day) || null;
  }

  timeRange(route, scheduledDate) {
    const schedule = this.officialSchedule(route, scheduledDate);
    if (!schedule?.time?.includes("-")) return { start: "", end: "" };
    const [start, end] = schedule.time.split("-");
    return { start, end };
  }

  readiness(
    plan,
    now = new Date(),
  ) {
    const scheduledEndAt =
      validDate(
        plan?.scheduledEndAt,
      );

    const currentTime =
      validDate(now);

    const hasSchedule =
      Boolean(
        plan?.scheduledDate &&
        plan?.scheduledStartAt &&
        plan?.scheduledEndAt,
      );

    const scheduleIsCurrentOrFuture =
      Boolean(
        hasSchedule &&
        scheduledEndAt &&
        currentTime &&
        scheduledEndAt.getTime() >
          currentTime.getTime(),
      );

    const checks = [
      {
        key: "route",
        label:
          "เส้นทางมีจุดเก็บขยะ",
        ready:
          Number(
            plan?.stopTotal ||
            0,
          ) > 0,
      },
      {
        key: "schedule",
        label:
          "กำหนดวันและเวลาครบ",
        ready:
          hasSchedule,
      },
      {
        key:
          "schedule-window",
        label:
          "ช่วงเวลาปฏิบัติงานยังไม่สิ้นสุด",
        ready:
          scheduleIsCurrentOrFuture,
      },
      {
        key:
          "resources",
        label:
          "กำหนดรถเก็บขยะและพนักงานประจำรถขยะแล้ว",
        ready:
          Boolean(
            plan?.vehicleId &&
            plan?.driverId,
          ),
      },
    ];

    return {
      checks,
      ready:
        checks.every(
          (item) =>
            item.ready,
        ),
      blockers:
        checks
          .filter(
            (item) =>
              !item.ready,
          )
          .map(
            (item) =>
              item.label,
          ),
    };
  }

  publicationLabel(status) {
    return ({ DRAFT: "ร่าง", PUBLISHED: "ประกาศแล้ว", WITHDRAWN: "ถอนประกาศ" })[status] || "ร่าง";
  }
}

export const wastePlanPolicy = new WastePlanPolicy();

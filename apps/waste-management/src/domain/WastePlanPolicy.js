const DAY_TO_JAVASCRIPT_DAY = Object.freeze({ 7: 0, 1: 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6 });

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

  readiness(plan) {
    const checks = [
      { key: "route", label: "เส้นทางมีจุดรับบริการ", ready: Number(plan.stopTotal || 0) > 0 },
      { key: "schedule", label: "กำหนดวันและเวลาครบ", ready: Boolean(plan.scheduledDate && plan.scheduledStartAt && plan.scheduledEndAt) },
      { key: "resources", label: "กำหนดรถและคนขับแล้ว", ready: Boolean(plan.vehicleId && plan.driverId) },
      {
        key: "line",
        label: "มีผู้รับ LINE อย่างน้อย 1 ราย",
        ready:
          plan.lineRecipientCount === undefined
            ? true
            : Number(plan.lineRecipientCount || 0) > 0,
      },
    ];
    return { checks, ready: checks.every((item) => item.ready) };
  }

  publicationLabel(status) {
    return ({ DRAFT: "ร่าง", PUBLISHED: "ประกาศแล้ว", WITHDRAWN: "ถอนประกาศ" })[status] || "ร่าง";
  }
}

export const wastePlanPolicy = new WastePlanPolicy();

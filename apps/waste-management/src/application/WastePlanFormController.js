import { wastePlanPolicy } from "../domain/WastePlanPolicy.js";

export class WastePlanFormController {
  constructor({ policy = wastePlanPolicy } = {}) {
    this.policy = policy;
  }

  defaults(resources, routeId, date) {
    const route = resources.routes.find((item) => item.id === routeId);
    return this.policy.timeRange(route, date);
  }

  schedule(resources, routeId, date) {
    const route = resources.routes.find((item) => item.id === routeId);
    return this.policy.officialSchedule(route, date);
  }
}

export const wastePlanFormController = new WastePlanFormController();

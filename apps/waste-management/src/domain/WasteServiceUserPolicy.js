export class WasteServiceUserPolicy {
  filter(users = [], { routeId = "ALL", search = "" } = {}) {
    const keyword = search.trim().toLocaleLowerCase("th-TH");
    return users.filter((user) => {
      if (routeId === "UNASSIGNED" && user.routeId) return false;
      if (routeId !== "ALL" && routeId !== "UNASSIGNED" && user.routeId !== routeId) return false;
      if (!keyword) return true;
      return [user.serviceNo, user.fullName, user.phone, user.houseNo, user.villageName, user.routeName]
        .some((value) => String(value || "").toLocaleLowerCase("th-TH").includes(keyword));
    });
  }

  summarize(users = []) {
    return Object.freeze({
      total: users.length,
      unassigned: users.filter((user) => user.isActive && !user.routeId).length,
      linkedToLine: users.filter((user) => Boolean(user.lineUserId)).length,
    });
  }
}

export const wasteServiceUserPolicy = new WasteServiceUserPolicy();

export class WasteServiceUserPolicy {
  filter(users = [], { routeId = "ALL", search = "" } = {}) {
    const keyword = search.trim().toLocaleLowerCase("th-TH");
    return users.filter((user) => {
      if (!user.isActive) return false;
      if (routeId === "UNASSIGNED" && user.routeId) return false;
      if (routeId !== "ALL" && routeId !== "UNASSIGNED" && user.routeId !== routeId) return false;
      if (!keyword) return true;
      return [user.serviceNo, user.fullName, user.phone, user.houseNo, user.villageName, user.routeName]
        .some((value) => String(value || "").toLocaleLowerCase("th-TH").includes(keyword));
    });
  }

  summarize(users = []) {
    const activeUsers = users.filter((user) => user.isActive);

    return Object.freeze({
      total: activeUsers.length,
      unassigned: activeUsers.filter((user) => !user.routeId).length,
      linkedToLine: activeUsers.filter((user) => Boolean(user.lineUserId)).length,
    });
  }
}

export const wasteServiceUserPolicy = new WasteServiceUserPolicy();


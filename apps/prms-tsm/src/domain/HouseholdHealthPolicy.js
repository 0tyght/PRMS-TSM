export class HouseholdHealthPolicy {
  petStatus(pet) {
    const vaccinated = Boolean(pet.vaccinated);
    const sterilized = Boolean(pet.sterilized);
    if (vaccinated && sterilized) return "complete";
    if (vaccinated || sterilized) return "partial";
    return "critical";
  }

  householdStatus(pets) {
    const statuses = pets.map((pet) => this.petStatus(pet));
    if (statuses.includes("critical")) return "critical";
    if (statuses.includes("partial")) return "partial";
    return "complete";
  }

  groupHouseholds(pets) {
    const groups = new Map();
    pets.forEach((pet) => {
      const key = this.householdKey(pet);
      const existing = groups.get(key) || {
        key,
        householdId: pet.householdId || null,
        latitude: Number(pet.latitude),
        longitude: Number(pet.longitude),
        villageNo: Number(pet.villageNo),
        houseNo: pet.houseNo || "",
        addressDetail: pet.addressDetail || "",
        ownerNames: new Set(),
        pets: [],
        mismatchCount: 0,
      };
      existing.pets.push(pet);
      if (pet.ownerName) existing.ownerNames.add(pet.ownerName);
      if (pet.coordinateStatus === "mismatch") existing.mismatchCount += 1;
      groups.set(key, existing);
    });

    return [...groups.values()].map((item) => ({
      ...item,
      ownerNames: [...item.ownerNames],
      healthStatus: this.householdStatus(item.pets),
    }));
  }

  summarizeByVillage(pets = []) {
    const villages = new Map();
    pets.forEach((pet) => {
      const villageNo = Number(pet.villageNo || 0);
      if (!villageNo) return;
      const current = villages.get(villageNo) || { villageNo, critical: 0, partial: 0, complete: 0, total: 0 };
      current[this.petStatus(pet)] += 1;
      current.total += 1;
      villages.set(villageNo, current);
    });
    return [...villages.values()].sort((a, b) => {
      const riskA = a.total ? ((a.critical * 2) + a.partial) / (a.total * 2) : 0;
      const riskB = b.total ? ((b.critical * 2) + b.partial) / (b.total * 2) : 0;
      return riskB - riskA || b.critical - a.critical || b.total - a.total;
    });
  }

  summarizeByVillage(pets = []) {
    const villages = new Map();
    pets.forEach((pet) => {
      const villageNo = Number(pet.villageNo || 0);
      if (!villageNo) return;
      const current = villages.get(villageNo) || { villageNo, critical: 0, partial: 0, complete: 0, total: 0 };
      current[this.petStatus(pet)] += 1;
      current.total += 1;
      villages.set(villageNo, current);
    });
    return [...villages.values()].sort((a, b) => {
      const riskA = a.total ? ((a.critical * 2) + a.partial) / (a.total * 2) : 0;
      const riskB = b.total ? ((b.critical * 2) + b.partial) / (b.total * 2) : 0;
      return riskB - riskA || b.critical - a.critical || b.total - a.total;
    });
  }

  householdKey(pet) {
    if (pet.householdId) return `household:${pet.householdId}`;
    return ["coordinate", Number(pet.latitude).toFixed(7), Number(pet.longitude).toFixed(7), pet.houseNo || "", pet.ownerName || ""].join("|");
  }
}

export const householdHealthPolicy = new HouseholdHealthPolicy();

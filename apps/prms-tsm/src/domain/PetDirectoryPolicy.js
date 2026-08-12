export class PetDirectoryPolicy {
  summarize(pets = []) {
    const summary = pets.reduce((result, pet) => {
      result.total += 1;
      if (pet.species === "DOG") result.dogs += 1;
      if (pet.species === "CAT") result.cats += 1;
      if (pet.lastVaccinatedAt) result.vaccinated += 1;
      if (Boolean(Number(pet.sterilized))) result.sterilized += 1;
      return result;
    }, { total: 0, dogs: 0, cats: 0, vaccinated: 0, sterilized: 0 });
    return Object.freeze(summary);
  }
}

export const petDirectoryPolicy = new PetDirectoryPolicy();

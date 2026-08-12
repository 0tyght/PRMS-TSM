export class MunicipalSystemCatalog {
  constructor(systems) {
    this.systems = Object.freeze(systems.map((system) => Object.freeze({ ...system })));
  }

  findById(systemId) {
    return this.systems.find((system) => system.id === systemId) || null;
  }

  list() {
    return this.systems;
  }
}


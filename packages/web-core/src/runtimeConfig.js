import { RuntimeConfigRepository } from "./infrastructure/RuntimeConfigRepository.js";

export { RuntimeConfigRepository };

export const runtimeConfigRepository = new RuntimeConfigRepository();

export async function getApiBase(force = false) {
  return runtimeConfigRepository.getApiBase(force);
}

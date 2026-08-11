import { MUNICIPAL_SYSTEMS, PLATFORM } from "@smart-thapho/shared";

const WORKSPACES = Object.freeze({
  pet: Object.freeze({
    accent: "green",
    mark: "สล",
    route: "dashboard",
    integrationLabel: "เชื่อมต่อ API ทะเบียนสัตว์เลี้ยงแล้ว",
    groups: ["ข้อมูลขึ้นทะเบียน", "ทะเบียนสัตว์เลี้ยง", "บริการสาธารณสุข", "แผนที่ภาพรวม"],
  }),
  waste: Object.freeze({
    accent: "orange",
    mark: "ขย",
    integrationLabel: "รอเชื่อมฐานข้อมูลระบบรถเก็บขยะ",
    groups: ["แผนการเก็บขยะ", "รถและพนักงาน", "เส้นทางปฏิบัติงาน", "แจ้งเตือนผ่าน LINE"],
  }),
  disaster: Object.freeze({
    accent: "red",
    mark: "ภย",
    integrationLabel: "รอเชื่อมฐานข้อมูลระบบบรรเทาสาธารณภัย",
    groups: ["รับแจ้งเหตุ", "สถานการณ์", "กำลังและทรัพยากร", "แจ้งเตือนประชาชน"],
  }),
  water: Object.freeze({
    accent: "blue",
    mark: "ปร",
    integrationLabel: "รอเชื่อมฐานข้อมูลระบบการประปา",
    groups: ["ผู้ใช้น้ำ", "มิเตอร์และการใช้น้ำ", "ค่าบริการ", "แจ้งเหตุประปา"],
  }),
});

export const SMART_THA_PHO = PLATFORM;

export const PLATFORM_SYSTEMS = Object.freeze(
  MUNICIPAL_SYSTEMS.map((system) => Object.freeze({ ...system, ...WORKSPACES[system.id] })),
);

export function getPlatformSystem(systemId) {
  return PLATFORM_SYSTEMS.find((system) => system.id === systemId) || null;
}

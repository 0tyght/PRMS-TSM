export const ADMIN_MENU = [
  { id:"dashboard", icon:"▦", label:"ภาพรวม" },
  { id:"registrations", icon:"⌁", label:"คำขอขึ้นทะเบียน" },
  { id:"pets", icon:"●", label:"ข้อมูลสัตว์" },
  { id:"services", icon:"+", label:"วัคซีนและทำหมัน" },
  { id:"map", icon:"⌖", label:"แผนที่" },
  { id:"cases", icon:"!", label:"แจ้งเหตุ" },
  { id:"reports", icon:"▤", label:"รายงาน" },
  { id:"settings", icon:"⚙", label:"ตั้งค่าระบบ" },
];

export const DEFAULT_PAGE = "dashboard";
export const isAdminPage = page => ADMIN_MENU.some(item => item.id === page);

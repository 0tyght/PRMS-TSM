export const ADMIN_MENU = [
  { id: "dashboard", icon: "▦", label: "ภาพรวมและแผนที่" },
  { id: "registrations", icon: "⌁", label: "คำขอขึ้นทะเบียน" },
  { id: "owners", icon: "◉", label: "ข้อมูลเจ้าของ" },
  { id: "pets", icon: "●", label: "ข้อมูลสัตว์" },
  { id: "services", icon: "+", label: "วัคซีนและทำหมัน" },
  { id: "cases", icon: "!", label: "แจ้งเหตุ" },
  { id: "reports", icon: "▤", label: "รายงาน" },
  { id: "audit", icon: "≣", label: "Audit Log" },
  { id: "settings", icon: "⚙", label: "ตั้งค่าระบบ" },
];

export const DEFAULT_PAGE = "dashboard";
export const isAdminPage = (page) => ADMIN_MENU.some((item) => item.id === page);

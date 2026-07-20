export const ADMIN_MENU = [
  { id: "dashboard", icon: "▦", label: "ภาพรวม" },
  { id: "registrations", icon: "⌁", label: "ข้อมูลจาก LINE" },
  { id: "owners", icon: "◉", label: "เจ้าของสัตว์เลี้ยง" },
  { id: "pets", icon: "●", label: "ทะเบียนสัตว์เลี้ยง" },
  { id: "services", icon: "+", label: "วัคซีนและทำหมัน" },
  { id: "map", icon: "⌖", label: "แผนที่" },
  { id: "settings", icon: "⚙", label: "ตั้งค่าระบบ" },
];

export const DEFAULT_PAGE = "dashboard";
export const isAdminPage = (page) => ADMIN_MENU.some((item) => item.id === page);

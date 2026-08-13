import { pool } from "../../core/db.js";

const SYSTEMS = Object.freeze([
  { key: "pet", label: "ทะเบียนสัตว์เลี้ยง", displayText: "เปิดระบบทะเบียนสัตว์เลี้ยง" },
  { key: "waste", label: "รถเก็บขยะ", displayText: "เปิดระบบรถเก็บขยะ" },
  { key: "disaster", label: "บรรเทาสาธารณภัย", displayText: "เปิดระบบบรรเทาสาธารณภัย" },
  { key: "waterworks", label: "การประปา", displayText: "เปิดระบบการประปา" },
]);

export class SmartThaPhoLineMenu {
  normalizeText(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
  }

  parse(event) {
    if (event?.type === "follow") return { action: "menu" };

    if (event?.type === "postback") {
      const params = new URLSearchParams(String(event.postback?.data || ""));
      if (params.get("smart") === "menu") return { action: "menu" };
      const system = params.get("smart");
      if (SYSTEMS.some((item) => item.key === system)) return { action: "system", system };
    }

    if (event?.type === "message" && event.message?.type === "text") {
      const text = this.normalizeText(event.message.text);
      if (["เมนู", "เมนูหลัก", "หน้าหลัก", "smart tha pho", "สมาร์ตท่าโพธ์"].includes(text)) {
        return { action: "menu" };
      }
    }

    return null;
  }

  action(system) {
    const item = SYSTEMS.find((candidate) => candidate.key === system);
    if (!item) return null;
    return {
      type: "postback",
      label: item.label,
      data: `smart=${item.key}`,
      displayText: item.displayText,
    };
  }

  homeAction() {
    return {
      type: "postback",
      label: "Smart Tha Pho",
      data: "smart=menu",
      displayText: "กลับเมนูหลัก Smart Tha Pho",
    };
  }

  quickReplyActions() {
    return SYSTEMS.map((item) => this.action(item.key));
  }

  message(prefix = "ยินดีต้อนรับสู่ Smart Tha Pho") {
    return {
      type: "text",
      text: `${prefix}\nเลือกบริการที่ต้องการใช้งาน`,
      quickReply: {
        items: this.quickReplyActions().map((action) => ({ type: "action", action })),
      },
    };
  }

  unavailableMessage(system) {
    const item = SYSTEMS.find((candidate) => candidate.key === system);
    return {
      type: "text",
      text: `ระบบ${item?.label || "ที่เลือก"}ยังไม่เปิดให้บริการผ่าน LINE ในขณะนี้\nกรุณาเลือกบริการอื่น`,
      quickReply: {
        items: this.quickReplyActions().map((action) => ({ type: "action", action })),
      },
    };
  }

  async clearPendingFlows(lineUserId) {
    if (!lineUserId) return;
    await Promise.all([
      pool.execute("DELETE FROM line_conversation_sessions WHERE line_user_id = ?", [lineUserId]),
      pool.execute("DELETE FROM waste_line_sessions WHERE line_user_id = ?", [lineUserId]),
    ]);
  }
}

export const smartThaPhoLineMenu = new SmartThaPhoLineMenu();

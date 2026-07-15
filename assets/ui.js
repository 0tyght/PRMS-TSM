/* ============================================================
   UI.js — ฟังก์ชันช่วยเหลือที่ใช้ร่วมกันทุกหน้า
   ============================================================ */
function initLayout(activePage) {
  document.querySelectorAll(".nav-item").forEach((el) => {
    el.classList.toggle("active", el.dataset.page === activePage);
  });
  const s = STORE.settings();
  const nameEl = document.getElementById("userName");
  const roleEl = document.getElementById("userRole");
  const avatarEl = document.getElementById("userAvatar");
  const brandTitleEl = document.getElementById("brandTitle");
  const brandSubEl = document.getElementById("brandSub");
  if (nameEl) nameEl.textContent = s.adminName;
  if (roleEl) roleEl.textContent = s.adminRole;
  if (avatarEl) avatarEl.textContent = (s.adminName || "จ").trim().charAt(0);
  if (brandTitleEl) brandTitleEl.textContent = s.orgName;
  if (brandSubEl) brandSubEl.textContent = `ตำบล${s.subdistrict} อำเภอ${s.district} จังหวัด${s.province}`;
  const bell = document.getElementById("notifBell");
  if (bell) bell.addEventListener("click", () => showToast("การแจ้งเตือน: ยังไม่มีรายการใหม่"));
}

let _toastTimer;
function showToast(msg) {
  let t = document.getElementById("toast");
  if (!t) {
    t = document.createElement("div");
    t.id = "toast";
    t.className = "toast";
    document.body.appendChild(t);
  }
  t.textContent = msg;
  t.classList.add("show");
  clearTimeout(_toastTimer);
  _toastTimer = setTimeout(() => t.classList.remove("show"), 2200);
}

function fmt(n) { return Number(n || 0).toLocaleString("th-TH"); }

function speciesLabel(sp) { return sp === "dog" ? "สุนัข" : "แมว"; }
function speciesEmoji(sp) { return sp === "dog" ? "🐶" : "🐱"; }
function speciesColor(sp) { return sp === "dog" ? "#F0A020" : "#3B82C4"; }

function statusLabel(st) {
  return { normal: "ปกติ", risk: "เสี่ยงโรค", sick: "ป่วย", watch: "เฝ้าระวัง" }[st] || st;
}
function statusClass(st) {
  return { normal: "status-normal", risk: "status-risk", sick: "status-sick", watch: "status-watch" }[st] || "";
}
function caseStatusClass(st) {
  return { "รอดำเนินการ": "case-pending", "กำลังดำเนินการ": "case-progress", "เสร็จสิ้น": "case-done" }[st] || "";
}

function villageOptionsHtml(selectedId) {
  return GEO.VILLAGES.map(
    (v) => `<option value="${v.id}" ${Number(selectedId) === v.id ? "selected" : ""}>${v.name}</option>`
  ).join("");
}

function downloadCSV(filename, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\r\n");
  const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/* ============================================================
   STORE.js — ฐานข้อมูลจำลอง (บันทึกลง localStorage ของเบราว์เซอร์)
   ทุกหน้าที่ include ไฟล์นี้จะอ่าน/เขียนข้อมูลชุดเดียวกัน
   ============================================================ */
const STORE = (function () {
  const KEY = "thapho_pet_db_v1";

  const OWNER_NAMES = ["สมชาย ใจดี","มาลี รักสัตว์","วิชัย ทองคำ","สุนีย์ ศรีสุข","อนันต์ พูลสวัสดิ์",
    "จันทร์เพ็ญ แสงทอง","ประเสริฐ บุญมาก","นงลักษณ์ ใจงาม","ธีระ ศรีวิไล","กัลยา ทิพย์วงศ์",
    "สมหญิง แก้วมณี","บุญเลิศ ทองดี","รัตนา ศรีทอง","วีระพล ใจเย็น","พรทิพย์ หอมจันทร์",
    "อำนวย ทับทิม","ละออง สุขใจ","ไพโรจน์ มั่งมี","ศิริพร แดงสด","สมบัติ ยิ้มแย้ม"];
  const DOG_NAMES = ["ตูบ","บราวนี่","โบโบ้","มิลค์","ดำ","เจ้าโต","ป๋อมแป๋ม","ไข่มุก","ลูกชิ้น","จันทร์","จ้าวหน่อย","แดง","ทองดี","หมาลี","บิ๊ก"];
  const CAT_NAMES = ["เหมียว","ส้มโอ","มะปราง","ฟ้า","ดาว","เจ้าเหมียว","แมวเหมียว","โมจิ","พุดดิ้ง","เจ้านิล","ส้มจี๊ด","มิ้นท์","งิ้ว","ขนมปัง","ตาล"];

  function randomDate(rnd) {
    const d = new Date(2026, Math.floor(rnd() * 7), 1 + Math.floor(rnd() * 27));
    return d.toISOString().slice(0, 10);
  }

  function seed() {
    const pets = [];
    let idc = 1;
    GEO.VILLAGES.forEach((v) => {
      const rnd = GEO.mulberry32(v.id * 7919 + 13);
      const count = 8 + Math.floor(rnd() * 10);
      for (let i = 0; i < count; i++) {
        const angle = rnd() * Math.PI * 2;
        const dist = rnd() * GEO.HEX_RADIUS_KM * 0.62;
        const x = v.cx + Math.cos(angle) * dist;
        const y = v.cy + Math.sin(angle) * dist;
        const [lat, lng] = GEO.kmToLatLng(x, y);
        const species = rnd() < 0.53 ? "dog" : "cat";
        const nameList = species === "dog" ? DOG_NAMES : CAT_NAMES;
        const statusRoll = rnd();
        pets.push({
          id: "P" + String(idc++).padStart(4, "0"),
          villageId: v.id,
          houseNo: 8 + Math.floor(rnd() * 280),
          owner: OWNER_NAMES[Math.floor(rnd() * OWNER_NAMES.length)],
          petName: nameList[Math.floor(rnd() * nameList.length)],
          species,
          gender: rnd() < 0.5 ? "ผู้" : "เมีย",
          vaccinated: rnd() < 0.78,
          neutered: rnd() < 0.5,
          alive: rnd() < 0.985,
          status: statusRoll < 0.694 ? "normal" : statusRoll < 0.889 ? "risk" : statusRoll < 0.955 ? "sick" : "watch",
          lat, lng,
          registeredDate: randomDate(rnd),
        });
      }
    });

    return {
      pets,
      cases: [
        { id: "C000001", title: "พบสุนัขจรจัดจำนวนมากบริเวณตลาด", villageId: 7, detail: "ชาวบ้านแจ้งว่ามีสุนัขจรจัดรวมกลุ่มบริเวณตลาดนัด ขอให้เจ้าหน้าที่เข้าตรวจสอบ", status: "รอดำเนินการ", date: "2026-06-02" },
        { id: "C000002", title: "แมวเลี้ยงมีอาการป่วยผิดปกติ", villageId: 3, detail: "เจ้าของแจ้งว่าแมวมีอาการซึม ไม่กินอาหาร 2 วัน", status: "กำลังดำเนินการ", date: "2026-06-10" },
        { id: "C000003", title: "ขอความช่วยเหลือทำหมันสุนัขจร", villageId: 9, detail: "พบสุนัขจรจัดตั้งท้อง ขอให้ทีมสัตวแพทย์ลงพื้นที่", status: "เสร็จสิ้น", date: "2026-05-20" },
      ],
      news: [
        { id: "N000001", title: "ประกาศออกหน่วยฉีดวัคซีนพิษสุนัขบ้าฟรี", detail: "เทศบาลตำบลท่าโพธิ์ขอเชิญชวนประชาชนพาสัตว์เลี้ยงมารับบริการฉีดวัคซีนป้องกันโรคพิษสุนัขบ้าฟรี ประจำปี 2569 ตามจุดนัดหมายแต่ละหมู่บ้าน", date: "2026-06-01" },
        { id: "N000002", title: "เปิดลงทะเบียนทำหมันสุนัข-แมว รอบเดือนกรกฎาคม", detail: "เปิดรับลงทะเบียนทำหมันฟรีสำหรับสุนัขและแมวในตำบลท่าโพธิ์ จำกัดจำนวน 100 ตัวต่อรอบ", date: "2026-06-20" },
        { id: "N000003", title: "แจ้งปิดปรับปรุงระบบชั่วคราว", detail: "ระบบจะปิดปรับปรุงเพื่อเพิ่มประสิทธิภาพในวันที่กำหนด ขออภัยในความไม่สะดวก", date: "2026-07-05" },
      ],
      settings: {
        orgName: "ระบบจัดการข้อมูลสุนัขและแมว",
        subdistrict: "ท่าโพธิ์",
        district: "เมืองพิษณุโลก",
        province: "พิษณุโลก",
        adminName: "เจ้าหน้าที่ตำบลท่าโพธิ์",
        adminRole: "ผู้ดูแลระบบ",
      },
    };
  }

  function load() {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      try { return JSON.parse(raw); } catch (e) { /* fall through to reseed */ }
    }
    const data = seed();
    localStorage.setItem(KEY, JSON.stringify(data));
    return data;
  }
  function save() { localStorage.setItem(KEY, JSON.stringify(db)); }

  let db = load();

  // ---------- Pets ----------
  function pets() { return db.pets; }
  function getPet(id) { return db.pets.find((p) => p.id === id); }
  function addPet(p) {
    p.id = "P" + String(Date.now()).slice(-6);
    if (p.lat == null || p.lng == null) {
      const v = GEO.villageById[p.villageId];
      const rnd = GEO.mulberry32(Date.now() % 100000);
      const angle = rnd() * Math.PI * 2, dist = rnd() * GEO.HEX_RADIUS_KM * 0.55;
      const [lat, lng] = GEO.kmToLatLng(v.cx + Math.cos(angle) * dist, v.cy + Math.sin(angle) * dist);
      p.lat = lat; p.lng = lng;
    }
    if (!p.registeredDate) p.registeredDate = new Date().toISOString().slice(0, 10);
    db.pets.unshift(p);
    save();
    return p;
  }
  function updatePet(id, changes) {
    const i = db.pets.findIndex((p) => p.id === id);
    if (i > -1) { db.pets[i] = { ...db.pets[i], ...changes }; save(); }
    return db.pets[i];
  }
  function deletePet(id) { db.pets = db.pets.filter((p) => p.id !== id); save(); }

  // ---------- Cases ----------
  function cases() { return db.cases; }
  function addCase(c) {
    c.id = "C" + String(Date.now()).slice(-6);
    c.date = new Date().toISOString().slice(0, 10);
    c.status = c.status || "รอดำเนินการ";
    db.cases.unshift(c); save(); return c;
  }
  function updateCase(id, changes) {
    const i = db.cases.findIndex((c) => c.id === id);
    if (i > -1) { db.cases[i] = { ...db.cases[i], ...changes }; save(); }
  }
  function deleteCase(id) { db.cases = db.cases.filter((c) => c.id !== id); save(); }

  // ---------- News ----------
  function news() { return db.news; }
  function addNews(n) {
    n.id = "N" + String(Date.now()).slice(-6);
    n.date = new Date().toISOString().slice(0, 10);
    db.news.unshift(n); save(); return n;
  }
  function updateNews(id, changes) {
    const i = db.news.findIndex((n) => n.id === id);
    if (i > -1) { db.news[i] = { ...db.news[i], ...changes }; save(); }
  }
  function deleteNews(id) { db.news = db.news.filter((n) => n.id !== id); save(); }

  // ---------- Settings ----------
  function settings() { return db.settings; }
  function updateSettings(changes) { db.settings = { ...db.settings, ...changes }; save(); }

  // ---------- Computed stats ----------
  function villageStats(id) {
    const list = db.pets.filter((p) => p.villageId === id);
    const owners = new Set(list.map((p) => p.houseNo)).size;
    const dogs = list.filter((p) => p.species === "dog").length;
    const cats = list.filter((p) => p.species === "cat").length;
    const vaccinated = list.filter((p) => p.vaccinated).length;
    const neutered = list.filter((p) => p.neutered).length;
    const dead = list.filter((p) => !p.alive).length;
    const notNeutered = list.filter((p) => p.alive && !p.neutered).length;
    return { owners, dogs, cats, total: dogs + cats, vaccinated, neutered, notNeutered, dead };
  }
  function overview() {
    const dogs = db.pets.filter((p) => p.species === "dog").length;
    const cats = db.pets.filter((p) => p.species === "cat").length;
    const vaccinated = db.pets.filter((p) => p.vaccinated).length;
    const neutered = db.pets.filter((p) => p.neutered).length;
    const normal = db.pets.filter((p) => p.status === "normal").length;
    const risk = db.pets.filter((p) => p.status === "risk").length;
    const sick = db.pets.filter((p) => p.status === "sick").length;
    const watch = db.pets.filter((p) => p.status === "watch").length;
    return { dogs, cats, total: dogs + cats, vaccinated, neutered, normal, risk, sick, watch };
  }

  function resetAll() { db = seed(); save(); }

  return {
    pets, getPet, addPet, updatePet, deletePet,
    cases, addCase, updateCase, deleteCase,
    news, addNews, updateNews, deleteNews,
    settings, updateSettings,
    villageStats, overview, resetAll,
  };
})();

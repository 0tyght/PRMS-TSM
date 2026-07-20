import { useEffect, useMemo, useState } from "react";
import { createApi } from "../lib/api.js";
import DashboardMap from "../components/DashboardMap.jsx";
import { PageHead } from "../components/common/PageUI.jsx";
import { buildVillageRows } from "../lib/dashboardVillageData.js";

export default function MapPage({ token }) {
  const api = useMemo(() => createApi(token), [token]);
  const [items, setItems] = useState([]);
  const [villages, setVillages] = useState([]);
  const [metric, setMetric] = useState("total");
  const [selectedVillage, setSelectedVillage] = useState(null);
  const [hoveredVillage, setHoveredVillage] = useState(null);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    setMessage("");
    Promise.all([
      api.get("/api/admin/map"),
      api.get("/api/admin/reports/villages"),
    ]).then(([mapRows, villageRows]) => {
      if (!active) return;
      setItems(Array.isArray(mapRows) ? mapRows : []);
      setVillages(Array.isArray(villageRows) ? villageRows : []);
    }).catch((error) => {
      if (!active) return;
      setItems([]);
      setVillages([]);
      setMessage(error.message || "ไม่สามารถโหลดข้อมูลแผนที่ได้");
    });
    return () => { active = false; };
  }, [api]);

  const rows = useMemo(
    () => buildVillageRows({ villages, items }),
    [villages, items],
  );

  return (
    <>
      <PageHead
        eyebrow="ข้อมูลเชิงพื้นที่"
        title="แผนที่สัตว์เลี้ยงขึ้นทะเบียน"
        detail="กรองชนิดสัตว์เลี้ยง พื้นที่ และสถานะบริการเพื่อวางแผนงานรายหมู่บ้าน"
      />
      {message ? <div className="production-api-warning"><strong>โหลดแผนที่ไม่สำเร็จ</strong><span>{message}</span></div> : null}
      <DashboardMap
        rows={rows}
        metric={metric}
        selectedVillage={selectedVillage}
        hoveredVillage={hoveredVillage}
        onMetricChange={setMetric}
        onVillageSelect={setSelectedVillage}
        onVillageHover={setHoveredVillage}
      />
    </>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DASHBOARD_METRICS,
  buildVillageRows,
  formatMetricValue,
  getMetricMaximum,
  getMetricValue,
  summarizeVillageRows,
} from "../lib/dashboardVillageData.js";
import { THA_PHO_FULL_VIEWBOX } from "../lib/thaPhoVillageMapData.js";

const FULL_VIEW = Object.freeze({
  x: THA_PHO_FULL_VIEWBOX.x,
  y: THA_PHO_FULL_VIEWBOX.y,
  width: THA_PHO_FULL_VIEWBOX.width,
  height: THA_PHO_FULL_VIEWBOX.height,
});

const COLOR_RAMPS = Object.freeze({
  total: ["#e7f3ee", "#0b6847"],
  pending: ["#fff2d8", "#d97706"],
  cases: ["#fde8e5", "#c94f45"],
});

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function copyView(view) {
  return { x: view.x, y: view.y, width: view.width, height: view.height };
}

function hexToRgb(hex) {
  const normalized = hex.replace("#", "");
  const value = Number.parseInt(normalized, 16);
  return {
    r: (value >> 16) & 255,
    g: (value >> 8) & 255,
    b: value & 255,
  };
}

function mixColor(from, to, ratio) {
  const start = hexToRgb(from);
  const end = hexToRgb(to);
  const amount = clamp(ratio, 0, 1);
  const channel = (key) => Math.round(start[key] + (end[key] - start[key]) * amount);
  return `rgb(${channel("r")}, ${channel("g")}, ${channel("b")})`;
}

function coverageColor(value, hasData) {
  if (!hasData) return "#e8eeeb";
  if (value < 50) return mixColor("#f9e5e1", "#d65d50", value / 50);
  if (value < 75) return mixColor("#fff1cf", "#e6a62d", (value - 50) / 25);
  return mixColor("#dff2e9", "#17845f", (value - 75) / 25);
}

function villageColor(row, metric, maximum) {
  const value = getMetricValue(row, metric);
  if (metric === "vaccination" || metric === "sterilization") {
    return coverageColor(value, row.totalPets > 0);
  }

  const [from, to] = COLOR_RAMPS[metric] || COLOR_RAMPS.total;
  return mixColor(from, to, maximum ? value / maximum : 0);
}

function fitVillageView(village, aspectRatio = 1.38) {
  if (!village?.bbox) return copyView(FULL_VIEW);

  const padding = 90;
  let width = Math.max(300, village.bbox.x2 - village.bbox.x1 + padding * 2);
  let height = Math.max(260, village.bbox.y2 - village.bbox.y1 + padding * 2);
  const currentRatio = width / height;

  if (currentRatio > aspectRatio) {
    height = width / aspectRatio;
  } else {
    width = height * aspectRatio;
  }

  const centerX = (village.bbox.x1 + village.bbox.x2) / 2;
  const centerY = (village.bbox.y1 + village.bbox.y2) / 2;

  return {
    x: centerX - width / 2,
    y: centerY - height / 2,
    width,
    height,
  };
}

function easeOutCubic(value) {
  return 1 - Math.pow(1 - value, 3);
}

function MetricTabs({ metric, onChange }) {
  return (
    <div className="interactive-map__metric-tabs" aria-label="เลือกข้อมูลที่แสดงบนแผนที่">
      {Object.values(DASHBOARD_METRICS).map((item) => (
        <button
          key={item.id}
          type="button"
          className={metric === item.id ? "is-active" : ""}
          onClick={() => onChange(item.id)}
          title={item.detail}
        >
          <i>{item.icon}</i>
          <span>{item.label}</span>
        </button>
      ))}
    </div>
  );
}

function DetailProgress({ label, value, tone }) {
  return (
    <div className="interactive-map__detail-progress">
      <div>
        <span>{label}</span>
        <strong>{value}%</strong>
      </div>
      <i>
        <b className={tone} style={{ width: `${clamp(value, 0, 100)}%` }} />
      </i>
    </div>
  );
}

function VillageDetail({ row, selected, onClear, onOpenPets, onOpenRegistrations, onOpenCases }) {
  const guidance = [];

  if (row.totalPets === 0) guidance.push("ยังไม่มีสัตว์ที่อนุมัติทะเบียนในพื้นที่นี้");
  if (row.totalPets > 0 && row.vaccinationCoverage < 70) {
    guidance.push(`ควรติดตามวัคซีนอีก ${Math.max(0, row.totalPets - row.vaccinated)} ตัว`);
  }
  if (row.totalPets > 0 && row.sterilizationCoverage < 50) {
    guidance.push(`ยังไม่มีประวัติทำหมัน ${Math.max(0, row.totalPets - row.sterilized)} ตัว`);
  }
  if (row.pending > 0) guidance.push(`มีคำขอรอตรวจ ${row.pending} คำขอ`);
  if (row.openCases > 0) guidance.push(`มีเหตุที่ยังไม่ปิดงาน ${row.openCases} เหตุ`);
  if (guidance.length === 0) guidance.push("ข้อมูลบริการอยู่ในเกณฑ์ดี ยังไม่มีรายการเร่งด่วน");

  return (
    <aside className="interactive-map__detail" aria-live="polite">
      <div className="interactive-map__detail-head">
        <div>
          <p>{selected ? "พื้นที่ที่เลือก" : "ภาพรวมพื้นที่"}</p>
          <h3>{row.villageName || row.name}</h3>
        </div>
        {selected ? (
          <button type="button" onClick={onClear} aria-label="ล้างการเลือกหมู่บ้าน">
            ×
          </button>
        ) : null}
      </div>

      <div className="interactive-map__detail-total">
        <span>สัตว์ขึ้นทะเบียน</span>
        <strong>{Number(row.totalPets || 0).toLocaleString("th-TH")}</strong>
        <small>สุนัข {row.dogs || 0} · แมว {row.cats || 0}</small>
      </div>

      <DetailProgress label="ความครอบคลุมวัคซีน" value={row.vaccinationCoverage || 0} tone="green" />
      <DetailProgress label="ความครอบคลุมทำหมัน" value={row.sterilizationCoverage || 0} tone="violet" />

      <div className="interactive-map__task-grid">
        <button type="button" onClick={onOpenRegistrations}>
          <span>คำขอรอตรวจ</span>
          <strong>{row.pending || 0}</strong>
        </button>
        <button type="button" onClick={onOpenCases}>
          <span>เหตุที่ดำเนินการ</span>
          <strong>{row.openCases || 0}</strong>
        </button>
      </div>

      <div className="interactive-map__guidance">
        <b>ข้อเสนอแนะจากข้อมูล</b>
        <ul>
          {guidance.slice(0, 3).map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>

      <div className="interactive-map__detail-actions">
        <button type="button" className="primary" onClick={onOpenPets}>
          ดูทะเบียนสัตว์
        </button>
        <button type="button" onClick={onOpenRegistrations}>
          ดูงานที่เกี่ยวข้อง
        </button>
      </div>

      {selected && row.pets?.length ? (
        <div className="interactive-map__pet-preview">
          <div>
            <b>ตัวอย่างสัตว์ในพื้นที่</b>
            <span>{row.pets.length} รายการ</span>
          </div>
          {row.pets.slice(0, 4).map((pet) => (
            <button key={pet.id || `${pet.petName}-${pet.ownerName}`} type="button" onClick={onOpenPets}>
              <i className={pet.species === "DOG" ? "dog" : "cat"}>{pet.species === "DOG" ? "ส" : "ม"}</i>
              <span>
                <b>{pet.petName || "ไม่ระบุชื่อ"}</b>
                <small>{pet.ownerName || "ไม่ระบุเจ้าของ"}</small>
              </span>
              <em>{pet.vaccinated ? "วัคซีนแล้ว" : "ติดตามวัคซีน"}</em>
            </button>
          ))}
        </div>
      ) : null}
    </aside>
  );
}

export default function DashboardMap({
  items = [],
  villages = [],
  requests = [],
  cases = [],
  metric = "total",
  selectedVillage = null,
  hoveredVillage = null,
  onMetricChange,
  onVillageSelect,
  onVillageHover,
  onOpenPets,
  onOpenRegistrations,
  onOpenCases,
}) {
  const stageRef = useRef(null);
  const svgRef = useRef(null);
  const animationRef = useRef(null);
  const viewBoxRef = useRef(copyView(FULL_VIEW));
  const dragRef = useRef(null);
  const suppressClickRef = useRef(false);
  const [viewBox, setViewBox] = useState(copyView(FULL_VIEW));
  const [tooltip, setTooltip] = useState({ open: false, x: 0, y: 0, villageId: null });
  const [fullscreen, setFullscreen] = useState(false);

  const rows = useMemo(
    () => buildVillageRows({ villages, items, requests, cases }),
    [villages, items, requests, cases],
  );
  const maximum = useMemo(() => getMetricMaximum(rows, metric), [rows, metric]);
  const summary = useMemo(() => summarizeVillageRows(rows), [rows]);
  const selectedRow = rows.find((row) => row.id === Number(selectedVillage)) || null;
  const detailRow = selectedRow || summary;
  const tooltipRow = rows.find((row) => row.id === Number(tooltip.villageId)) || null;

  const updateView = useCallback((nextView) => {
    viewBoxRef.current = nextView;
    setViewBox(nextView);
  }, []);

  const animateView = useCallback((target) => {
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
    const startedAt = performance.now();
    const startView = copyView(viewBoxRef.current);

    const frame = (time) => {
      const progress = clamp((time - startedAt) / 360, 0, 1);
      const eased = easeOutCubic(progress);
      updateView({
        x: startView.x + (target.x - startView.x) * eased,
        y: startView.y + (target.y - startView.y) * eased,
        width: startView.width + (target.width - startView.width) * eased,
        height: startView.height + (target.height - startView.height) * eased,
      });

      if (progress < 1) animationRef.current = requestAnimationFrame(frame);
    };

    animationRef.current = requestAnimationFrame(frame);
  }, [updateView]);

  const focusVillage = useCallback(
    (villageId) => {
      const village = rows.find((row) => row.id === Number(villageId));
      if (!village) return;
      const rect = stageRef.current?.getBoundingClientRect();
      const aspect = rect?.width && rect?.height ? rect.width / rect.height : 1.38;
      animateView(fitVillageView(village, aspect));
    },
    [animateView, rows],
  );

  const resetView = useCallback(() => {
    animateView(copyView(FULL_VIEW));
  }, [animateView]);

  useEffect(() => {
    if (selectedVillage) focusVillage(selectedVillage);
    else resetView();
  }, [selectedVillage, focusVillage, resetView]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      if (fullscreen) setFullscreen(false);
      else if (selectedVillage) onVillageSelect?.(null);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [fullscreen, selectedVillage, onVillageSelect]);

  useEffect(
    () => () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
    },
    [],
  );

  const moveTooltip = (event, villageId) => {
    const bounds = stageRef.current?.getBoundingClientRect();
    if (!bounds) return;
    setTooltip({
      open: true,
      villageId,
      x: clamp(event.clientX - bounds.left + 14, 12, bounds.width - 236),
      y: clamp(event.clientY - bounds.top + 14, 12, bounds.height - 178),
    });
  };

  const selectVillage = (villageId) => {
    if (suppressClickRef.current) return;
    const next = Number(selectedVillage) === Number(villageId) ? null : Number(villageId);
    onVillageSelect?.(next);
  };

  const zoomAt = (clientX, clientY, factor) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;

    const current = viewBoxRef.current;
    const mapX = current.x + ((clientX - rect.left) / rect.width) * current.width;
    const mapY = current.y + ((clientY - rect.top) / rect.height) * current.height;
    const nextWidth = clamp(current.width * factor, 260, 2100);
    const nextHeight = clamp(current.height * factor, 220, 1750);
    const widthRatio = nextWidth / current.width;
    const heightRatio = nextHeight / current.height;

    updateView({
      x: mapX - (mapX - current.x) * widthRatio,
      y: mapY - (mapY - current.y) * heightRatio,
      width: nextWidth,
      height: nextHeight,
    });
  };

  const zoomCenter = (factor) => {
    const rect = stageRef.current?.getBoundingClientRect();
    if (!rect) return;
    zoomAt(rect.left + rect.width / 2, rect.top + rect.height / 2, factor);
  };

  const handleWheel = (event) => {
    event.preventDefault();
    zoomAt(event.clientX, event.clientY, event.deltaY > 0 ? 1.13 : 0.87);
  };

  const handlePointerDown = (event) => {
    if (event.button !== 0) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      startView: copyView(viewBoxRef.current),
      moved: false,
    };
    svgRef.current?.setPointerCapture?.(event.pointerId);
  };

  const handlePointerMove = (event) => {
    const drag = dragRef.current;
    const rect = stageRef.current?.getBoundingClientRect();
    if (!drag || drag.pointerId !== event.pointerId || !rect) return;

    const deltaX = event.clientX - drag.startX;
    const deltaY = event.clientY - drag.startY;
    if (Math.abs(deltaX) + Math.abs(deltaY) > 4) drag.moved = true;

    updateView({
      ...drag.startView,
      x: drag.startView.x - (deltaX / rect.width) * drag.startView.width,
      y: drag.startView.y - (deltaY / rect.height) * drag.startView.height,
    });
  };

  const handlePointerUp = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (drag.moved) {
      suppressClickRef.current = true;
      window.setTimeout(() => {
        suppressClickRef.current = false;
      }, 80);
    }
    dragRef.current = null;
    svgRef.current?.releasePointerCapture?.(event.pointerId);
  };

  const metricInfo = DASHBOARD_METRICS[metric] || DASHBOARD_METRICS.total;

  return (
    <section className={`interactive-map panel ${fullscreen ? "is-fullscreen" : ""}`}>
      <header className="interactive-map__header">
        <div>
          <p className="eyebrow">ข้อมูลเชิงพื้นที่ · หมู่ 1–11</p>
          <h2>แผนที่ภาพรวมเทศบาลท่าโพธ์</h2>
          <span>เลือกหมู่บ้านเพื่อซูม กรองข้อมูล และดูรายการที่ควรดำเนินการ</span>
        </div>
        <button
          type="button"
          className="interactive-map__fullscreen"
          onClick={() => setFullscreen((current) => !current)}
        >
          {fullscreen ? "ออกจากเต็มจอ" : "แสดงเต็มจอ"}
        </button>
      </header>

      <MetricTabs metric={metric} onChange={onMetricChange} />

      <div className="interactive-map__body">
        <div className="interactive-map__stage" ref={stageRef}>
          <svg
            ref={svgRef}
            viewBox={`${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`}
            role="img"
            aria-label={`แผนที่หมู่บ้าน แสดง${metricInfo.label}`}
            onWheel={handleWheel}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onDoubleClick={(event) => zoomAt(event.clientX, event.clientY, 0.72)}
          >
            <defs>
              <filter id="village-shadow" x="-30%" y="-30%" width="160%" height="160%">
                <feDropShadow dx="0" dy="10" stdDeviation="10" floodColor="#10251e" floodOpacity="0.22" />
              </filter>
              <pattern id="map-grid" width="80" height="80" patternUnits="userSpaceOnUse">
                <path d="M 80 0 L 0 0 0 80" fill="none" stroke="#dce8e3" strokeWidth="2" />
              </pattern>
            </defs>

            <rect x="0" y="0" width="1920" height="1600" fill="#f5f8f6" />
            <rect x="0" y="0" width="1920" height="1600" fill="url(#map-grid)" opacity="0.45" />

            {selectedRow ? (
              <line
                className="interactive-map__connector"
                x1={selectedRow.label.x}
                y1={selectedRow.label.y}
                x2="1880"
                y2={selectedRow.label.y}
              />
            ) : null}

            <g className="interactive-map__villages">
              {rows.map((row) => {
                const isSelected = Number(selectedVillage) === row.id;
                const isHovered = Number(hoveredVillage) === row.id;
                const isDimmed = Boolean(selectedVillage) && !isSelected;

                return (
                  <path
                    key={row.id}
                    d={row.path}
                    fill={villageColor(row, metric, maximum)}
                    className={[
                      "interactive-map__village",
                      isSelected ? "is-selected" : "",
                      isHovered ? "is-hovered" : "",
                      isDimmed ? "is-dimmed" : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    tabIndex="0"
                    aria-label={`${row.name} ${metricInfo.label} ${formatMetricValue(row, metric)}`}
                    onMouseEnter={(event) => {
                      onVillageHover?.(row.id);
                      moveTooltip(event, row.id);
                    }}
                    onMouseMove={(event) => moveTooltip(event, row.id)}
                    onMouseLeave={() => {
                      onVillageHover?.(null);
                      setTooltip((current) => ({ ...current, open: false }));
                    }}
                    onFocus={() => onVillageHover?.(row.id)}
                    onBlur={() => onVillageHover?.(null)}
                    onClick={() => selectVillage(row.id)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        selectVillage(row.id);
                      }
                    }}
                  />
                );
              })}
            </g>

            <g className="interactive-map__labels" aria-hidden="true">
              {rows.map((row) => {
                const value = getMetricValue(row, metric);
                const isSelected = Number(selectedVillage) === row.id;
                return (
                  <g key={row.id} transform={`translate(${row.label.x} ${row.label.y})`}>
                    <circle r={isSelected ? 47 : 40} className={isSelected ? "is-selected" : ""} />
                    <text className="interactive-map__label-number" y="-5">
                      {row.id}
                    </text>
                    <text className="interactive-map__label-value" y="20">
                      {metricInfo.unit === "%" ? `${value}%` : value.toLocaleString("th-TH")}
                    </text>
                  </g>
                );
              })}
            </g>
          </svg>

          <div className="interactive-map__controls" aria-label="เครื่องมือแผนที่">
            <button type="button" onClick={() => zoomCenter(0.8)} title="ซูมเข้า">
              +
            </button>
            <button type="button" onClick={() => zoomCenter(1.25)} title="ซูมออก">
              −
            </button>
            <button type="button" onClick={resetView} title="แสดงทุกหมู่บ้าน">
              ⌂
            </button>
            <button
              type="button"
              onClick={() => selectedVillage && focusVillage(selectedVillage)}
              disabled={!selectedVillage}
              title="กลับไปยังหมู่บ้านที่เลือก"
            >
              ◎
            </button>
          </div>

          <div className="interactive-map__hint">
            <span>ลากเพื่อเลื่อน</span>
            <span>หมุนล้อเมาส์เพื่อซูม</span>
            <span>กด Esc เพื่อล้างการเลือก</span>
          </div>

          {tooltip.open && tooltipRow ? (
            <div className="interactive-map__tooltip" style={{ left: tooltip.x, top: tooltip.y }}>
              <div>
                <b>{tooltipRow.name}</b>
                <strong>{formatMetricValue(tooltipRow, metric)}</strong>
              </div>
              <dl>
                <div>
                  <dt>สัตว์ทั้งหมด</dt>
                  <dd>{tooltipRow.totalPets} ตัว</dd>
                </div>
                <div>
                  <dt>วัคซีน</dt>
                  <dd>{tooltipRow.vaccinationCoverage}%</dd>
                </div>
                <div>
                  <dt>ทำหมัน</dt>
                  <dd>{tooltipRow.sterilizationCoverage}%</dd>
                </div>
                <div>
                  <dt>งานติดตาม</dt>
                  <dd>{tooltipRow.pending + tooltipRow.openCases} รายการ</dd>
                </div>
              </dl>
              <small>คลิกเพื่อดูรายละเอียดและกรองข้อมูลทั้งหน้า</small>
            </div>
          ) : null}
        </div>

        <VillageDetail
          row={detailRow}
          selected={Boolean(selectedRow)}
          onClear={() => onVillageSelect?.(null)}
          onOpenPets={onOpenPets}
          onOpenRegistrations={onOpenRegistrations}
          onOpenCases={onOpenCases}
        />
      </div>

      <footer className="interactive-map__footer">
        <div className="interactive-map__legend">
          <span><i className="low" />ค่าน้อย</span>
          <span><i className="medium" />ควรติดตาม</span>
          <span><i className="high" />ค่าสูง</span>
        </div>
        <p>แผนผังนี้ใช้แสดงข้อมูลรายหมู่แบบโต้ตอบ ยังไม่ใช่แนวเขต GIS สำหรับงานรังวัด</p>
      </footer>
    </section>
  );
}

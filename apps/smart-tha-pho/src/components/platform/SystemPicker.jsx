import { PLATFORM_SYSTEMS, SMART_THA_PHO } from "../../config/systems.js";

export default function SystemPicker({ selectedSystemId, onSelect, compact = false }) {
  return (
    <section className={`system-picker ${compact ? "system-picker--compact" : ""}`} aria-label="เลือกระบบงาน">
      {!compact && (
        <div className="system-picker__heading">
          <p>ระบบงานเจ้าหน้าที่</p>
          <h2>เลือกเว็บระบบที่ต้องการใช้งาน</h2>
          <span>{SMART_THA_PHO.municipalityName}</span>
        </div>
      )}
      <div className="system-picker__grid">
        {PLATFORM_SYSTEMS.map((system) => {
          const selected = system.id === selectedSystemId;
          return (
            <button
              key={system.id}
              type="button"
              className={`system-picker__card system-picker__card--${system.accent} ${selected ? "is-selected" : ""}`}
              aria-pressed={selected}
              onClick={() => onSelect(system.id)}
            >
              <span className="system-picker__mark">{system.mark}</span>
              <span className="system-picker__copy">
                <small>{system.productName}</small>
                <strong>{system.shortName}</strong>
                <em>{system.description}</em>
              </span>
              <span className="system-picker__check" aria-hidden="true">✓</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

import { SMART_THA_PHO } from "../config/systems.js";
import SystemPicker from "../components/platform/SystemPicker.jsx";

export default function SystemPickerPage({ user, onSelect, onLogout }) {
  return (
    <main className="platform-picker-page">
      <header className="platform-picker-page__topbar">
        <div className="platform-brand">
          <span className="platform-brand__mark">ทพ</span>
          <span>
            <strong>{SMART_THA_PHO.productName}</strong>
            <small>{SMART_THA_PHO.municipalityName}</small>
          </span>
        </div>
        <div className="platform-picker-page__profile">
          <span>{String(user?.name || "เจ้าหน้าที่").slice(0, 2)}</span>
          <div>
            <strong>{user?.name || "เจ้าหน้าที่เทศบาล"}</strong>
            <small>เข้าสู่ระบบแล้ว</small>
          </div>
          <button type="button" onClick={onLogout}>ออกจากระบบ</button>
        </div>
      </header>
      <div className="platform-picker-page__content">
        <SystemPicker onSelect={onSelect} />
      </div>
    </main>
  );
}

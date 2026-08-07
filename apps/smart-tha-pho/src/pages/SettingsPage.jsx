import { useEffect, useMemo, useState } from "react";
import {
  EmptyState,
  LoadingPanel,
  Notice,
  PageHead,
} from "../components/common/PageUI.jsx";
import MfaSettingsCard from "../components/MfaSettingsCard.jsx";
import { createApi } from "../lib/api.js";

const roleLabels = {
  ADMIN: "ผู้ดูแลระบบ",
  OFFICER: "เจ้าหน้าที่",
  VIEWER: "ผู้ตรวจสอบ",
};

const roleDescriptions = {
  ADMIN: "จัดการระบบ ผู้ใช้ และข้อมูลทุกพื้นที่",
  OFFICER: "ตรวจสอบและดำเนินงานในพื้นที่รับผิดชอบ",
  VIEWER: "เปิดดูข้อมูลและรายงานโดยไม่แก้ไข",
};

function Icon({ name }) {
  const paths = {
    api: (
      <>
        <path d="M7 7h10v10H7z" />
        <path d="M3 9h4M3 15h4M17 9h4M17 15h4M9 3v4M15 3v4M9 17v4M15 17v4" />
      </>
    ),
    database: (
      <>
        <ellipse cx="12" cy="5" rx="7" ry="3" />
        <path d="M5 5v6c0 1.7 3.1 3 7 3s7-1.3 7-3V5" />
        <path d="M5 11v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" />
      </>
    ),
    line: (
      <>
        <rect x="3" y="4" width="18" height="14" rx="5" />
        <path d="M8 9h8M8 13h5M9 18l-2 3" />
      </>
    ),
    queue: (
      <>
        <path d="M5 5h14v14H5z" />
        <path d="M8 9h8M8 13h5M8 17h7" />
      </>
    ),
    users: (
      <>
        <circle cx="9" cy="8" r="3" />
        <path d="M3.5 20a5.5 5.5 0 0 1 11 0" />
        <circle cx="17" cy="9" r="2.5" />
        <path d="M15.5 14.5A4.5 4.5 0 0 1 21 19" />
      </>
    ),
    refresh: (
      <>
        <path d="M20 6v5h-5M4 18v-5h5" />
        <path d="M6 8a7 7 0 0 1 12-2l2 5M18 16a7 7 0 0 1-12 2l-2-5" />
      </>
    ),
  };

  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      {paths[name] || paths.api}
    </svg>
  );
}

function ServiceCard({
  icon,
  title,
  detail,
  status,
  tone = "ready",
}) {
  return (
    <article className={`settings-service-card is-${tone}`}>
      <span className="settings-service-card__icon">
        <Icon name={icon} />
      </span>
      <span className="settings-service-card__copy">
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      <span className="settings-service-card__status">{status}</span>
    </article>
  );
}

export default function SettingsPage({ token }) {
  const api = useMemo(() => createApi(token), [token]);
  const [system, setSystem] = useState(null);
  const [users, setUsers] = useState([]);
  const [villages, setVillages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [savingId, setSavingId] = useState(null);

  const load = async () => {
    setLoading(true);
    setMessage("");

    const [systemResult, userResult, villageResult] = await Promise.allSettled([
      api.get("/api/admin/system-status"),
      api.get("/api/admin/users"),
      api.get("/api/public/villages"),
    ]);

    if (systemResult.status === "fulfilled") {
      setSystem(systemResult.value);
    } else {
      setSystem(null);
      setMessage(
        systemResult.reason?.message ||
          "ไม่สามารถโหลดสถานะระบบได้",
      );
    }

    setUsers(
      userResult.status === "fulfilled" &&
        Array.isArray(userResult.value)
        ? userResult.value
        : [],
    );

    setVillages(
      villageResult.status === "fulfilled" &&
        Array.isArray(villageResult.value)
        ? villageResult.value
        : [],
    );

    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, [api]);

  const updateUser = async (user, changes) => {
    setSavingId(user.id);
    setMessage("");

    try {
      const next = {
        role: user.role,
        isActive: Boolean(user.isActive),
        villageId: user.villageId || null,
        ...changes,
      };

      await api.patch(`/api/admin/users/${user.id}`, next);

      setUsers((current) =>
        current.map((item) =>
          item.id === user.id
            ? { ...item, ...next }
            : item,
        ),
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "ไม่สามารถอัปเดตผู้ใช้งานได้",
      );
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="settings-v8">
        <LoadingPanel text="กำลังตรวจสอบองค์ประกอบระบบ…" />
      </div>
    );
  }

  const notificationFailed = Number(
    system?.notifications?.failed || 0,
  );
  const notificationPending = Number(
    system?.notifications?.pending || 0,
  );
  const activeUsers = Number(
    system?.users?.active ||
      users.filter((user) => user.isActive).length,
  );
  const totalUsers = Number(
    system?.users?.total || users.length,
  );

  return (
    <div className="settings-v8">
      <PageHead
        eyebrow="System Administration"
        title="การตั้งค่าระบบ"
        detail="จัดการความปลอดภัย การเชื่อมต่อบริการ และสิทธิ์ของเจ้าหน้าที่จากพื้นที่เดียว"
        actions={
          <button
            type="button"
            className="prms-button prms-button--ghost"
            onClick={() => void load()}
            disabled={loading}
          >
            <Icon name="refresh" />
            <span>ตรวจสอบสถานะใหม่</span>
          </button>
        }
      />

      <Notice message={message} />

      <section className="settings-v8__overview">
        <MfaSettingsCard
          api={api}
          onError={setMessage}
        />

        <aside className="settings-v8__account-summary">
          <div className="settings-v8__summary-icon">
            <Icon name="users" />
          </div>
          <div>
            <span>บัญชีเจ้าหน้าที่</span>
            <strong>
              {activeUsers.toLocaleString("th-TH")}
              <small>
                / {totalUsers.toLocaleString("th-TH")} บัญชี
              </small>
            </strong>
            <p>บัญชีที่เปิดใช้งานในระบบปัจจุบัน</p>
          </div>
        </aside>
      </section>

      <section className="settings-v8__services">
        <div className="settings-section-heading">
          <div>
            <span>System Health</span>
            <h2>สถานะบริการและช่องทางเชื่อมต่อ</h2>
            <p>
              แสดงสถานะจริงจาก API ฐานข้อมูล และคิวการแจ้งเตือน
            </p>
          </div>
        </div>

        <div className="settings-service-grid">
          <ServiceCard
            icon="api"
            title="Admin API"
            detail="บริการกลางสำหรับระบบเจ้าหน้าที่และช่องทางประชาชน"
            status={
              system?.api === "ready"
                ? "พร้อมใช้งาน"
                : "ต้องตรวจสอบ"
            }
            tone={
              system?.api === "ready"
                ? "ready"
                : "warning"
            }
          />

          <ServiceCard
            icon="database"
            title="ฐานข้อมูลกลาง"
            detail={
              system?.databaseVersion
                ? `MariaDB/MySQL ${system.databaseVersion}`
                : "ไม่พบข้อมูลเวอร์ชัน"
            }
            status={
              system?.database === "ready"
                ? "เชื่อมต่อแล้ว"
                : "ไม่พร้อม"
            }
            tone={
              system?.database === "ready"
                ? "ready"
                : "danger"
            }
          />

          <ServiceCard
            icon="line"
            title="LINE Official Account"
            detail="ช่องทางสำหรับเจ้าของสัตว์เลี้ยงส่งและติดตามข้อมูล"
            status={
              system?.line === "configured"
                ? "ตั้งค่าแล้ว"
                : "รอการตั้งค่า"
            }
            tone={
              system?.line === "configured"
                ? "ready"
                : "warning"
            }
          />

          <ServiceCard
            icon="queue"
            title="คิวแจ้งเตือน LINE"
            detail={`ส่งแล้ว ${Number(
              system?.notifications?.sent || 0,
            ).toLocaleString("th-TH")} · รอส่ง ${notificationPending.toLocaleString(
              "th-TH",
            )}`}
            status={
              notificationFailed
                ? `ล้มเหลว ${notificationFailed.toLocaleString(
                    "th-TH",
                  )}`
                : "ทำงานปกติ"
            }
            tone={
              notificationFailed
                ? "danger"
                : notificationPending
                  ? "warning"
                  : "ready"
            }
          />
        </div>
      </section>

      <section className="settings-users-card">
        <header className="settings-users-card__head">
          <div>
            <span>Access Management</span>
            <h2>บัญชีเจ้าหน้าที่และบทบาท</h2>
            <p>
              กำหนดระดับสิทธิ์ พื้นที่รับผิดชอบ และสถานะการเข้าใช้งาน
            </p>
          </div>
          <div className="settings-users-card__count">
            <strong>
              {totalUsers.toLocaleString("th-TH")}
            </strong>
            <span>บัญชีทั้งหมด</span>
          </div>
        </header>

        {users.length ? (
          <div className="settings-users-table-wrap">
            <table className="settings-users-table">
              <thead>
                <tr>
                  <th>เจ้าหน้าที่</th>
                  <th>บทบาทและสิทธิ์</th>
                  <th>พื้นที่รับผิดชอบ</th>
                  <th>สถานะ</th>
                  <th>เข้าสู่ระบบล่าสุด</th>
                </tr>
              </thead>
              <tbody>
                {users.map((user) => (
                  <tr key={user.id}>
                    <td>
                      <div className="settings-user-cell">
                        <span>
                          {String(
                            user.fullName || user.email || "จท",
                          ).slice(0, 2)}
                        </span>
                        <div>
                          <strong>{user.fullName}</strong>
                          <small>{user.email}</small>
                        </div>
                      </div>
                    </td>
                    <td>
                      <label className="settings-inline-field">
                        <span className="sr-only">
                          บทบาทของ {user.fullName}
                        </span>
                        <select
                          aria-label={`บทบาทของ ${user.fullName}`}
                          value={user.role}
                          disabled={savingId === user.id}
                          onChange={(event) =>
                            void updateUser(user, {
                              role: event.target.value,
                            })
                          }
                        >
                          <option value="ADMIN">
                            {roleLabels.ADMIN}
                          </option>
                          <option value="OFFICER">
                            {roleLabels.OFFICER}
                          </option>
                          <option value="VIEWER">
                            {roleLabels.VIEWER}
                          </option>
                        </select>
                        <small>
                          {roleDescriptions[user.role]}
                        </small>
                      </label>
                    </td>
                    <td>
                      <select
                        className="settings-area-select"
                        aria-label={`พื้นที่ของ ${user.fullName}`}
                        value={user.villageId || ""}
                        disabled={
                          savingId === user.id ||
                          user.role === "ADMIN"
                        }
                        onChange={(event) =>
                          void updateUser(user, {
                            villageId: event.target.value
                              ? Number(event.target.value)
                              : null,
                          })
                        }
                      >
                        <option value="">ทุกหมู่บ้าน</option>
                        {villages.map((village) => (
                          <option
                            key={village.id}
                            value={village.id}
                          >
                            {village.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td>
                      <button
                        type="button"
                        className={`settings-user-status ${
                          user.isActive
                            ? "is-active"
                            : "is-disabled"
                        }`}
                        disabled={savingId === user.id}
                        onClick={() =>
                          void updateUser(user, {
                            isActive: !user.isActive,
                          })
                        }
                      >
                        <i />
                        <span>
                          {savingId === user.id
                            ? "กำลังบันทึก"
                            : user.isActive
                              ? "ใช้งานอยู่"
                              : "ระงับแล้ว"}
                        </span>
                      </button>
                    </td>
                    <td className="settings-last-login">
                      {user.lastLoginAt
                        ? new Intl.DateTimeFormat("th-TH", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(
                            new Date(user.lastLoginAt),
                          )
                        : "ยังไม่เคยเข้าสู่ระบบ"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState
            text="บัญชีนี้ไม่มีสิทธิ์จัดการผู้ใช้"
            detail="เฉพาะผู้ดูแลระบบเท่านั้นที่เห็นรายชื่อและแก้ไขบทบาทได้"
          />
        )}
      </section>
    </div>
  );
}

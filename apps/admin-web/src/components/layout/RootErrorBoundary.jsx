import { Component } from "react";

const shellStyle = {
  minHeight: "100vh",
  display: "grid",
  placeItems: "center",
  padding: "24px",
  background: "#f3f7f5",
  color: "#18332b",
  fontFamily: "'Sarabun', system-ui, sans-serif",
};

const cardStyle = {
  width: "min(520px, 100%)",
  padding: "30px",
  border: "1px solid #dfe9e4",
  borderRadius: "18px",
  background: "#ffffff",
  boxShadow: "0 18px 60px rgba(23, 55, 44, 0.14)",
  textAlign: "center",
};

const iconStyle = {
  width: "56px",
  height: "56px",
  display: "grid",
  placeItems: "center",
  margin: "0 auto 16px",
  borderRadius: "16px",
  background: "#fff0ee",
  color: "#aa453e",
  fontSize: "25px",
  fontWeight: "700",
};

const titleStyle = {
  margin: "0",
  fontFamily: "'Prompt', system-ui, sans-serif",
  fontSize: "22px",
};

const detailStyle = {
  margin: "9px 0 0",
  color: "#6d817a",
  fontSize: "13px",
  lineHeight: "1.7",
};

const actionStyle = {
  display: "flex",
  justifyContent: "center",
  flexWrap: "wrap",
  gap: "9px",
  marginTop: "22px",
};

const primaryButtonStyle = {
  minHeight: "40px",
  padding: "9px 16px",
  border: "1px solid #0b6847",
  borderRadius: "9px",
  background: "#0b6847",
  color: "#ffffff",
  font: "700 12px 'Sarabun', system-ui, sans-serif",
  cursor: "pointer",
};

const secondaryButtonStyle = {
  minHeight: "40px",
  padding: "9px 16px",
  border: "1px solid #dfe9e4",
  borderRadius: "9px",
  background: "#ffffff",
  color: "#49625a",
  font: "700 12px 'Sarabun', system-ui, sans-serif",
  cursor: "pointer",
};

export default class RootErrorBoundary extends Component {
  constructor(props) {
    super(props);

    this.state = {
      error: null,
      errorReference: "",
    };
  }

  static getDerivedStateFromError(error) {
    return {
      error,
      errorReference: `PRMS-${Date.now()}`,
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error("PRMS root render failed:", error, errorInfo);

    try {
      sessionStorage.setItem(
        "prms_last_root_error",
        JSON.stringify({
          message:
            error instanceof Error
              ? error.message
              : String(error),
          componentStack: errorInfo?.componentStack || "",
          occurredAt: new Date().toISOString(),
        }),
      );
    } catch {
      // ไม่ให้การบันทึก log ทำให้หน้า error ล่มซ้ำ
    }
  }

  handleReload = () => {
    window.location.reload();
  };

  handleLoginAgain = () => {
    try {
      sessionStorage.removeItem("prms_access_token");
    } catch {
      // ดำเนินการต่อแม้ sessionStorage ใช้ไม่ได้
    }

    window.location.hash = "#/dashboard";
    window.location.reload();
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <main style={shellStyle} role="alert">
        <section style={cardStyle}>
          <div style={iconStyle}>!</div>

          <h1 style={titleStyle}>
            ระบบหยุดแสดงผลชั่วคราว
          </h1>

          <p style={detailStyle}>
            เกิดข้อผิดพลาดระหว่างเปลี่ยนหน้า
            ระบบป้องกันไม่ให้เว็บไซต์แสดงเป็นหน้าว่างแล้ว
            กรุณาเปิดระบบใหม่
          </p>

          <p
            style={{
              margin: "12px 0 0",
              color: "#82958e",
              fontSize: "10px",
            }}
          >
            รหัสอ้างอิง: {this.state.errorReference}
          </p>

          <div style={actionStyle}>
            <button
              type="button"
              style={primaryButtonStyle}
              onClick={this.handleReload}
            >
              เปิดระบบใหม่
            </button>

            <button
              type="button"
              style={secondaryButtonStyle}
              onClick={this.handleLoginAgain}
            >
              เข้าสู่ระบบใหม่
            </button>
          </div>
        </section>
      </main>
    );
  }
}
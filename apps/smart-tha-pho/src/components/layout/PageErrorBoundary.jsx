import { Component } from "react";

export default class PageErrorBoundary extends Component {
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
      errorReference: `PAGE-${Date.now()}`,
    };
  }

  componentDidCatch(error, errorInfo) {
    console.error("PRMS page render failed:", error, errorInfo);

    try {
      sessionStorage.setItem(
        "prms_last_page_error",
        JSON.stringify({
          page: this.props.resetKey || "",
          message:
            error instanceof Error
              ? error.message
              : String(error),
          componentStack: errorInfo?.componentStack || "",
          occurredAt: new Date().toISOString(),
        }),
      );
    } catch {
      // ไม่ให้การเก็บ log สร้าง error เพิ่ม
    }
  }

  componentDidUpdate(previousProps) {
    if (
      previousProps.resetKey !== this.props.resetKey &&
      this.state.error
    ) {
      this.setState({
        error: null,
        errorReference: "",
      });
    }
  }

  handleRetry = () => {
    this.setState({
      error: null,
      errorReference: "",
    });
  };

  handleRecover = () => {
    this.setState(
      {
        error: null,
        errorReference: "",
      },
      () => {
        if (typeof this.props.onRecover === "function") {
          this.props.onRecover();
        }
      },
    );
  };

  render() {
    if (!this.state.error) {
      return this.props.children;
    }

    return (
      <section
        className="panel page-error"
        role="alert"
        style={{
          minHeight: "340px",
          padding: "50px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          textAlign: "center",
        }}
      >
        <i
          style={{
            width: "54px",
            height: "54px",
            display: "grid",
            placeItems: "center",
            borderRadius: "16px",
            background: "#fff0ee",
            color: "#a54740",
            fontSize: "24px",
            fontStyle: "normal",
            fontWeight: "700",
          }}
        >
          !
        </i>

        <h1
          style={{
            margin: "16px 0 0",
            font: "700 21px 'Prompt', sans-serif",
          }}
        >
          หน้านี้แสดงผลไม่สำเร็จ
        </h1>

        <p
          style={{
            maxWidth: "480px",
            margin: "8px 0 0",
            color: "#6d817a",
            fontSize: "12px",
            lineHeight: "1.7",
          }}
        >
          พบข้อผิดพลาดในหน้าที่กำลังเปิด
          เมนูหลักยังสามารถใช้งานได้และเว็บไซต์จะไม่กลายเป็นหน้าว่าง
        </p>

        <small
          style={{
            marginTop: "8px",
            color: "#8a9a95",
          }}
        >
          รหัสอ้างอิง: {this.state.errorReference}
        </small>

        <div
          style={{
            display: "flex",
            justifyContent: "center",
            flexWrap: "wrap",
            gap: "8px",
            marginTop: "20px",
          }}
        >
          <button
            type="button"
            className="primary"
            onClick={this.handleRetry}
          >
            ลองเปิดหน้านี้อีกครั้ง
          </button>

          <button
            type="button"
            className="export-btn"
            onClick={this.handleRecover}
          >
            กลับหน้าภาพรวม
          </button>
        </div>
      </section>
    );
  }
}
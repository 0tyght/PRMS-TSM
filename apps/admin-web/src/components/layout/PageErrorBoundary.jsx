import { Component } from "react";

export default class PageErrorBoundary extends Component {
  state = { error:null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, details) { console.error("PRMS page render failed", error, details); }
  render() {
    if (!this.state.error) return this.props.children;
    return <section className="panel page-error" role="alert"><i>!</i><h1>หน้านี้แสดงผลไม่สำเร็จ</h1><p>ส่วนเมนูยังใช้งานได้ กรุณากลับหน้าภาพรวมแล้วลองเปิดหน้านี้ใหม่</p><button onClick={this.props.onRecover}>กลับหน้าภาพรวม</button></section>;
  }
}

let liffPromise;

function loadLiffSdk() {
  if (window.liff) return Promise.resolve(window.liff);
  if (!liffPromise) liffPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://static.line-scdn.net/liff/edge/2/sdk.js";
    script.async = true;
    script.onload = () => resolve(window.liff);
    script.onerror = () => reject(new Error("ไม่สามารถโหลด LINE LIFF ได้"));
    document.head.appendChild(script);
  });
  return liffPromise;
}

export async function connectLine(api) {
  const config = await api.get("/public/line-config");
  if (!config?.enabled || !config.liffId) throw new Error("เทศบาลยังไม่ได้เปิดใช้งาน LINE LIFF");
  const liff = await loadLiffSdk();
  await liff.init({ liffId: config.liffId, withLoginOnExternalBrowser: true });
  if (!liff.isLoggedIn()) {
    liff.login({ redirectUri: window.location.href });
    return null;
  }
  const idToken = liff.getIDToken();
  if (!idToken) throw new Error("ไม่พบข้อมูลยืนยันตัวตน LINE กรุณาอนุญาตสิทธิ์ openid");
  return api.post("/citizen/line/session", { idToken });
}

export function createApi(token) {
  async function request(path, options = {}) {
    const response = await fetch(path, {
      ...options,
      headers: { "Content-Type":"application/json", Authorization:`Bearer ${token}`, ...options.headers },
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.message || "ไม่สามารถเชื่อมต่อระบบได้");
    return body.data;
  }
  return {
    get: path => request(path),
    patch: (path, data) => request(path, { method:"PATCH", body:JSON.stringify(data) }),
    post: (path, data) => request(path, { method:"POST", body:JSON.stringify(data) }),
  };
}

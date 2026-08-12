export class WasteApplicationFacade {
  constructor({ apiClient }) {
    if (!apiClient) throw new TypeError("WasteApplicationFacade requires apiClient");
    this.apiClient = apiClient;
  }
  get(path) { return this.apiClient.get(path); }
  getPage(path) { return this.apiClient.getPage(path); }
  post(path, data) { return this.apiClient.post(path, data); }
  patch(path, data) { return this.apiClient.patch(path, data); }
  put(path, data) { return this.apiClient.put(path, data); }
  delete(path, data) { return this.apiClient.delete(path, data); }
  download(path, fileName) { return this.apiClient.download(path, fileName); }
}

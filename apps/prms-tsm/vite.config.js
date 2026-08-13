import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: process.env.GITHUB_ACTIONS
    ? "/smart-tha-pho/prms-tsm/"
    : process.env.SMART_THA_PHO_PUBLIC_SITE
      ? "/prms-tsm/"
      : "/",
  server: { proxy: { "/api": "http://localhost:4100" } },
});

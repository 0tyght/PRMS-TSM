import React from "react";
import { createRoot } from "react-dom/client";
import PortalApp from "./PortalApp.jsx";
import "./base.css";
import "./platform.css";

createRoot(document.getElementById("root")).render(<React.StrictMode><PortalApp /></React.StrictMode>);

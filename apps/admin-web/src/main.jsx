import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App.jsx";
import "./styles.css";

const rootElement=document.getElementById("root");
const fatalElement=document.getElementById("fatal-root");
const revealFatalIfRootWasCleared=()=>setTimeout(()=>{if(rootElement.childElementCount===0)fatalElement.hidden=false},0);
window.addEventListener("error",revealFatalIfRootWasCleared);
window.addEventListener("unhandledrejection",revealFatalIfRootWasCleared);
createRoot(rootElement).render(<React.StrictMode><App /></React.StrictMode>);

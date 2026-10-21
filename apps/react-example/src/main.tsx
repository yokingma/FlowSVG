import { createRoot } from "react-dom/client";
import { ShowcaseApp } from "./ShowcaseApp.js";
import "flowsvg/styles.css";
import "./style.css";

const root = document.getElementById("root");
if (!root) throw new Error("Missing React showcase root");
createRoot(root).render(<ShowcaseApp />);

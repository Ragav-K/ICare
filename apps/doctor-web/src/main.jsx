import { createRoot } from "react-dom/client";
import { ClinicalPage } from "../../shared/ClinicalPage.jsx";
import markup from "./legacy-markup.html?raw";
import "./styles.css";

createRoot(document.getElementById("root")).render(
  <ClinicalPage markup={markup} role="doctor" loadBehavior={() => import("./legacy.js")} />
);

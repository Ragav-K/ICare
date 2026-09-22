import { createElement, useEffect, useMemo, useState } from "react";
import parse, { attributesToProps, domToReact } from "html-react-parser";
import { Activity, ChevronDown, ClipboardCheck, Eye, FileText, HeartPulse, History, LogOut, ScanLine, ShieldCheck, UserRound } from "lucide-react";

const roleClasses = {
  worker: "bg-[#f4f7f7]",
  patient: "bg-[#f4f7f7]",
  doctor: "bg-[#f4f7f7]"
};

function Region({ element, children }) {
  const props = attributesToProps(element.attribs);
  return createElement(element.name, {
    ...props,
    className: `${props.className ?? ""} scroll-mt-20`.trim()
  }, children, element.attribs?.id === "workspace" ? <WorkerJourney /> : null);
}

const workerSteps = [
  ["patients", "Patient"],
  ["screening", "Screening"],
  ["result", "AI result"],
  ["reports", "Reports"]
];

function WorkerJourney() {
  const currentStep = () => {
    const route = window.location.hash.split("/")[1] || "patients";
    return route === "details" ? "patients" : route;
  };
  const [route, setRoute] = useState(currentStep);

  useEffect(() => {
    const updateRoute = () => setRoute(currentStep());
    const title = document.getElementById("roleTitle");
    const observer = title ? new MutationObserver(updateRoute) : null;
    observer?.observe(title, { childList: true });
    window.addEventListener("hashchange", updateRoute);
    return () => {
      observer?.disconnect();
      window.removeEventListener("hashchange", updateRoute);
    };
  }, []);

  return <ol className="worker-journey" aria-label="Screening progress">
    {workerSteps.map(([step, label], index) => <li key={step} aria-current={route === step ? "step" : undefined}>
      <span className="worker-journey-number">{String(index + 1).padStart(2, "0")}</span>
      <span>{label}</span>
    </li>)}
  </ol>;
}

function BrandMark({ element }) {
  const props = attributesToProps(element.attribs);
  return <div {...props} aria-hidden="true"><Eye size={22} strokeWidth={2.2} /></div>;
}

function Navigation({ element, children }) {
  const props = attributesToProps(element.attribs);
  if (element.attribs?.class?.includes("worker-account")) {
    return <nav {...props}>{children}</nav>;
  }
  return <nav {...props} className={`${props.className ?? ""} overscroll-x-contain`.trim()}>
    <span className="clinical-nav-label">Workspace</span>
    {children}
  </nav>;
}

const routeIcons = {
  patients: UserRound,
  screening: ScanLine,
  result: Activity,
  reports: FileText,
  history: History,
  guidance: HeartPulse,
  finding: ScanLine,
  review: ClipboardCheck,
  evidence: ShieldCheck
};

function RouteLink({ element, children }) {
  const props = attributesToProps(element.attribs);
  const Icon = routeIcons[element.attribs["data-route"]] ?? Activity;
  return <a {...props} className={`${props.className ?? ""} clinical-route-link group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors`.trim()}>
    <Icon aria-hidden="true" size={18} strokeWidth={1.9} />
    <span>{children}</span>
  </a>;
}

function renderElement(element) {
  if (element.type !== "tag") return undefined;
  if (element.name === "button" && element.attribs?.id === "profileBtn") {
    return <button {...attributesToProps(element.attribs)}>
      <UserRound aria-hidden="true" size={18} strokeWidth={1.9} />
      <span>Profile</span>
      <ChevronDown aria-hidden="true" size={16} strokeWidth={1.9} />
    </button>;
  }
  if (element.name === "button" && element.attribs?.id === "logoutBtn") {
    return <button {...attributesToProps(element.attribs)}>
      <LogOut aria-hidden="true" size={17} strokeWidth={1.9} />
      <span>Log out</span>
    </button>;
  }
  if (element.name === "input") {
    const props = attributesToProps(element.attribs);
    if ("value" in props) {
      props.defaultValue = props.value;
      delete props.value;
    }
    if ("checked" in props) {
      props.defaultChecked = props.checked;
      delete props.checked;
    }
    return <input {...props} />;
  }
  if (element.name === "div" && /(^|\s)(brand-mark|mark)(\s|$)/.test(element.attribs?.class ?? "")) {
    return <BrandMark element={element} />;
  }
  if (element.name === "nav") {
    return <Navigation element={element}>{domToReact(element.children, { replace: renderElement })}</Navigation>;
  }
  if (element.name === "a" && element.attribs?.["data-route"]) {
    return <RouteLink element={element}>{domToReact(element.children, { replace: renderElement })}</RouteLink>;
  }
  if (element.name === "main" || (element.name === "section" && element.attribs?.id)) {
    return <Region element={element}>{domToReact(element.children, { replace: renderElement })}</Region>;
  }
  return undefined;
}

export function ClinicalPage({ markup, role, loadBehavior }) {
  const content = useMemo(() => parse(markup, { replace: renderElement }), [markup]);

  useEffect(() => {
    void loadBehavior().catch((error) => console.error("ICare page initialization failed:", error));
  }, [loadBehavior]);

  return (
    <div className={`clinical-react-root min-h-screen text-[#213335] ${roleClasses[role]}`} data-role={role}>
      <div className="pointer-events-none fixed inset-x-0 top-0 z-50 h-[3px] bg-[#176d68]" aria-hidden="true" />
      {content}
    </div>
  );
}

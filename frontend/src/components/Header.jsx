import { NavLink } from "react-router-dom";
import ModelStatusPill from "./ModelStatusPill.jsx";

const links = [
  { to: "/", label: "Home", end: true },
  { to: "/live", label: "Live" },
  { to: "/upload", label: "Upload" },
  { to: "/metrics", label: "Metrics" },
];

export default function Header() {
  return (
    <header className="app-header">
      <div className="brand">
        <span className="dot" />
        <span>PCB Defect Detection</span>
      </div>
      <nav>
        {links.map((l) => (
          <NavLink
            key={l.to}
            to={l.to}
            end={l.end}
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            {l.label}
          </NavLink>
        ))}
      </nav>
      <ModelStatusPill />
    </header>
  );
}

/**
 * StationLogo — shows real favicon if available,
 * otherwise renders a beautiful SVG badge with station initials.
 */
import { useState } from "react";

// Generate initials from a station name (max 2-3 chars)
function getInitials(name) {
  const cleaned = name
    .replace(/FM|Radio|Bangla|Bangladesh|বাংলা|বেতার/gi, "")
    .trim();
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return name.slice(0, 2).toUpperCase();
  if (words.length === 1) return words[0].slice(0, 3).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}

// Pick a readable text color based on bg luminance
function textColor(hex) {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  return lum > 0.5 ? "#1a1a2e" : "#ffffff";
}

// SVG fallback badge (rendered inline, no external deps)
function SvgBadge({ name, color, size = 48 }) {
  const initials = getInitials(name);
  const fg = textColor(color || "#4B5563");
  const r = size / 2;
  const fontSize = initials.length > 2 ? size * 0.28 : size * 0.33;

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      xmlns="http://www.w3.org/2000/svg"
      style={{ display: "block", borderRadius: size * 0.22, flexShrink: 0 }}
    >
      <defs>
        <linearGradient id={`grad-${initials}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={color} stopOpacity="1" />
          <stop offset="100%" stopColor={color} stopOpacity="0.6" />
        </linearGradient>
        {/* Subtle wave pattern */}
        <pattern id={`wave-${initials}`} x="0" y="0" width={size} height={size} patternUnits="userSpaceOnUse">
          <rect width={size} height={size} fill={`url(#grad-${initials})`} />
          <ellipse cx={size * 0.2} cy={size * 0.8} rx={size * 0.4} ry={size * 0.2}
            fill="rgba(255,255,255,0.07)" />
          <ellipse cx={size * 0.8} cy={size * 0.3} rx={size * 0.35} ry={size * 0.18}
            fill="rgba(255,255,255,0.05)" />
        </pattern>
      </defs>

      {/* Background */}
      <rect width={size} height={size} rx={size * 0.22} fill={`url(#wave-${initials})`} />

      {/* Signal arcs (radio wave motif) */}
      <circle cx={size * 0.5} cy={size * 1.0} r={size * 0.55}
        fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth={size * 0.06} />
      <circle cx={size * 0.5} cy={size * 1.0} r={size * 0.35}
        fill="none" stroke="rgba(255,255,255,0.09)" strokeWidth={size * 0.05} />

      {/* Initials text */}
      <text
        x="50%"
        y="54%"
        textAnchor="middle"
        dominantBaseline="middle"
        fill={fg}
        fontSize={fontSize}
        fontFamily="'Hind Siliguri', Arial, sans-serif"
        fontWeight="700"
        letterSpacing="0.5"
      >
        {initials}
      </text>
    </svg>
  );
}

// Main component
export default function StationLogo({
  station,
  size = 48,
  className = "",
  style = {},
}) {
  const [faviconFailed, setFaviconFailed] = useState(false);

  const hasFavicon =
    station.favicon &&
    station.favicon !== "null" &&
    station.favicon !== "" &&
    !faviconFailed;

  if (hasFavicon) {
    return (
      <img
        src={station.favicon}
        alt={station.name}
        width={size}
        height={size}
        className={`station-real-logo ${className}`}
        style={{
          width: size,
          height: size,
          borderRadius: size * 0.22,
          objectFit: "cover",
          flexShrink: 0,
          ...style,
        }}
        onError={() => setFaviconFailed(true)}
      />
    );
  }

  return (
    <SvgBadge
      name={station.name}
      color={station.color || "#4B5563"}
      size={size}
    />
  );
}

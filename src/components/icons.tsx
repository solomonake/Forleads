// ============================================================================
// Inline SVG icon set. Emoji glyphs render differently on every OS and sit off
// the text baseline — these inherit currentColor and size predictably, so the
// nav rail, tools, and inbox rows look intentional everywhere.
// ============================================================================

import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 18, ...props }: IconProps): SVGProps<SVGSVGElement> {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    focusable: false,
    ...props,
  };
}

export function MapIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 4 3.5 6v14L9 18l6 2 5.5-2V4L15 6 9 4Z" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  );
}

export function InboxIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 5h16v14H4z" />
      <path d="m4 7 8 6 8-6" />
    </svg>
  );
}

export function LoopIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M17 3.5 20.5 7 17 10.5" />
      <path d="M20.5 7H8a4.5 4.5 0 0 0-4.5 4.5" />
      <path d="M7 20.5 3.5 17 7 13.5" />
      <path d="M3.5 17H16a4.5 4.5 0 0 0 4.5-4.5" />
    </svg>
  );
}

export function ColumnsIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="4" width="5" height="16" rx="1.2" />
      <rect x="9.5" y="4" width="5" height="11" rx="1.2" />
      <rect x="15.5" y="4" width="5" height="7" rx="1.2" />
    </svg>
  );
}

export function PlugIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M9 3v5M15 3v5" />
      <path d="M6.5 8h11v4a5.5 5.5 0 0 1-11 0V8Z" />
      <path d="M12 17.5V21" />
    </svg>
  );
}

export function ChartIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M4 20h16" />
      <path d="M6.5 16.5v-5M10.5 16.5V7M14.5 16.5v-3M18.5 16.5V4.5" />
    </svg>
  );
}

export function SatelliteIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="9" y="9" width="6" height="6" rx="1" transform="rotate(45 12 12)" />
      <path d="m6 6 2.5 2.5M18 18l-2.5-2.5M18 6l-2.5 2.5M6 18l2.5-2.5" />
      <circle cx="12" cy="12" r="10" strokeDasharray="2.5 4" />
    </svg>
  );
}

export function CrosshairIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <circle cx="12" cy="12" r="6.5" />
      <path d="M12 2.5V6M12 18v3.5M2.5 12H6M18 12h3.5" />
      <circle cx="12" cy="12" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SendIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M20.5 3.5 3.5 10l6.5 2.5L12.5 19l8-15.5Z" />
      <path d="M10 12.5 20.5 3.5" />
    </svg>
  );
}

export function MailIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="5.5" width="17" height="13" rx="2" />
      <path d="m4.5 7.5 7.5 5.5 7.5-5.5" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="m4.5 12.5 5 5L19.5 6.5" />
    </svg>
  );
}

export function CalendarIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <rect x="3.5" y="5" width="17" height="15" rx="2" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
    </svg>
  );
}

export function NoteIcon(props: IconProps) {
  return (
    <svg {...base(props)}>
      <path d="M6 3.5h9L19.5 8v12.5h-13V3.5H6Z" />
      <path d="M14.5 3.5V8h5M8.5 12h7M8.5 15.5h7" />
    </svg>
  );
}

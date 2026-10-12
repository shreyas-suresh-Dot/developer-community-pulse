import type { ReactNode, SVGProps } from "react";

/*
 * Inline stroke icons (24px grid, currentColor) so there is no icon dependency and icons inherit
 * text colour. Decorative by default (aria-hidden); meaning is always carried by adjacent text.
 */

type IconProps = { className?: string } & Omit<SVGProps<SVGSVGElement>, "children">;

function Svg({ className = "size-4", children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      className={`shrink-0 ${className}`}
      {...rest}
    >
      {children}
    </svg>
  );
}

export const ArrowUpRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 17 17 7M9 7h8v8" />
  </Svg>
);

export const ArrowDownRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 7l10 10M17 9v8H9" />
  </Svg>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Svg>
);

export const SparkleIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
    <path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8L19 15z" />
  </Svg>
);

export const MinusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 12h12" />
  </Svg>
);

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Svg>
);

export const CheckCircleIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12.5l2.7 2.7L16 9.8" />
  </Svg>
);

export const XCircleIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9 9l6 6M15 9l-6 6" />
  </Svg>
);

export const AlertIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10.3 3.9 2.6 17.2A2 2 0 0 0 4.3 20h15.4a2 2 0 0 0 1.7-2.8L13.7 3.9a2 2 0 0 0-3.4 0z" />
    <path d="M12 9v4M12 17h.01" />
  </Svg>
);

export const HalfCircleIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none" />
  </Svg>
);

export const SkipIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M8 12h8" />
  </Svg>
);

export const MailIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m3.5 6.5 8.5 6 8.5-6" />
  </Svg>
);

export const GlobeIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.6 3.8 5.6 3.8 9s-1.3 6.4-3.8 9c-2.5-2.6-3.8-5.6-3.8-9S9.5 5.6 12 3z" />
  </Svg>
);

export const ExternalIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M14 4h6v6M20 4l-9 9M18 14v4a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4" />
  </Svg>
);

export const InfoIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Svg>
);

export const EyeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="2.8" />
  </Svg>
);

export const LightbulbIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M9 18h6M10 21h4M12 3a6 6 0 0 0-3.6 10.8c.7.5 1.1 1.3 1.1 2.2h5c0-.9.4-1.7 1.1-2.2A6 6 0 0 0 12 3z" />
  </Svg>
);

export const MessageIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M20 15a2 2 0 0 1-2 2H8l-4 4V5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2z" />
  </Svg>
);

export const QuestionIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.2a2.6 2.6 0 0 1 5 .8c0 1.8-2.5 2.2-2.5 3.8M12 17h.01" />
  </Svg>
);

export const FlagIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 21V4M5 4h11l-1.5 4L16 12H5" />
  </Svg>
);

export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Svg>
);

export const PlayIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4.5v15l12-7.5z" />
  </Svg>
);

export const LoaderIcon = ({ className = "size-4", ...p }: IconProps) => (
  <Svg className={`spinner ${className}`} {...p}>
    <path d="M12 3a9 9 0 1 0 9 9" />
  </Svg>
);

export const DatabaseIcon = (p: IconProps) => (
  <Svg {...p}>
    <ellipse cx="12" cy="5.5" rx="7.5" ry="2.8" />
    <path d="M4.5 5.5v13c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8v-13M4.5 12c0 1.5 3.4 2.8 7.5 2.8s7.5-1.3 7.5-2.8" />
  </Svg>
);

export const CodeIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m8 7-5 5 5 5M16 7l5 5-5 5" />
  </Svg>
);

export const ShieldIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 3l7.5 3v5.5c0 4.4-3.1 8.2-7.5 9.5-4.4-1.3-7.5-5.1-7.5-9.5V6z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </Svg>
);

export const CalendarIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3.5" y="5" width="17" height="15.5" rx="2" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  </Svg>
);

export const TargetIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="9" />
    <circle cx="12" cy="12" r="5" />
    <circle cx="12" cy="12" r="1.2" fill="currentColor" />
  </Svg>
);

export const LinkIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M10 14a4.5 4.5 0 0 0 6.4 0l3-3a4.5 4.5 0 0 0-6.4-6.4l-1 1" />
    <path d="M14 10a4.5 4.5 0 0 0-6.4 0l-3 3a4.5 4.5 0 0 0 6.4 6.4l1-1" />
  </Svg>
);

export const ContextIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7V5a1 1 0 0 1 1-1h2M17 4h2a1 1 0 0 1 1 1v2M20 17v2a1 1 0 0 1-1 1h-2M7 20H5a1 1 0 0 1-1-1v-2" />
    <path d="M8.5 12h7" />
  </Svg>
);

export const PulseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M3 12h4l2.5-6 4 12 2.5-6h5" />
  </Svg>
);

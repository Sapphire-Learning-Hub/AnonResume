import type { PropsWithChildren } from "react";

type InlineIconProps = {
  className?: string;
  size?: number;
};

function InlineIcon({ children, className, size = 16 }: PropsWithChildren<InlineIconProps>) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      focusable="false"
      height={size}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width={size}
    >
      {children}
    </svg>
  );
}

export function WorkspaceBackIcon(props: InlineIconProps) {
  return (
    <InlineIcon {...props}>
      <path d="M10 5 3 12l7 7" />
      <path d="M4 12h17" />
    </InlineIcon>
  );
}

export function CodeIcon(props: InlineIconProps) {
  return (
    <InlineIcon {...props}>
      <path
        d="M24.96 483.712l211.2-211.2 60.352 60.352-150.848 150.848 150.848 150.848-60.352 60.352-211.2-211.2z m349.952 372.416 191.36-765.44 82.816 20.672-191.36 765.44-82.816-20.672z m352.576-221.568 150.848-150.848L727.488 332.8l60.352-60.352 211.2 211.2-211.2 211.2-60.352-60.352z"
        fill="currentColor"
        stroke="none"
        transform="scale(0.0234375)"
      />
    </InlineIcon>
  );
}

export function LinkIcon(props: InlineIconProps) {
  return (
    <InlineIcon {...props}>
      <path d="m10 14 4-4" />
      <path d="m7.5 16.5-1 1a3.5 3.5 0 0 1-5-5l3-3a3.5 3.5 0 0 1 5 0" />
      <path d="m16.5 7.5 1-1a3.5 3.5 0 0 1 5 5l-3 3a3.5 3.5 0 0 1-5 0" />
    </InlineIcon>
  );
}

export function CloseIcon(props: InlineIconProps) {
  return (
    <InlineIcon {...props}>
      <path d="m6 6 12 12" />
      <path d="m18 6-12 12" />
    </InlineIcon>
  );
}

export function HelpIcon(props: InlineIconProps) {
  return (
    <InlineIcon {...props}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.8 9.4a2.4 2.4 0 1 1 4.2 1.6c-.8.8-1.8 1.3-1.8 2.6" />
      <path d="M12.2 16.8h.01" />
    </InlineIcon>
  );
}

export function SearchIcon(props: InlineIconProps) {
  return (
    <InlineIcon {...props}>
      <circle cx="10.5" cy="10.5" r="5.75" />
      <path d="m15 15 4.25 4.25" />
    </InlineIcon>
  );
}

export function UndoIcon(props: InlineIconProps) {
  return (
    <InlineIcon {...props}>
      <path d="M9 7 4 12l5 5" />
      <path d="M5 12h8.5a5.5 5.5 0 0 1 5.5 5.5" />
    </InlineIcon>
  );
}

export function RedoIcon(props: InlineIconProps) {
  return (
    <InlineIcon {...props}>
      <path d="m15 7 5 5-5 5" />
      <path d="M19 12h-8.5A5.5 5.5 0 0 0 5 17.5" />
    </InlineIcon>
  );
}

export function ZoomOutIcon(props: InlineIconProps) {
  return (
    <InlineIcon {...props}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M7.5 10.5h6" />
      <path d="m15 15 4.5 4.5" />
    </InlineIcon>
  );
}

export function ZoomInIcon(props: InlineIconProps) {
  return (
    <InlineIcon {...props}>
      <circle cx="10.5" cy="10.5" r="6" />
      <path d="M7.5 10.5h6M10.5 7.5v6" />
      <path d="m15 15 4.5 4.5" />
    </InlineIcon>
  );
}

export function ZoomResetIcon(props: InlineIconProps) {
  return (
    <InlineIcon {...props}>
      <path d="M5.5 8.5A7 7 0 1 1 5 14" />
      <path d="M5.5 4.5v4h4" />
      <path d="M10 9.5h2v5" />
    </InlineIcon>
  );
}

export function HomeIcon(props: InlineIconProps) {
  return (
    <InlineIcon {...props}>
      <path d="m4 10 8-6 8 6" />
      <path d="M6.5 9v10h11V9M10 19v-5h4v5" />
    </InlineIcon>
  );
}

export function InsertIcon(props: InlineIconProps) {
  return (
    <InlineIcon {...props}>
      <path d="M12 4v16M4 12h16" />
    </InlineIcon>
  );
}

export function LayoutIcon(props: InlineIconProps) {
  return (
    <InlineIcon {...props}>
      <rect height="16" rx="1.5" width="18" x="3" y="4" />
      <path d="M8 4v16M8 9h13" />
    </InlineIcon>
  );
}

export function DocumentIcon(props: InlineIconProps) {
  return (
    <InlineIcon {...props}>
      <path d="M6 3h8l4 4v14H6z" />
      <path d="M14 3v5h4M9 12h6M9 16h6" />
    </InlineIcon>
  );
}

export function PropertiesIcon(props: InlineIconProps) {
  return (
    <InlineIcon {...props}>
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
      <circle cx="16" cy="7" r="2" />
      <circle cx="8" cy="17" r="2" />
    </InlineIcon>
  );
}

export function EnterFullscreenIcon(props: InlineIconProps) {
  return (
    <InlineIcon {...props}>
      <path d="M9 4H4v5M15 4h5v5M20 15v5h-5M9 20H4v-5" />
    </InlineIcon>
  );
}

export function ExitFullscreenIcon(props: InlineIconProps) {
  return (
    <InlineIcon {...props}>
      <path d="M4 9h5V4M20 9h-5V4M15 20v-5h5M9 20v-5H4" />
    </InlineIcon>
  );
}

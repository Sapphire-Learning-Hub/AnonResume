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

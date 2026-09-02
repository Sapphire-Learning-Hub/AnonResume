import type { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    absolute: "AnonResume",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function PrivateAppLayout({ children }: LayoutProps<"/app">) {
  return children;
}

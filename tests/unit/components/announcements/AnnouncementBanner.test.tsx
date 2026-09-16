import { fireEvent, render, screen } from "@testing-library/react";

import { AnnouncementBanner } from "@/components/announcements/AnnouncementBanner";
import type { LocalizedAnnouncement } from "@/lib/announcements/rules";

const announcements: LocalizedAnnouncement[] = [
  {
    id: "warning",
    title: "版本提示",
    body: "当前版本仍在持续完善。",
    tone: "warning",
    dismissible: true,
  },
  {
    id: "critical",
    title: "维护通知",
    body: "今晚将进行短时维护。",
    tone: "critical",
    dismissible: false,
  },
];

describe("AnnouncementBanner", () => {
  it("pages through visible announcements one at a time", () => {
    render(<AnnouncementBanner announcements={announcements} />);

    expect(screen.getByText("版本提示")).toBeInTheDocument();
    expect(screen.queryByText("维护通知")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "下一条公告" }));

    expect(screen.getByText("维护通知")).toBeInTheDocument();
    expect(screen.queryByText("版本提示")).not.toBeInTheDocument();
  });

  it("dismisses only the current announcement for the mounted session", () => {
    render(<AnnouncementBanner announcements={announcements} />);

    fireEvent.click(screen.getByRole("button", { name: "关闭公告" }));

    expect(screen.queryByText("版本提示")).not.toBeInTheDocument();
    expect(screen.getByText("维护通知")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "关闭公告" }),
    ).not.toBeInTheDocument();
  });

  it("renders nothing when there are no announcements", () => {
    const { container } = render(<AnnouncementBanner announcements={[]} />);

    expect(container).toBeEmptyDOMElement();
  });
});

import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { StatusPill } from "@/components/StatusPill";
import type { TranslatorStatus } from "@/lib/translator";

const ALL_STATUSES: Array<{ status: TranslatorStatus; label: string }> = [
  { status: "idle", label: "Idle" },
  { status: "connecting", label: "Connecting…" },
  { status: "live", label: "Live" },
  { status: "reconnecting", label: "Reconnecting…" },
  { status: "delayed", label: "Delayed" },
  { status: "unavailable", label: "Unavailable" },
  { status: "closed", label: "Closed" },
  { status: "error", label: "Error" },
];

describe("StatusPill", () => {
  it.each(ALL_STATUSES)("renders label '$label' for status '$status'", ({ status, label }) => {
    render(<StatusPill status={status} />);
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it("renders the status indicator dot", () => {
    const { container } = render(<StatusPill status="live" />);
    // The dot is the span with rounded-full h-2 w-2
    const dot = container.querySelector(".h-2.w-2.rounded-full");
    expect(dot).toBeInTheDocument();
  });

  it("animates the dot for connecting state", () => {
    const { container } = render(<StatusPill status="connecting" />);
    const dot = container.querySelector(".animate-pulse");
    expect(dot).toBeInTheDocument();
  });

  it("animates the dot for reconnecting state", () => {
    const { container } = render(<StatusPill status="reconnecting" />);
    const dot = container.querySelector(".animate-pulse");
    expect(dot).toBeInTheDocument();
  });

  it("animates the dot for delayed state", () => {
    const { container } = render(<StatusPill status="delayed" />);
    const dot = container.querySelector(".animate-pulse");
    expect(dot).toBeInTheDocument();
  });

  it("does not animate the dot for live state", () => {
    const { container } = render(<StatusPill status="live" />);
    const dot = container.querySelector(".animate-pulse");
    expect(dot).not.toBeInTheDocument();
  });

  it("does not animate the dot for error state", () => {
    const { container } = render(<StatusPill status="error" />);
    const dot = container.querySelector(".animate-pulse");
    expect(dot).not.toBeInTheDocument();
  });
});

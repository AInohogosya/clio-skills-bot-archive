/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import React, { useState } from "react";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { SettingsDialog } from "./SettingsDialog";
import type { RoutingMode } from "@/lib/experienceSettings";

function Harness() {
  const [mode, setMode] = useState<RoutingMode>("auto");
  return <ThemeProvider defaultTheme="light" switchable><SettingsDialog open onOpenChange={() => {}} routingMode={mode} onRoutingModeChange={setMode} /></ThemeProvider>;
}

afterEach(() => {
  cleanup();
  document.documentElement.classList.remove("dark");
  localStorage.clear();
});

describe("SettingsDialog", () => {
  it("switches the actual document to dark mode", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("switch", { name: "ダークモードを切り替える" }));
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(screen.getByRole("button", { name: /ダーク/ }).className).toContain("theme-active");
  });

  it("switches auto routing to review mode in the rendered dialog", async () => {
    const user = userEvent.setup();
    render(<Harness />);
    await user.click(screen.getByRole("switch", { name: "完全自動ルーティングを切り替える" }));
    expect(screen.getByText(/REVIEW MODE/)).toBeTruthy();
    expect(screen.getByRole("switch", { name: "完全自動ルーティングを切り替える" }).getAttribute("data-state")).toBe("unchecked");
  });
});

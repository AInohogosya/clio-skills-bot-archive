/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import React from "react";
import { ThemeProvider } from "@/contexts/ThemeContext";

const candidates = [
  { id: "greeting", name: "Greeting", response: "Hello from Greeting", tokens: 6, elapsedMs: 1 },
  { id: "ddgs_chatbot", name: "DDGS Chatbot", response: "Search answer", tokens: 4, elapsedMs: 2 },
];

vi.mock("@/lib/trpc", () => ({
  trpc: {
    skills: {
      run: {
        useMutation: () => ({
          mutate: (_input: unknown, callbacks: { onSuccess: (result: unknown) => void }) => callbacks.onSuccess({ matchedSkills: ["greeting", "ddgs_chatbot"], candidates }),
        }),
      },
    },
  },
}));

import Home from "./Home";

if (!HTMLElement.prototype.setPointerCapture) {
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", { value: () => {} });
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", { value: () => {} });
  Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", { value: () => false });
}

function renderHome() {
  return render(<ThemeProvider defaultTheme="light" switchable><Home /></ThemeProvider>);
}

const scrollIntoView = vi.fn();
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { configurable: true, value: scrollIntoView });

afterEach(() => {
  cleanup();
  scrollIntoView.mockClear();
  localStorage.clear();
  document.documentElement.classList.remove("dark");
  window.history.replaceState({}, "", "/");
});

describe("Home routing modes", () => {
  it("lists the three new practical skills in the atlas", () => {
    renderHome();
    expect(screen.getByText("Date Planner")).toBeTruthy();
    expect(screen.getByText("Unit Converter")).toBeTruthy();
    expect(screen.getByText("JSON Toolkit")).toBeTruthy();
  });

  it("inserts newly available skills without reordering a saved registry", async () => {
    localStorage.setItem("clio-skill-registry", JSON.stringify([
      { id: "ddgs", active: true },
      { id: "greeting", active: true },
      { id: "wikipedia", active: true },
      { id: "calc", active: true },
      { id: "joke", active: true },
      { id: "valves_test", active: true },
      { id: "ddgs_chatbot", active: true },
    ]));
    renderHome();
    await waitFor(() => expect(screen.getByText("Date Planner")).toBeTruthy());
    const searchCard = screen.getByText("DDGS Search").closest("article")!;
    const greetingCard = screen.getByText("Greeting").closest("article")!;
    const dateCard = screen.getByText("Date Planner").closest("article")!;
    const calculatorCard = screen.getByText("Calculator").closest("article")!;
    expect(searchCard.compareDocumentPosition(greetingCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(dateCard.compareDocumentPosition(calculatorCard) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("scrolls the newest user and skill messages into view", async () => {
    const user = userEvent.setup();
    renderHome();
    scrollIntoView.mockClear();
    await user.type(screen.getByRole("textbox", { name: "メッセージ" }), "hello");
    await user.click(screen.getByRole("button", { name: "送信" }));
    await waitFor(() => expect(screen.getByText("Greeting · Auto selected")).toBeTruthy());
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth", block: "end" }));
  });

  it("auto-scrolls after sending on desktop", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1280 });
    const user = userEvent.setup();
    renderHome();
    scrollIntoView.mockClear();
    await user.type(screen.getByRole("textbox", { name: "メッセージ" }), "hello");
    await user.click(screen.getByRole("button", { name: "送信" }));
    await waitFor(() => expect(screen.getByText("Greeting · Auto selected")).toBeTruthy());
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth", block: "end" }));
  });

  it("auto-scrolls after sending on mobile", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
    const user = userEvent.setup();
    renderHome();
    scrollIntoView.mockClear();
    await user.type(screen.getByRole("textbox", { name: "メッセージ" }), "hello");
    await user.click(screen.getByRole("button", { name: "送信" }));
    await waitFor(() => expect(screen.getByText("Greeting · Auto selected")).toBeTruthy());
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ behavior: "smooth", block: "end" }));
  });

  it("auto-selects the highest-priority result when several skills match", async () => {
    const user = userEvent.setup();
    renderHome();
    await user.type(screen.getByRole("textbox", { name: "メッセージ" }), "hello");
    await user.click(screen.getByRole("button", { name: "送信" }));
    await waitFor(() => expect(screen.getByText("Greeting · Auto selected")).toBeTruthy());
    expect(screen.queryByText(/SKILLS MATCHED/)).toBeNull();
  });

  it("shows the candidate picker in manual review mode", async () => {
    localStorage.setItem("clio-routing-mode", "manual");
    const user = userEvent.setup();
    renderHome();
    await waitFor(() => expect(screen.getByText("Review candidates manually")).toBeTruthy());
    await user.type(screen.getByRole("textbox", { name: "メッセージ" }), "hello");
    await user.click(screen.getByRole("button", { name: "送信" }));
    await waitFor(() => expect(screen.getByText(/2 SKILLS MATCHED/)).toBeTruthy());
    expect(screen.getByRole("button", { name: /この結果を採用/ })).toBeTruthy();
  });

  it("opens settings dialog from the settings query parameter", async () => {
    window.history.replaceState({}, "", "/?settings=open");
    renderHome();
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.getByText("環境設定")).toBeTruthy();
  });

  it("opens a mobile-friendly skill atlas with toggles and priority controls", async () => {
    const user = userEvent.setup();
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 375 });
    renderHome();
    await user.click(screen.getByRole("button", { name: "スキルアトラスを開く" }));
    expect(await screen.findByText("使える知性を整える")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Greetingを無効にする" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Greetingの優先順位を下げる" })).toBeTruthy();
  });

  it("keeps message sending and atlas settings reachable at 430px", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 430 });
    const user = userEvent.setup();
    renderHome();
    await user.type(screen.getByRole("textbox", { name: "メッセージ" }), "hello");
    await user.click(screen.getByRole("button", { name: "送信" }));
    await waitFor(() => expect(screen.getByText("Greeting · Auto selected")).toBeTruthy());
    await user.click(screen.getByRole("button", { name: "スキルアトラスを開く" }));
    await user.click(await screen.findByRole("button", { name: "実行設定" }));
    expect(await screen.findByText("環境設定")).toBeTruthy();
  });

  it("allows tablet users to toggle skills and change routing from the atlas", async () => {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 768 });
    const user = userEvent.setup();
    renderHome();
    await user.click(screen.getByRole("button", { name: "スキルアトラスを開く" }));
    const disableButtons = await screen.findAllByRole("button", { name: "Greetingを無効にする" });
    await user.click(disableButtons.at(-1)!);
    expect(await screen.findByRole("button", { name: "Greetingを有効にする" })).toBeTruthy();
    await user.click(screen.getByRole("button", { name: "実行設定" }));
    await user.click(screen.getByRole("switch", { name: "完全自動ルーティングを切り替える" }));
    expect(screen.getByText(/REVIEW MODE/)).toBeTruthy();
  });
});

import { useTheme } from "@/contexts/ThemeContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch as SettingSwitch } from "@/components/ui/switch";
import { Moon, Sun, Wand2 } from "lucide-react";
import type { RoutingMode } from "@/lib/experienceSettings";
import React from "react";

type SettingsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  routingMode: RoutingMode;
  onRoutingModeChange: (mode: RoutingMode) => void;
};

export function SettingsDialog({ open, onOpenChange, routingMode, onRoutingModeChange }: SettingsDialogProps) {
  const { theme, toggleTheme } = useTheme();
  const isAuto = routingMode === "auto";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="settings-dialog">
        <DialogHeader className="settings-header">
          <p className="eyebrow">PERSONAL WORKBENCH</p>
          <DialogTitle>環境設定</DialogTitle>
          <DialogDescription>Clioの見た目と、スキルを採用するタイミングをこの端末に保存します。</DialogDescription>
        </DialogHeader>
        <div className="settings-stack">
          <section className="settings-section">
            <div className="settings-section-title">
              <span className="settings-icon">{theme === "dark" ? <Moon size={17} /> : <Sun size={17} />}</span>
              <div><b>テーマ</b><p>作業机の明るさを切り替えます。</p></div>
              <SettingSwitch checked={theme === "dark"} onCheckedChange={() => toggleTheme?.()} aria-label="ダークモードを切り替える" />
            </div>
            <div className="theme-choice">
              <button className={theme === "light" ? "theme-active" : ""} onClick={() => theme === "dark" && toggleTheme?.()}><Sun size={14} /> ライト</button>
              <button className={theme === "dark" ? "theme-active" : ""} onClick={() => theme === "light" && toggleTheme?.()}><Moon size={14} /> ダーク</button>
            </div>
          </section>
          <section className="settings-section">
            <div className="settings-section-title">
              <span className="settings-icon"><Wand2 size={17} /></span>
              <div><b>完全自動ルーティング</b><p>複数候補でも、優先順位が最上位のスキルをすぐに採用します。</p></div>
              <SettingSwitch checked={isAuto} onCheckedChange={(checked) => onRoutingModeChange(checked ? "auto" : "manual")} aria-label="完全自動ルーティングを切り替える" />
            </div>
            <div className={`routing-mode-card ${isAuto ? "routing-mode-auto" : ""}`}><i /> <span>{isAuto ? "AUTO MODE · Clioが自動で判断します" : "REVIEW MODE · 実行前に候補を比較します"}</span></div>
          </section>
          <section className="settings-section settings-footnote"><p>自動採用では、右のアトラスで設定した優先順位と有効状態がそのまま使われます。</p></section>
        </div>
      </DialogContent>
    </Dialog>
  );
}

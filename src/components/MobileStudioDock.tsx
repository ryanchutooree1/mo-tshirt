"use client";

import { ClipboardCheck, ImagePlus, Shirt, Type } from "lucide-react";

export type MobileStudioTool = "fabric" | "graphics" | "text" | "order";

type MobileStudioDockProps = {
  activeTool: MobileStudioTool;
  expanded: boolean;
  onSelect: (tool: MobileStudioTool) => void;
};

const TOOLS = [
  { id: "fabric" as const, label: "Product", icon: Shirt },
  { id: "graphics" as const, label: "Image", icon: ImagePlus },
  { id: "text" as const, label: "Text", icon: Type },
  { id: "order" as const, label: "Order", icon: ClipboardCheck },
];

export function MobileStudioDock({ activeTool, expanded, onSelect }: MobileStudioDockProps) {
  return (
    <nav
      className="grid grid-cols-4 rounded-[24px] border border-white/10 bg-[#202020]/96 px-1 py-1.5 text-white shadow-[0_20px_48px_rgba(0,0,0,.32)] backdrop-blur-xl"
      aria-label="Mobile design tools"
    >
      {TOOLS.map((tool) => {
        const Icon = tool.icon;
        const isActive = expanded && activeTool === tool.id;
        return (
          <button
            key={tool.id}
            type="button"
            onClick={() => onSelect(tool.id)}
            aria-pressed={isActive}
            className={`flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-[18px] px-0.5 transition active:scale-95 ${
              isActive ? "bg-white/10 text-white" : "text-white/45"
            }`}
          >
            <Icon className={`h-5 w-5 ${isActive ? "stroke-[2.5]" : ""}`} />
            <span className="text-[8px] font-semibold">{tool.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

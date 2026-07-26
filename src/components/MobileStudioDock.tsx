"use client";

import { Camera, ImagePlus, Shirt, Sparkles } from "lucide-react";

export type MobileStudioTool = "fabric" | "graphics" | "background" | "camera";

type MobileStudioDockProps = {
  activeTool: MobileStudioTool;
  onSelect: (tool: MobileStudioTool) => void;
};

const TOOLS = [
  { id: "fabric" as const, label: "Fabric", icon: Shirt },
  { id: "graphics" as const, label: "Graphics", icon: ImagePlus },
  { id: "background" as const, label: "Background", icon: Sparkles },
  { id: "camera" as const, label: "Camera", icon: Camera },
];

export function MobileStudioDock({ activeTool, onSelect }: MobileStudioDockProps) {
  return (
    <nav
      className="grid grid-cols-4 rounded-[26px] border border-white/10 bg-[#202020]/96 px-1.5 py-2 text-white shadow-[0_20px_48px_rgba(0,0,0,.32)] backdrop-blur-xl"
      aria-label="Mobile design tools"
    >
      {TOOLS.map((tool) => {
        const Icon = tool.icon;
        const isActive = activeTool === tool.id;
        return (
          <button
            key={tool.id}
            type="button"
            onClick={() => onSelect(tool.id)}
            aria-current={isActive ? "page" : undefined}
            className={`flex min-h-[62px] flex-col items-center justify-center gap-1 rounded-[20px] px-1 transition active:scale-95 ${
              isActive ? "bg-white/10 text-white" : "text-white/45"
            }`}
          >
            <Icon className={`h-6 w-6 ${isActive ? "stroke-[2.4]" : ""}`} />
            <span className="text-[10px] font-semibold">{tool.label}</span>
          </button>
        );
      })}
    </nav>
  );
}

import React, { useState, useRef, useEffect } from "react";
import { Sparkles, Trash2, RefreshCw, PlusCircle, Palette, Send } from "lucide-react";
import { Rect, Point } from "../types/canvas";

interface SelectionPromptBarProps {
  bounds: Rect | null;
  zoom: number;
  pan: Point;
  onGenerate: (prompt: string, action: string) => void;
}

const QUICK_ACTIONS = [
  { id: "remove", label: "Remove", icon: Trash2 },
  { id: "replace", label: "Replace...", icon: RefreshCw },
  { id: "add", label: "Add Element...", icon: PlusCircle },
  { id: "material", label: "Change Material...", icon: Palette },
];

export const SelectionPromptBar: React.FC<SelectionPromptBarProps> = ({
  bounds,
  zoom,
  pan,
  onGenerate,
}) => {
  const [prompt, setPrompt] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 80);
  }, [bounds]);

  if (!bounds) return null;

  const selBottom = bounds.y * zoom + pan.y + bounds.height * zoom;
  const selLeft = bounds.x * zoom + pan.x;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
    const lower = prompt.toLowerCase();
    let action = "replace";
    if (lower.includes("remove") || lower.includes("delete") || lower.includes("erase")) action = "remove";
    else if (lower.includes("add") || lower.includes("place") || lower.includes("insert")) action = "add";
    else if (lower.includes("material") || lower.includes("texture") || lower.includes("finish")) action = "material";
    onGenerate(prompt, action);
  };

  return (
    <div
      style={{
        position: "absolute",
        top: `${Math.max(4, selBottom + 10)}px`,
        left: `${Math.max(4, selLeft)}px`,
        width: "400px",
        maxWidth: "calc(100% - 16px)",
        zIndex: 35,
      }}
      className="bg-slate-900/98 border border-indigo-500/50 rounded-xl shadow-2xl backdrop-blur-md animate-in fade-in duration-150"
      onMouseDown={e => e.stopPropagation()}
    >
      {/* Quick Action Pills */}
      <div className="flex items-center gap-1 px-2 pt-2 pb-1 border-b border-slate-800/60">
        {QUICK_ACTIONS.map(action => {
          const Icon = action.icon;
          return (
            <button
              key={action.id}
              type="button"
              onClick={() => onGenerate("", action.id)}
              className="px-2 py-1 rounded-md text-[10px] font-semibold text-slate-400 hover:text-white hover:bg-slate-800 flex items-center gap-1 transition-all cursor-pointer"
            >
              <Icon size={10} />
              <span>{action.label}</span>
            </button>
          );
        })}
      </div>
      {/* Free-text Prompt Input */}
      <form onSubmit={handleSubmit} className="flex items-center gap-2 px-2.5 py-2">
        <Sparkles size={13} className="text-indigo-400 shrink-0" />
        <input
          ref={inputRef}
          type="text"
          value={prompt}
          onChange={e => setPrompt(e.target.value)}
          placeholder="What do you want to do with this selection?"
          className="flex-1 bg-transparent text-[11px] text-slate-200 placeholder-slate-500 outline-none border-none"
        />
        <button
          type="submit"
          disabled={!prompt.trim()}
          className="p-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-30 text-white transition-all cursor-pointer shrink-0"
          title="Generate with AI"
        >
          <Send size={11} />
        </button>
      </form>
    </div>
  );
};

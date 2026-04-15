"use client";

import React, { useState } from "react";
import { Check, X } from "lucide-react";

interface TodoListProps {
  title?: string;
}

export function TodoList({ title = "Todo List" }: TodoListProps) {
  const [items, setItems] = useState<{ id: number; text: string; done: boolean }[]>([
    { id: 1, text: "Build stream renderer", done: true },
    { id: 2, text: "Add React live preview", done: true },
    { id: 3, text: "Ship to production", done: false },
  ]);
  const [input, setInput] = useState("");

  const add = () => {
    if (!input.trim()) return;
    setItems((prev) => [...prev, { id: Date.now(), text: input.trim(), done: false }]);
    setInput("");
  };

  return (
    <div className="p-5 rounded-2xl border border-border bg-card/50 backdrop-blur-sm space-y-3">
      <h3 className="text-[10px] font-black uppercase tracking-widest text-muted-foreground/60">
        {title}
      </h3>

      <ul className="space-y-1.5">
        {items.map((item) => (
          <li
            key={item.id}
            className="flex items-center gap-2 group py-1 px-2 rounded-lg hover:bg-muted/50 transition-colors"
          >
            <button
              type="button"
              onClick={() =>
                setItems((prev) =>
                  prev.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)),
                )
              }
              className={`w-5 h-5 rounded-md border flex items-center justify-center transition-all shrink-0 ${
                item.done
                  ? "bg-primary/20 border-primary/40 text-primary"
                  : "border-border hover:border-primary/40"
              }`}
            >
              {item.done && <Check size={12} strokeWidth={3} />}
            </button>
            <span
              className={`text-sm flex-1 ${item.done ? "line-through text-muted-foreground/50" : ""}`}
            >
              {item.text}
            </span>
            <button
              type="button"
              onClick={() => setItems((prev) => prev.filter((i) => i.id !== item.id))}
              className="opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-destructive transition-all"
            >
              <X size={14} />
            </button>
          </li>
        ))}
      </ul>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="flex gap-2"
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Add item..."
          className="flex-1 px-3 py-1.5 rounded-lg bg-muted/50 border border-border text-sm focus:outline-none focus:ring-1 focus:ring-primary/40"
        />
        <button
          type="submit"
          className="px-3 py-1.5 rounded-lg bg-primary/20 text-primary text-sm font-bold hover:bg-primary/30 transition-all active:scale-95"
        >
          Add
        </button>
      </form>
    </div>
  );
}

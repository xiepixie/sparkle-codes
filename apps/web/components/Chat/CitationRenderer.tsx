"use client";

import React from "react";
import { ChatMarkdown } from "./ChatMarkdown";

interface Citation {
  id: number;
  title: string;
  slug: string;
  heading?: string;
  headingId?: string;
}

interface CitationRendererProps {
  text: string;
  citations: Citation[];
}

export function CitationRenderer({ text, citations }: CitationRendererProps) {
  return <ChatMarkdown text={text} citations={citations} />;
}

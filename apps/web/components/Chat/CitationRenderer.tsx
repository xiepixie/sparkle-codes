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
	onLinkClick?: (url: string) => void;
}

export function CitationRenderer({
	text,
	citations,
	onLinkClick,
}: CitationRendererProps) {
	return (
		<ChatMarkdown text={text} citations={citations} onLinkClick={onLinkClick} />
	);
}

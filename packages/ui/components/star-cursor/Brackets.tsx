"use client";
import { memo } from "react";

/**
 * Brackets - Decorative corners that frame the cursor during interaction.
 * These respond to the .is-snapped state via CSS.
 */
function BracketsInner() {
	return (
		<div className="cursor-brackets">
			<div className="cursor-corner corner-tl" />
			<div className="cursor-corner corner-tr" />
			<div className="cursor-corner corner-bl" />
			<div className="cursor-corner corner-br" />
		</div>
	);
}

export const Brackets = memo(BracketsInner);
export default Brackets;

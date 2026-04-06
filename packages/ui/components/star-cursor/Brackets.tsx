"use client";

import { memo } from "react";

/**
 * Brackets - Precision Framing for Interactive Elements.
 */
function BracketsInner() {
    return (
        <div className="cursor-brackets">
            <div className="cursor-frame-sheen" />

            <div className="cursor-corner corner-tl">
                <span className="cursor-corner-node" />
            </div>
            <div className="cursor-corner corner-tr">
                <span className="cursor-corner-node" />
            </div>
            <div className="cursor-corner corner-bl">
                <span className="cursor-corner-node" />
            </div>
            <div className="cursor-corner corner-br">
                <span className="cursor-corner-node" />
            </div>
        </div>
    );
}

const MemoizedBrackets = memo(BracketsInner);

/**
 * FINAL FIX: Explicit function declaration as default export for Turbopack stability.
 */
export default function Brackets() {
    return <MemoizedBrackets />;
}

export { Brackets };

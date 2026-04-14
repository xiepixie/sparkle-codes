"use client";

import { memo, useEffect, useState } from "react";

/**
 * StarIcon - Theme-agnostic icon glyph.
 * 
 * UPGRADE: Replaced text character with SVG for better filter/gradient control
 * and added Celestial Gold support.
 */
function StarIconInner({ theme, isGold }: { theme?: string; isGold?: boolean }) {
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const StarSVG = ({ color }: { color: string }) => (
        <svg 
            width="24" 
            height="24" 
            viewBox="0 0 24 24" 
            fill="none" 
            xmlns="http://www.w3.org/2000/svg"
            className="cursor-point-svg"
            role="img"
            aria-labelledby="star-icon-title"
        >
            <title id="star-icon-title">Star Icon</title>
            {/* Main Sparkle Shape */}
            <path 
                d="M12 2C12 2 12.5 8 16 11.5C19.5 15 22 15.5 22 15.5C22 15.5 16 16 12 20C8 16 2 15.5 2 15.5C2 15.5 4.5 15 8 11.5C11.5 8 12 2 12 2Z" 
                fill={color}
            />
            {/* Center Core */}
            <circle cx="12" cy="11.5" r="1.5" fill="white" fillOpacity="0.8" />
        </svg>
    );

    if (!mounted) {
        return (
            <div className="cursor-point-placeholder" suppressHydrationWarning>
                ✦
            </div>
        );
    }

    if (isGold) {
        return <StarSVG color="#FFD700" />;
    }

    return (
        <StarSVG color={theme === 'dark' ? '#A594F9' : '#513BB2'} />
    );
}

const MemoizedStarIcon = memo(StarIconInner);

export default function StarIcon({ theme, isGold }: { theme?: string; isGold?: boolean }) {
    return <MemoizedStarIcon theme={theme} isGold={isGold} />;
}

export { StarIcon };

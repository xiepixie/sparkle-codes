"use client";

import { useRef, useState, useEffect } from "react";

export function useSimulationStream(onUpdate: (text: string) => void) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [speed, setSpeed] = useState(30);
  
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const fullTextRef = useRef("");
  const indexRef = useRef(0);

  const startStream = (text: string) => {
    fullTextRef.current = text;
    indexRef.current = 0;
    setIsPlaying(true);
  };

  const pauseStream = () => {
    setIsPlaying(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
    }
  };

  const resetStream = () => {
    pauseStream();
    indexRef.current = 0;
    onUpdate("");
  };

  useEffect(() => {
    if (isPlaying) {
      timerRef.current = setInterval(() => {
        if (indexRef.current < fullTextRef.current.length) {
          // 模拟分块输出
          const nextIndex = Math.min(indexRef.current + 2, fullTextRef.current.length);
          const chunk = fullTextRef.current.slice(0, nextIndex);
          indexRef.current = nextIndex;
          onUpdate(chunk);
        } else {
          setIsPlaying(false);
          if (timerRef.current) {
            clearInterval(timerRef.current);
          }
        }
      }, speed);
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [isPlaying, speed, onUpdate]);

  return {
    isPlaying,
    speed,
    setSpeed,
    index: indexRef.current,
    total: fullTextRef.current.length,
    startStream,
    pauseStream,
    resetStream
  };
}

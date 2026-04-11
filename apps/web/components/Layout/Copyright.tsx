"use client";

import { useEffect, useState } from "react";

/**
 * Copyright component (Client-side hydration)
 * 
 * 为什么这样做：
 * - 在 Next.js 15+ 的 Server Component 中使用 new Date() 会导致预渲染错误（PRERENDER_CURRENT_TIME）。
 * - 通过将年份显示移入 Client Component，我们可以保持父组件（HomePage）是静态的，
 *   同时在客户端获得准确的当前年份。
 */
export function Copyright({ author = "xpx" }: { author?: string }) {
	const [year, setYear] = useState<number | string>("");

	useEffect(() => {
		setYear(new Date().getFullYear());
	}, []);

	return (
		<p className="col-span-2 sm:col-auto sm:ml-8 text-[0.9rem] font-normal text-muted-foreground/40">
			© {year || "2026"} {author}.
		</p>
	);
}

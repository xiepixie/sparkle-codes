import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * 核心类名合并工具
 * 
 * 为什么这样做：
 * - 结合了 clsx (处理条件逻辑) 和 tailwind-merge (处理 Tailwind 类名冲突)。
 * - 放在 lib 目录下是为了让 UI 包内的组件通过相对路径引用，避免循环依赖。
 */
export function cn(...inputs: ClassValue[]) {
	return twMerge(clsx(inputs));
}

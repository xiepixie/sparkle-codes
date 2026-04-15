"use client";

import { cn } from "@repo/ui";
import { AlertCircle } from "lucide-react";
import { type ComponentType, Suspense, lazy } from "react";

/**
 * 实验性组件注册表 (Experiment Component Registry)
 * 
 * 为什么这样做：
 * - 集中管理 AI 可以调用的交互式组件。
 * - 使用 React.lazy 进行代码分割，确保首屏加载速度。
 */

const ColorPicker = lazy(() => {
  return import("./ColorPicker").then((m) => {
    return { default: m.ColorPicker };
  });
});

const SmartButton = lazy(() => {
  return import("./SmartButton").then((m) => {
    return { default: m.SmartButton };
  });
});

const FeatureToggle = lazy(() => {
  return import("./FeatureToggle").then((m) => {
    return { default: m.FeatureToggle };
  });
});

const SummaryCard = lazy(() => {
  return import("./SummaryCard").then((m) => {
    return { default: m.default };
  });
});

const ComparisonTable = lazy(() => {
  return import("./ComparisonTable").then((m) => {
    return { default: m.default };
  });
});

export const COMPONENT_REGISTRY: Record<string, ComponentType<any>> = {
  ColorPicker,
  SmartButton,
  FeatureToggle,
  SummaryCard,
  ComparisonTable,
} as const;

export const AVAILABLE_COMPONENTS = Object.keys(COMPONENT_REGISTRY);

export type RegisteredComponent = keyof typeof COMPONENT_REGISTRY;

interface LiveComponentProps {
  componentName: string;
  props?: Record<string, any>;
  className?: string;
}

/**
 * 动态渲染器：根据组件名称实时挂载
 */
export function LiveComponent({ componentName, props = {}, className }: LiveComponentProps) {
  const Component = COMPONENT_REGISTRY[componentName as RegisteredComponent];

  if (!Component) {
    return (
      <div className={cn("p-4 rounded-xl border border-dashed border-rose-500/50 bg-rose-500/5 text-rose-500 text-xs flex items-center gap-2", className)}>
        <AlertCircle size={14} />
        Component [{componentName}] not found in registry.
      </div>
    );
  }

  return (
    <Suspense fallback={<div className="animate-pulse bg-white/5 rounded-xl h-32 w-full" />}>
      <Component {...props} className={className} />
    </Suspense>
  );
}

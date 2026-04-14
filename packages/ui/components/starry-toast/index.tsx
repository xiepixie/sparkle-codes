"use client";
import { AlertCircle, CheckCircle2, Info, X } from "lucide-react";
import React, { useCallback, useEffect, useState } from "react";
import "./toast.css";

// --- Types ---
export type ToastType = "success" | "error" | "info" | "warning";

export interface ToastOptions {
	title: React.ReactNode;
	description?: React.ReactNode;
	duration?: number;
	type?: ToastType;
	action?: {
		label: string;
		onClick: () => void;
	};
}

interface ToastInstance extends ToastOptions {
	id: string;
	visible: boolean;
}

// --- Global Emitter ---
type ToastListener = (toast: ToastOptions) => void;
const listeners = new Set<ToastListener>();

export const toast = {
	success: (title: string, options?: Omit<ToastOptions, "title" | "type">) =>
		notify({ title, type: "success", ...options }),
	error: (title: string, options?: Omit<ToastOptions, "title" | "type">) =>
		notify({ title, type: "error", ...options }),
	info: (title: string, options?: Omit<ToastOptions, "title" | "type">) =>
		notify({ title, type: "info", ...options }),
	warning: (title: string, options?: Omit<ToastOptions, "title" | "type">) =>
		notify({ title, type: "warning", ...options }),
};

// --- Decision: Set-based Listener Pattern ---
// We use a Set to store listeners to avoid duplicate subscriptions and ensure
// O(1) performance for addition/deletion. The notify function iterates through
// active listeners (typically just one StarryToaster) to propagate toast events.
function notify(options: ToastOptions) {
	for (const l of listeners) {
		l(options);
	}
}

// --- Main Toaster Component ---
export function StarryToaster() {
	const [toasts, setToasts] = useState<ToastInstance[]>([]);

	const addToast = useCallback((options: ToastOptions) => {
		const id = Math.random().toString(36).substring(2, 9);
		const newToast: ToastInstance = {
			id,
			visible: true,
			duration: 4000,
			type: "info",
			...options,
		};

		setToasts((prev) => [newToast, ...prev].slice(0, 5)); // Limit to 5
	}, []);

	const removeToast = useCallback((id: string) => {
		setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, visible: false } : t)));
		setTimeout(() => {
			setToasts((prev) => prev.filter((t) => t.id !== id));
		}, 400); // Wait for exit animation
	}, []);

	useEffect(() => {
		listeners.add(addToast);
		return () => {
			listeners.delete(addToast);
		};
	}, [addToast]);

	return (
		<div className="starry-toaster-container">
			{toasts.map((t) => (
				<StarryToastItem key={t.id} {...t} onClose={() => removeToast(t.id)} />
			))}
		</div>
	);
}

// --- Individual Toast Item ---
function StarryToastItem({
	title,
	description,
	type,
	visible,
	duration,
	action,
	onClose,
}: ToastInstance & { onClose: () => void }) {
	const [isPaused, setIsPaused] = useState(false);
	const Icon = type === "success" ? CheckCircle2 : type === "error" ? AlertCircle : Info;

	// --- Decision: Use Effect-based timer instead of global setTimeout in addToast ---
	// This ensures that each toast manages its own lifecycle and correctly cleans up 
	// when unmounted, avoiding memory leaks or "ghost" dismissals on wrong IDs.
	useEffect(() => {
		if (!visible || isPaused || duration === Number.POSITIVE_INFINITY) {
			return;
		}

		const timer = setTimeout(onClose, duration || 4000);
		return () => {
			clearTimeout(timer);
		};
	}, [onClose, visible, isPaused, duration]);

	return (
		// biome-ignore lint/a11y/useSemanticElements: <output> 标签被设计用来显示计算结果或用户操作的反馈，它天然自带 role="status" 的语义
		<div
			// --- Decision: Semi-interactive Div ---
			// We use a div with hover events for pausing. role="status" ensures ARIA 
			// compliance for dynamic content updates without requiring a focusable button.
			role="status"
			aria-live={type === "error" ? "assertive" : "polite"}
			className={`starry-toast-card ${type} ${visible ? "enter" : "exit"}`}
			onMouseEnter={() => setIsPaused(true)}
			onMouseLeave={() => setIsPaused(false)}
		>
			<div className="starry-toast-accent" />

			<div className="starry-toast-icon">
				<Icon size={18} />
			</div>

			<div className="starry-toast-content">
				<div className="starry-toast-title">{title}</div>
				{description && <div className="starry-toast-description">{description}</div>}
			</div>

			{action && (
				<button
					type="button"
					className="starry-toast-action-btn"
					data-cursor="action"
					onClick={() => {
						action.onClick();
						onClose();
					}}
				>
					{action.label}
				</button>
			)}

			<button
				className="starry-toast-close"
				type="button"
				onClick={onClose}
				data-cursor="action"
				aria-label="Close"
			>
				<X size={14} />
			</button>

			{duration !== Number.POSITIVE_INFINITY && (
				<div className="starry-toast-progress-container">
					<div 
						className="starry-toast-progress-bar"
						style={{
							animation: `toast-progress ${duration || 4000}ms linear forwards`,
							animationPlayState: isPaused ? "paused" : "running"
						}}
					/>
				</div>
			)}
		</div>
	);
}


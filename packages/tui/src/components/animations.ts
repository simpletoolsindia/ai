/**
 * Animation utilities for the TUI
 *
 * Provides smooth animations, transitions, and visual effects
 * for a more engaging terminal experience.
 */

/**
 * Animation frame types
 */
export type AnimationFrame = string;

/**
 * Animation configuration
 */
export interface AnimationConfig {
	/** Frames for the animation */
	frames: AnimationFrame[];
	/** Frame interval in milliseconds */
	intervalMs: number;
	/** Whether to loop the animation */
	loop?: boolean;
	/** Callback on each frame */
	onFrame?: (frame: AnimationFrame, index: number) => void;
	/** Callback when animation completes */
	onComplete?: () => void;
}

/**
 * Animation state
 */
export interface AnimationState {
	/** Current frame index */
	currentFrame: number;
	/** Whether animation is running */
	isRunning: boolean;
	/** Animation start time */
	startTime: number;
	/** Elapsed time in milliseconds */
	elapsedMs: number;
}

/**
 * Predefined animation types
 */
export const AnimationTypes = {
	/** Spinner animation */
	SPINNER: {
		frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"],
		intervalMs: 80,
	},

	/** Dots animation */
	DOTS: {
		frames: ["", ".", "..", "..."],
		intervalMs: 400,
	},

	/** Pulse animation */
	PULSE: {
		frames: [
			"",
			"█",
			"██",
			"███",
			"████",
			"█████",
			"██████",
			"███████",
			"████████",
			"█████████",
			"██████████",
			"███████████",
			"████████████",
			"███████████",
			"██████████",
			"█████████",
			"████████",
			"███████",
			"██████",
			"█████",
			"████",
			"███",
			"██",
			"█",
		],
		intervalMs: 50,
	},

	/** Wave animation */
	WAVE: {
		frames: ["▁", "▂", "▃", "▄", "▅", "▆", "▇", "█", "▇", "▆", "▅", "▄", "▃", "▂"],
		intervalMs: 100,
	},

	/** Bounce animation */
	BOUNCE: {
		frames: ["⠁", "⠂", "⠄", "⡀", "⢀", "⠠", "⠐", "⠈"],
		intervalMs: 100,
	},

	/** Arrow animation */
	ARROW: {
		frames: ["←", "↖", "↑", "↗", "→", "↘", "↓", "↙"],
		intervalMs: 100,
	},

	/** Clock animation */
	CLOCK: {
		frames: ["🕐", "🕑", "🕒", "🕓", "㉤", "㉥", "㉦", "㉧", "㉨", "㉩", "㉪", "㉫"],
		intervalMs: 100,
	},

	/** Loading bar animation */
	BAR: {
		frames: [
			"[          ]",
			"[=         ]",
			"[==        ]",
			"[===       ]",
			"[====      ]",
			"[=====     ]",
			"[======    ]",
			"[=======   ]",
			"[========  ]",
			"[========= ]",
			"[==========]",
			"[ ==========]",
			"[  ==========]",
			"[   ==========]",
			"[    ==========]",
			"[     ==========]",
			"[      ==========]",
			"[       ==========]",
			"[        ==========]",
			"[         ==========]",
			"[          ==========]",
		],
		intervalMs: 100,
	},

	/** Success animation */
	SUCCESS: {
		frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏", "✓"],
		intervalMs: 80,
	},

	/** Error animation */
	ERROR: {
		frames: ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏", "✗"],
		intervalMs: 80,
	},
} as const;

/**
 * Color utilities for animations
 */
export const AnimationColors = {
	/** Rainbow colors for text */
	RAINBOW: [
		"\x1b[31m", // Red
		"\x1b[33m", // Yellow
		"\x1b[32m", // Green
		"\x1b[36m", // Cyan
		"\x1b[34m", // Blue
		"\x1b[35m", // Magenta
	],

	/** Reset color */
	RESET: "\x1b[0m",

	/** Bold text */
	BOLD: "\x1b[1m",

	/** Dim text */
	DIM: "\x1b[2m",

	/** Underline text */
	UNDERLINE: "\x1b[4m",

	/** Blink text */
	BLINK: "\x1b[5m",

	/** Reverse text */
	REVERSE: "\x1b[7m",

	/** Hidden text */
	HIDDEN: "\x1b[8m",
} as const;

/**
 * Create an animation controller
 */
export function createAnimation(config: AnimationConfig): {
	start: () => void;
	stop: () => void;
	getState: () => AnimationState;
	setFrames: (frames: AnimationFrame[]) => void;
	setIntervalMs: (ms: number) => void;
} {
	let state: AnimationState = {
		currentFrame: 0,
		isRunning: false,
		startTime: 0,
		elapsedMs: 0,
	};

	let intervalId: NodeJS.Timeout | null = null;
	let frames = [...config.frames];
	let intervalMs = config.intervalMs;

	const updateState = () => {
		if (state.isRunning) {
			state.elapsedMs = Date.now() - state.startTime;
		}
	};

	const nextFrame = () => {
		state.currentFrame = (state.currentFrame + 1) % frames.length;
		config.onFrame?.(frames[state.currentFrame], state.currentFrame);
		updateState();

		if (!config.loop && state.currentFrame === frames.length - 1) {
			stop();
			config.onComplete?.();
		}
	};

	const start = () => {
		if (state.isRunning) return;

		state = {
			currentFrame: 0,
			isRunning: true,
			startTime: Date.now(),
			elapsedMs: 0,
		};

		config.onFrame?.(frames[0], 0);
		intervalId = setInterval(nextFrame, intervalMs);
	};

	const stop = () => {
		if (!state.isRunning) return;

		state.isRunning = false;
		if (intervalId) {
			clearInterval(intervalId);
			intervalId = null;
		}
	};

	const getState = () => ({ ...state });

	const setFrames = (newFrames: AnimationFrame[]) => {
		frames = [...newFrames];
		if (state.isRunning) {
			stop();
			start();
		}
	};

	const setIntervalMs = (ms: number) => {
		intervalMs = ms;
		if (state.isRunning) {
			stop();
			start();
		}
	};

	return {
		start,
		stop,
		getState,
		setFrames,
		setIntervalMs,
	};
}

/**
 * Create a progress bar animation
 */
export function createProgressBar(
	total: number,
	width: number = 20,
	options?: {
		completeChar?: string;
		incompleteChar?: string;
		completeColor?: string;
		incompleteColor?: string;
		showPercentage?: boolean;
		showEta?: boolean;
	},
): {
	update: (current: number) => string;
	reset: () => void;
} {
	const {
		completeChar = "█",
		incompleteChar = "░",
		completeColor = "\x1b[32m", // Green
		incompleteColor = "\x1b[90m", // Gray
		showPercentage = true,
		showEta = false,
	} = options || {};

	let startTime = Date.now();
	let lastUpdate = startTime;
	let lastCurrent = 0;

	const reset = () => {
		startTime = Date.now();
		lastUpdate = startTime;
		lastCurrent = 0;
	};

	const update = (current: number): string => {
		const now = Date.now();
		const elapsed = now - startTime;
		const progress = Math.min(current / total, 1);
		const completeWidth = Math.floor(progress * width);
		const incompleteWidth = width - completeWidth;

		const completeBar = completeColor + completeChar.repeat(completeWidth) + "\x1b[0m";
		const incompleteBar = incompleteColor + incompleteChar.repeat(incompleteWidth) + "\x1b[0m";

		let result = `[${completeBar}${incompleteBar}]`;

		if (showPercentage) {
			const percentage = Math.floor(progress * 100);
			result += ` ${percentage}%`;
		}

		if (showEta && current > 0) {
			const rate = current / elapsed;
			const remaining = (total - current) / rate;
			const etaSeconds = Math.ceil(remaining / 1000);
			result += ` ETA: ${etaSeconds}s`;
		}

		lastUpdate = now;
		lastCurrent = current;

		return result;
	};

	return { update, reset };
}

/**
 * Create a typing animation
 */
export function createTypingAnimation(
	text: string,
	options?: {
		speed?: number;
		cursor?: boolean;
		cursorChar?: string;
		onComplete?: () => void;
	},
): {
	start: () => void;
	stop: () => void;
	getState: () => {
		currentText: string;
		isComplete: boolean;
		isRunning: boolean;
	};
} {
	const { speed = 50, cursor = true, cursorChar = "▌", onComplete } = options || {};

	let currentIndex = 0;
	let isRunning = false;
	let intervalId: NodeJS.Timeout | null = null;

	const getState = () => ({
		currentText: text.substring(0, currentIndex),
		isComplete: currentIndex >= text.length,
		isRunning,
	});

	const start = () => {
		if (isRunning) return;

		isRunning = true;
		currentIndex = 0;

		intervalId = setInterval(() => {
			if (currentIndex < text.length) {
				currentIndex++;
			} else {
				stop();
				onComplete?.();
			}
		}, speed);
	};

	const stop = () => {
		isRunning = false;
		if (intervalId) {
			clearInterval(intervalId);
			intervalId = null;
		}
	};

	return { start, stop, getState };
}

/**
 * Create a fade-in animation
 */
export function createFadeInAnimation(
	text: string,
	options?: {
		duration?: number;
		steps?: number;
		onComplete?: () => void;
	},
): {
	start: () => void;
	stop: () => void;
	getState: () => {
		currentText: string;
		opacity: number;
		isComplete: boolean;
		isRunning: boolean;
	};
} {
	const { duration = 1000, steps = 10, onComplete } = options || {};

	let currentStep = 0;
	let isRunning = false;
	let intervalId: NodeJS.Timeout | null = null;
	const stepDuration = duration / steps;

	const getState = () => ({
		currentText: text,
		opacity: currentStep / steps,
		isComplete: currentStep >= steps,
		isRunning,
	});

	const start = () => {
		if (isRunning) return;

		isRunning = true;
		currentStep = 0;

		intervalId = setInterval(() => {
			if (currentStep < steps) {
				currentStep++;
			} else {
				stop();
				onComplete?.();
			}
		}, stepDuration);
	};

	const stop = () => {
		isRunning = false;
		if (intervalId) {
			clearInterval(intervalId);
			intervalId = null;
		}
	};

	return { start, stop, getState };
}

/**
 * Create a color cycling animation
 */
export function createColorCycleAnimation(
	text: string,
	options?: {
		colors?: string[];
		intervalMs?: number;
		loop?: boolean;
		onComplete?: () => void;
	},
): {
	start: () => void;
	stop: () => void;
	getState: () => {
		currentText: string;
		currentColor: string;
		isRunning: boolean;
	};
} {
	const { colors = AnimationColors.RAINBOW, intervalMs = 100, loop = true, onComplete } = options || {};

	let currentIndex = 0;
	let isRunning = false;
	let intervalId: NodeJS.Timeout | null = null;

	const getState = () => ({
		currentText: colors[currentIndex] + text + AnimationColors.RESET,
		currentColor: colors[currentIndex],
		isRunning,
	});

	const start = () => {
		if (isRunning) return;

		isRunning = true;
		currentIndex = 0;

		intervalId = setInterval(() => {
			if (currentIndex < colors.length - 1) {
				currentIndex++;
			} else if (loop) {
				currentIndex = 0;
			} else {
				stop();
				onComplete?.();
			}
		}, intervalMs);
	};

	const stop = () => {
		isRunning = false;
		if (intervalId) {
			clearInterval(intervalId);
			intervalId = null;
		}
	};

	return { start, stop, getState };
}

/**
 * Create a matrix rain animation
 */
export function createMatrixRainAnimation(
	width: number,
	height: number,
	options?: {
		characters?: string;
		speed?: number;
		density?: number;
		color?: string;
	},
): {
	start: () => void;
	stop: () => void;
	getState: () => {
		frame: string;
		isRunning: boolean;
	};
} {
	const {
		characters = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789@#$%^&*()_+-=[]{}|;':\",./<>?`~",
		speed = 100,
		density = 0.3,
		color = "\x1b[32m", // Green
	} = options || {};

	let isRunning = false;
	let intervalId: NodeJS.Timeout | null = null;
	let columns: number[] = [];

	const resetColumns = () => {
		columns = Array.from({ length: width }, () => Math.floor(Math.random() * height));
	};

	const getState = () => {
		let frame = "";

		for (let y = 0; y < height; y++) {
			let line = "";
			for (let x = 0; x < width; x++) {
				if (Math.random() < density) {
					const charIndex = Math.floor(Math.random() * characters.length);
					line += color + characters[charIndex] + AnimationColors.RESET;
				} else {
					line += " ";
				}
			}
			frame += line + "\n";
		}

		return { frame, isRunning };
	};

	const start = () => {
		if (isRunning) return;

		isRunning = true;
		resetColumns();

		intervalId = setInterval(() => {
			// Update columns
			for (let x = 0; x < width; x++) {
				if (columns[x] < height) {
					columns[x]++;
				} else {
					columns[x] = 0;
				}
			}
		}, speed);
	};

	const stop = () => {
		isRunning = false;
		if (intervalId) {
			clearInterval(intervalId);
			intervalId = null;
		}
	};

	return { start, stop, getState };
}

/**
 * Utility to apply animation to text
 */
export function applyAnimation(text: string, animation: AnimationFrame[], currentFrame: number): string {
	const frame = animation[currentFrame % animation.length];
	return `${frame} ${text}`;
}

/**
 * Create a simple spinner with text
 */
export function createSpinner(
	text: string,
	options?: {
		frames?: AnimationFrame[];
		intervalMs?: number;
		color?: string;
	},
): {
	start: () => void;
	stop: () => void;
	getState: () => {
		display: string;
		isRunning: boolean;
	};
} {
	const {
		frames = AnimationTypes.SPINNER.frames,
		intervalMs = AnimationTypes.SPINNER.intervalMs,
		color = "\x1b[36m", // Cyan
	} = options || {};

	let currentFrame = 0;
	let isRunning = false;
	let intervalId: NodeJS.Timeout | null = null;

	const getState = () => ({
		display: `${color}${frames[currentFrame]}\x1b[0m ${text}`,
		isRunning,
	});

	const start = () => {
		if (isRunning) return;

		isRunning = true;
		currentFrame = 0;

		intervalId = setInterval(() => {
			currentFrame = (currentFrame + 1) % frames.length;
		}, intervalMs);
	};

	const stop = () => {
		isRunning = false;
		if (intervalId) {
			clearInterval(intervalId);
			intervalId = null;
		}
	};

	return { start, stop, getState };
}

/** @type {import('tailwindcss').Config} */
export default {
	content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
	theme: {
		extend: {
			colors: {
				accent: {
					50: "#f4f7ff",
					100: "#e8eefe",
					200: "#c8d6fc",
					300: "#a1b8fa",
					400: "#7a96f6",
					500: "#4f76ee",
					600: "#3056d4",
					700: "#2741a8",
					800: "#1d2e76",
					900: "#0f1a4d",
				},
				ink: {
					50: "#f6f7f9",
					100: "#eceef2",
					200: "#d5dae2",
					300: "#aeb7c5",
					400: "#7d8898",
					500: "#525c6e",
					600: "#3a4252",
					700: "#2a303c",
					800: "#1d2129",
					900: "#0e1116",
				},
			},
			fontFamily: {
				sans: ['"Inter"', '"system-ui"', "sans-serif"],
				mono: ['"JetBrains Mono"', '"Fira Code"', "ui-monospace", "monospace"],
			},
			animation: {
				"fade-in": "fadeIn 0.5s ease-out",
				"slide-up": "slideUp 0.5s ease-out",
				"pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
			},
			keyframes: {
				fadeIn: {
					"0%": { opacity: "0" },
					"100%": { opacity: "1" },
				},
				slideUp: {
					"0%": { transform: "translateY(8px)", opacity: "0" },
					"100%": { transform: "translateY(0)", opacity: "1" },
				},
			},
		},
	},
	plugins: [],
};

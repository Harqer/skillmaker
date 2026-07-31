import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const config = defineConfig({
	server: {
		host: "0.0.0.0",
		port: 3000,
		strictPort: true,
		allowedHosts: true,
	},
	optimizeDeps: {
		include: [
			"@clerk/clerk-react",
			"@clerk/themes",
			"@tanstack/react-query",
			"@tanstack/react-router",
			"seroval",
			"lucide-react",
			"clsx",
			"tailwind-merge",
			"framer-motion",
		],
		exclude: ["@clerk/tanstack-react-start/server"],
	},
	resolve: {
		alias: {
			"#": "/src",
			"@": "/src",
		},
		tsconfigPaths: true,
	},
	plugins: [
		tailwindcss(),
		tanstackStart(),
		viteReact({
			babel: {
				plugins: [["babel-plugin-react-compiler", {}]],
			},
		}),
	],
	build: {
		chunkSizeWarningLimit: 1000,
		rollupOptions: {
			external: ["@google/genai"],
		},
	},
});

export default config;

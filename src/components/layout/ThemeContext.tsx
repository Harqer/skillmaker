import * as React from "react";

type Theme = "light" | "dark";

interface ThemeContextType {
	theme: Theme;
	isDark: boolean;
	toggleTheme: () => void;
	setTheme: (theme: Theme) => void;
}

const ThemeContext = React.createContext<ThemeContextType | undefined>(
	undefined,
);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
	const [theme, setThemeState] = React.useState<Theme>("light");

	React.useEffect(() => {
		// Synchronize state and document class on mount safely
		try {
			const savedTheme = localStorage.getItem("raven-theme");
			if (savedTheme === "dark") {
				setThemeState("dark");
				document.documentElement.classList.add("dark");
			} else {
				setThemeState("light");
				document.documentElement.classList.remove("dark");
			}
		} catch (e) {
			console.warn("Theme storage unavailable in iframe:", e);
		}
	}, []);

	const setTheme = (newTheme: Theme) => {
		setThemeState(newTheme);
		if (newTheme === "dark") {
			document.documentElement.classList.add("dark");
			try {
				localStorage.setItem("raven-theme", "dark");
			} catch {}
		} else {
			document.documentElement.classList.remove("dark");
			try {
				localStorage.setItem("raven-theme", "light");
			} catch {}
		}
	};

	const toggleTheme = () => {
		setTheme(theme === "light" ? "dark" : "light");
	};

	const isDark = theme === "dark";

	return (
		<ThemeContext.Provider value={{ theme, isDark, toggleTheme, setTheme }}>
			{children}
		</ThemeContext.Provider>
	);
}

export function useTheme() {
	const context = React.useContext(ThemeContext);
	if (context === undefined) {
		throw new Error("useTheme must be used within a ThemeProvider");
	}
	return context;
}

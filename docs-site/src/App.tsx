import { Link, Route, Routes, useLocation } from "react-router-dom";
import { HomePage } from "./pages/HomePage";
import { InstallPage } from "./pages/InstallPage";
import { CommandsPage } from "./pages/CommandsPage";
import { FeaturesPage } from "./pages/FeaturesPage";
import { ConfigurationPage } from "./pages/ConfigurationPage";
import { TroubleshootingPage } from "./pages/TroubleshootingPage";
import { ChangelogPage } from "./pages/ChangelogPage";
import { NavBar } from "./components/NavBar";
import { Footer } from "./components/Footer";
import { useEffect } from "react";

function ScrollToTop() {
	const { pathname } = useLocation();
	useEffect(() => {
		window.scrollTo(0, 0);
	}, [pathname]);
	return null;
}

export default function App() {
	return (
		<div className="min-h-full flex flex-col">
			<ScrollToTop />
			<NavBar />
			<main className="flex-1 pt-20">
				<Routes>
					<Route path="/" element={<HomePage />} />
					<Route path="/install" element={<InstallPage />} />
					<Route path="/commands" element={<CommandsPage />} />
					<Route path="/features" element={<FeaturesPage />} />
					<Route path="/configuration" element={<ConfigurationPage />} />
					<Route path="/troubleshooting" element={<TroubleshootingPage />} />
					<Route path="/changelog" element={<ChangelogPage />} />
					<Route path="*" element={<NotFound />} />
				</Routes>
			</main>
			<Footer />
		</div>
	);
}

function NotFound() {
	return (
		<div className="section py-32 text-center">
			<h1 className="text-4xl font-bold text-white mb-4">Page not found</h1>
			<p className="text-ink-300 mb-8">The page you're looking for doesn't exist.</p>
			<Link to="/" className="btn-primary">
				Back to home
			</Link>
		</div>
	);
}

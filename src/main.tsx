import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "./styles/tokens.css";
import "./styles/app.css";

const root = document.getElementById("root");
if (!root) throw new Error("InkNote root element is missing");

createRoot(root).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

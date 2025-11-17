import { createRoot } from "react-dom/client";
import DetailPreviewPage from "@/pages/detail-preview";
import { ThemeProvider } from "@/components/theme-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import "@/index.css";

function DetailDrawerPreviewApp() {
  return (
    <ThemeProvider defaultTheme="dark">
      <TooltipProvider>
        <div className="min-h-screen bg-background">
          <DetailPreviewPage />
        </div>
      </TooltipProvider>
    </ThemeProvider>
  );
}

const rootElement = document.getElementById("root");

if (rootElement) {
  createRoot(rootElement).render(<DetailDrawerPreviewApp />);
}

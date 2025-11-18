import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { MagicPatternsHeader } from "@/components/MagicPatternsHeader";
import { WebSocketProvider } from "@/contexts/WebSocketContext";
import Dashboard from "@/pages/dashboard";
import Tracks from "@/pages/tracks";
import PlaylistsView from "@/pages/playlists-view";
import Contacts from "@/pages/contacts";
import OutreachPipeline from "@/pages/outreach";
import Pipeline from "@/pages/pipeline";
import SettingsSpotify from "@/pages/settings-spotify";
import SettingsDatabase from "@/pages/settings-database";
import SettingsAutomation from "@/pages/settings-automation";
import SettingsDev from "@/pages/settings-dev";
import DetailPreviewPage from "@/pages/detail-preview";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      {/* Discovery */}
      <Route path="/" component={Dashboard} />
      <Route path="/tracks" component={Tracks} />
      <Route path="/playlists" component={PlaylistsView} />
      
      {/* Relationships/CRM */}
      <Route path="/relationships" component={Contacts} />
      <Route path="/contacts" component={Contacts} />
      <Route path="/outreach" component={OutreachPipeline} />
      
      {/* Deals */}
      <Route path="/deals" component={Pipeline} />
      <Route path="/pipeline" component={Pipeline} />
      
      {/* Settings */}
      <Route path="/settings" component={SettingsSpotify} />
      <Route path="/settings/spotify" component={SettingsSpotify} />
      <Route path="/settings/database" component={SettingsDatabase} />
      <Route path="/settings/automation" component={SettingsAutomation} />
      <Route path="/settings/dev" component={SettingsDev} />
      
      {/* Preview */}
      <Route path="/previews/details" component={DetailPreviewPage} />
      
      {/* 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const style = {
    "--sidebar-width": "16rem",
    "--sidebar-width-icon": "3rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <WebSocketProvider>
        <ThemeProvider defaultTheme="dark">
          <TooltipProvider>
            <SidebarProvider style={style as React.CSSProperties}>
              <div className="flex h-screen w-full">
                <AppSidebar />
                <div className="flex flex-col flex-1 overflow-hidden">
                  <MagicPatternsHeader />
                  <main className="flex-1 overflow-auto bg-background">
                    <Router />
                  </main>
                </div>
              </div>
            </SidebarProvider>
            <Toaster />
          </TooltipProvider>
        </ThemeProvider>
      </WebSocketProvider>
    </QueryClientProvider>
  );
}

export default App;

import { useState } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { MagicPatternsHeader } from "@/components/MagicPatternsHeader";
import { MagicPatternsSidebar } from "@/components/MagicPatternsSidebar";
import Dashboard from "@/pages/dashboard";
import PlaylistsView from "@/pages/playlists-view";
import Contacts from "@/pages/contacts";
import Engagements from "@/pages/engagements";
import Opportunities from "@/pages/opportunities";
import Pipeline from "@/pages/pipeline";
import DealDetail from "@/pages/deal-detail";
import DealTemplates from "@/pages/deal-templates";
import SettingsSpotify from "@/pages/settings-spotify";
import SettingsDatabase from "@/pages/settings-database";
import SettingsPreferences from "@/pages/settings-preferences";
import SettingsAutomation from "@/pages/settings-automation";
import SettingsDev from "@/pages/settings-dev";
import NotFound from "@/pages/not-found";

function Router() {
  return (
    <Switch>
      {/* Discovery */}
      <Route path="/" component={Dashboard} />
      <Route path="/tracks" component={Dashboard} />
      <Route path="/playlists" component={PlaylistsView} />
      
      {/* Relationships/CRM */}
      <Route path="/relationships" component={Contacts} />
      <Route path="/contacts" component={Contacts} />
      <Route path="/engagements" component={Engagements} />
      <Route path="/opportunities" component={Opportunities} />
      
      {/* Deals */}
      <Route path="/deals" component={Pipeline} />
      <Route path="/pipeline" component={Pipeline} />
      <Route path="/deal-detail" component={DealDetail} />
      <Route path="/deal-templates" component={DealTemplates} />
      
      {/* Settings */}
      <Route path="/settings" component={SettingsSpotify} />
      <Route path="/settings/spotify" component={SettingsSpotify} />
      <Route path="/settings/database" component={SettingsDatabase} />
      <Route path="/settings/preferences" component={SettingsPreferences} />
      <Route path="/settings/automation" component={SettingsAutomation} />
      <Route path="/settings/dev" component={SettingsDev} />
      
      {/* 404 */}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="dark">
        <TooltipProvider>
          <div className="flex h-screen w-full bg-background">
            <MagicPatternsSidebar 
              isOpen={sidebarOpen} 
              onClose={() => setSidebarOpen(false)} 
            />
            <div className="flex flex-col flex-1 overflow-hidden">
              <MagicPatternsHeader onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
              <main className="flex-1 overflow-auto bg-background">
                <Router />
              </main>
            </div>
          </div>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;

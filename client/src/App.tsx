import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ThemeProvider } from "@/components/theme-provider";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import Dashboard from "@/pages/dashboard";
import Comparison from "@/pages/comparison";
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
      <Route path="/playlists" component={PlaylistsView} />
      
      {/* Relationships/CRM */}
      <Route path="/contacts" component={Contacts} />
      <Route path="/engagements" component={Engagements} />
      <Route path="/opportunities" component={Opportunities} />
      
      {/* Deals */}
      <Route path="/pipeline" component={Pipeline} />
      <Route path="/deal-detail" component={DealDetail} />
      <Route path="/deal-templates" component={DealTemplates} />
      
      {/* Settings */}
      <Route path="/settings/spotify" component={SettingsSpotify} />
      <Route path="/settings/database" component={SettingsDatabase} />
      <Route path="/settings/preferences" component={SettingsPreferences} />
      <Route path="/settings/automation" component={SettingsAutomation} />
      <Route path="/settings/dev" component={SettingsDev} />
      
      {/* Legacy */}
      <Route path="/comparison" component={Comparison} />
      
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
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <SidebarProvider style={style as React.CSSProperties}>
            <div className="flex h-screen w-full">
              <AppSidebar />
              <div className="flex flex-col flex-1 overflow-hidden">
                <header className="flex items-center gap-2 p-2 border-b border-primary/20 glass-panel backdrop-blur-xl" data-testid="header-main">
                  <SidebarTrigger data-testid="button-sidebar-toggle" className="hover-elevate" />
                </header>
                <main className="flex-1 overflow-auto">
                  <Router />
                </main>
              </div>
            </div>
          </SidebarProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;

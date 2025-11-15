import { useLocation } from 'wouter';
import { BellIcon, Music, ListMusic, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';

export function MagicPatternsHeader() {
  const [location] = useLocation();

  const getHeaderContent = () => {
    if (location === '/playlists') {
      return {
        title: 'Playlists',
        subtitle: 'Monitor and track Spotify playlists • Editorial and user-curated sources • Automated talent discovery',
        icon: <ListMusic className="h-8 w-8 text-primary" />
      };
    }
    if (location === '/' || location === '/tracks') {
      return {
        title: 'Tracks',
        subtitle: 'Discover and prioritize unsigned tracks • Songwriter identification • Publishing opportunity scoring',
        icon: <Music className="h-8 w-8 text-primary" />
      };
    }
    if (location === '/contacts') {
      return {
        title: 'Contact Workspace',
        subtitle: 'Relationship management for unsigned talent discovery • Lead cadence tracking • Funnel coverage analytics',
        icon: <Users className="h-8 w-8 text-primary" />
      };
    }
    return {
      title: 'PubCo Live',
      subtitle: 'AI-Powered Publishing Lead Discovery',
      icon: null
    };
  };

  const content = getHeaderContent();

  return (
    <header className="bg-white/5 backdrop-blur-xl border-b border-white/10">
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-4">
          <SidebarTrigger 
            className="hover-elevate active-elevate-2" 
            data-testid="button-sidebar-toggle" 
          />
          {content.icon && (
            <div className="flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10">
              {content.icon}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold font-display text-textPrimary">
              {content.title}
            </h1>
            <p className="text-textSecondary text-sm mt-0.5">
              {content.subtitle}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            size="icon"
            variant="ghost"
            className="relative"
            data-testid="button-notifications"
          >
            <BellIcon className="h-5 w-5" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-error rounded-full"></span>
          </Button>
        </div>
      </div>
    </header>
  );
}

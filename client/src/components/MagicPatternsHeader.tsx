import { useLocation } from 'wouter';
import { Music, ListMusic, Users } from 'lucide-react';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { NotificationCenter } from './NotificationCenter';

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
    <header className="bg-white/5 backdrop-blur-xl border-b border-white/10 safe-area-top">
      <div className="flex items-center justify-between px-3 sm:px-4 py-3 sm:py-4">
        <div className="flex items-center gap-2 sm:gap-4 min-w-0">
          <SidebarTrigger 
            className="hover-elevate active-elevate-2 flex-shrink-0" 
            data-testid="button-sidebar-toggle" 
          />
          {content.icon && (
            <div className="hidden sm:flex items-center justify-center w-12 h-12 rounded-xl bg-primary/10 flex-shrink-0">
              {content.icon}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-lg sm:text-2xl font-bold font-display text-textPrimary truncate">
              {content.title}
            </h1>
            <p className="text-textSecondary text-xs sm:text-sm mt-0.5 hidden md:block">
              {content.subtitle}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 flex-shrink-0">
          <NotificationCenter />
        </div>
      </div>
    </header>
  );
}

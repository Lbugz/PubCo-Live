import { useLocation } from 'wouter';
import { BellIcon, Music, ListMusic } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SidebarTrigger } from '@/components/ui/sidebar';

export function MagicPatternsHeader() {
  const [location] = useLocation();

  const getHeaderContent = () => {
    if (location === '/playlists') {
      return {
        title: 'Playlists',
        subtitle: 'Manage and track your Spotify playlists',
        icon: <ListMusic className="h-8 w-8 text-secondary" />
      };
    }
    if (location === '/' || location === '/tracks') {
      return {
        title: 'Tracks',
        subtitle: 'Discover and prioritize tracks from your playlists',
        icon: <Music className="h-8 w-8 text-secondary" />
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
            <div className="hidden sm:flex items-center justify-center w-12 h-12 rounded-xl bg-secondary/10">
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

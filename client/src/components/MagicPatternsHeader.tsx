import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { Menu, BellIcon, CheckCircle2, XCircle, RefreshCw, Music, ListMusic } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface HeaderProps {
  onMenuClick: () => void;
}

export function MagicPatternsHeader({ onMenuClick }: HeaderProps) {
  const [location] = useLocation();

  const { data: spotifyStatus } = useQuery<{ authenticated: boolean }>({
    queryKey: ["/api/spotify/status"],
    refetchInterval: 30000,
  });

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

  const handleAuthorizeSpotify = () => {
    window.open("/api/spotify/auth", "_blank");
  };

  const content = getHeaderContent();

  return (
    <header className="bg-white/5 backdrop-blur-xl border-b border-white/10">
      <div className="flex items-center justify-between px-4 py-4">
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuClick}
            className="text-textPrimary hover:text-secondary transition-all duration-200 p-2 rounded-xl hover:bg-white/10"
            data-testid="button-menu-toggle"
          >
            <Menu className="h-6 w-6" />
          </button>
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
          {/* Spotify Connection Status */}
          <div 
            className="flex items-center gap-2 px-3 py-2 rounded-lg glass-panel backdrop-blur-xl border border-primary/20"
            data-testid="spotify-connection-status"
          >
            {spotifyStatus === undefined ? (
              <>
                <RefreshCw className="h-4 w-4 text-muted-foreground animate-spin" data-testid="icon-spotify-loading" />
                <span className="text-sm font-medium text-muted-foreground" data-testid="text-spotify-status">Checking...</span>
              </>
            ) : spotifyStatus.authenticated ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-green-500" data-testid="icon-spotify-connected" />
                <span className="text-sm font-medium" data-testid="text-spotify-status">Spotify Connected</span>
              </>
            ) : (
              <>
                <XCircle className="h-4 w-4 text-red-500" data-testid="icon-spotify-disconnected" />
                <span className="text-sm font-medium text-muted-foreground" data-testid="text-spotify-status">Not Connected</span>
              </>
            )}
          </div>
          
          {/* Authorize Button */}
          {spotifyStatus?.authenticated === false && (
            <Button
              onClick={handleAuthorizeSpotify}
              className="bg-gradient-to-r from-primary to-secondary hover:opacity-90 transition-opacity"
              data-testid="button-authorize-spotify"
            >
              Authorize Spotify
            </Button>
          )}
          
          <button 
            className="p-2.5 rounded-xl text-textSecondary hover:text-textPrimary hover:bg-white/10 transition-all duration-200 relative"
            data-testid="button-notifications"
          >
            <BellIcon className="h-5 w-5" />
            <span className="absolute top-1.5 right-1.5 h-2 w-2 bg-error rounded-full"></span>
          </button>
        </div>
      </div>
    </header>
  );
}

import { useLocation } from 'wouter';
import { Menu, BellIcon, CheckCircle, Music, ListMusic } from 'lucide-react';

interface HeaderProps {
  onMenuClick: () => void;
}

export function MagicPatternsHeader({ onMenuClick }: HeaderProps) {
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
        <div className="flex items-center space-x-3">
          <div className="flex items-center px-4 py-2 rounded-full bg-success/10 backdrop-blur-sm text-success border border-success/20 shadow-lg">
            <CheckCircle className="h-4 w-4 mr-2" />
            <span className="text-sm font-medium">Spotify Connected</span>
          </div>
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

import { Link, useLocation } from 'wouter';
import { Music, ListMusic, Users, BarChart2, Settings, X } from 'lucide-react';

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
}

export function MagicPatternsSidebar({ isOpen, onClose }: SidebarProps) {
  const [location] = useLocation();

  const isActive = (path: string) => {
    if (path === '/') return location === '/' || location === '/tracks';
    return location === path;
  };

  const navLinkClass = (path: string) => {
    const active = isActive(path);
    return `flex items-center px-4 py-3 text-sm font-medium rounded-xl transition-all duration-200 ${
      active
        ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-lg shadow-primary/30'
        : 'text-textSecondary hover:text-textPrimary hover:bg-white/10'
    }`;
  };

  return (
    <>
      {isOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-20 md:hidden backdrop-blur-sm"
          onClick={onClose}
        />
      )}
      <aside
        className={`fixed md:relative inset-y-0 left-0 z-30 w-64 bg-white/5 backdrop-blur-xl border-r border-white/10 flex flex-col transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } md:translate-x-0`}
      >
        <div className="p-6 border-b border-white/10 flex items-center justify-between">
          <h1 className="text-2xl font-bold font-display bg-gradient-to-r from-primary to-secondary bg-clip-text text-transparent">
            PubCo Live
          </h1>
          <button
            onClick={onClose}
            className="md:hidden p-1.5 rounded-lg text-textSecondary hover:text-textPrimary hover:bg-white/10 transition-all duration-200"
            data-testid="button-close-sidebar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="flex-1 p-4 space-y-6 overflow-y-auto">
          <div>
            <h2 className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-3 px-3">
              Discovery
            </h2>
            <div className="space-y-1">
              <Link
                href="/playlists"
                onClick={() => window.innerWidth < 768 && onClose()}
                className={navLinkClass('/playlists')}
                data-testid="link-playlists-view"
              >
                <ListMusic className="mr-3 h-5 w-5" />
                Playlists View
              </Link>
              <Link
                href="/"
                onClick={() => window.innerWidth < 768 && onClose()}
                className={navLinkClass('/')}
                data-testid="link-tracks-view"
              >
                <Music className="mr-3 h-5 w-5" />
                Tracks View
              </Link>
            </div>
          </div>
          <div>
            <h2 className="text-xs font-semibold text-textSecondary uppercase tracking-wider mb-3 px-3">
              Management
            </h2>
            <div className="space-y-1">
              <Link
                href="/relationships"
                onClick={() => window.innerWidth < 768 && onClose()}
                className={navLinkClass('/relationships')}
                data-testid="link-relationships"
              >
                <Users className="mr-3 h-5 w-5" />
                Relationships/CRM
              </Link>
              <Link
                href="/deals"
                onClick={() => window.innerWidth < 768 && onClose()}
                className={navLinkClass('/deals')}
                data-testid="link-deals"
              >
                <BarChart2 className="mr-3 h-5 w-5" />
                Deals
              </Link>
            </div>
          </div>
          <div>
            <Link
              href="/settings"
              onClick={() => window.innerWidth < 768 && onClose()}
              className={navLinkClass('/settings')}
              data-testid="link-settings"
            >
              <Settings className="mr-3 h-5 w-5" />
              Settings
            </Link>
          </div>
        </nav>
      </aside>
    </>
  );
}

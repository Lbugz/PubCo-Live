import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Music, Target, TrendingUp, BarChart2, Search, Filter, Sliders, RefreshCw, MoreHorizontal } from 'lucide-react';
import { StatsCard } from '@/components/StatsCard';
import { StatusBadge } from '@/components/StatusBadge';
import { type PlaylistSnapshot } from '@shared/schema';

export default function MagicPatternsTracksView() {
  const [viewMode, setViewMode] = useState<'table' | 'card' | 'kanban'>('table');
  const [selectedWeek, setSelectedWeek] = useState('latest');
  const [selectedPlaylist, setSelectedPlaylist] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  const { data: weeks = [] } = useQuery<string[]>({
    queryKey: ['/api/weeks'],
  });

  const { data: tracks = [] } = useQuery<PlaylistSnapshot[]>({
    queryKey: selectedPlaylist !== 'all'
      ? ['/api/tracks', 'playlist', selectedPlaylist, selectedWeek]
      : ['/api/tracks', selectedWeek],
    queryFn: async ({ queryKey }) => {
      if (queryKey[1] === 'playlist') {
        const response = await fetch(`/api/tracks?playlist=${queryKey[2]}`);
        if (!response.ok) throw new Error('Failed to fetch tracks by playlist');
        return response.json();
      } else {
        const response = await fetch(`/api/tracks?week=${queryKey[1]}`);
        if (!response.ok) throw new Error('Failed to fetch tracks');
        return response.json();
      }
    },
  });

  const filteredTracks = useMemo(() => {
    if (!searchQuery) return tracks;
    const query = searchQuery.toLowerCase();
    return tracks.filter(
      t => t.trackName.toLowerCase().includes(query) ||
        t.artistName.toLowerCase().includes(query) ||
        t.label?.toLowerCase().includes(query)
    );
  }, [tracks, searchQuery]);

  const stats = useMemo(() => {
    const total = filteredTracks.length;
    const high = filteredTracks.filter(t => t.unsignedScore >= 7).length;
    const medium = filteredTracks.filter(t => t.unsignedScore >= 4 && t.unsignedScore < 7).length;
    const avgScore = total > 0 
      ? (filteredTracks.reduce((sum, t) => sum + t.unsignedScore, 0) / total).toFixed(1)
      : '0.0';
    return { total, high, medium, avgScore };
  }, [filteredTracks]);

  const getScoreBadgeType = (score: number): string => {
    if (score >= 7) return 'high';
    if (score >= 4) return 'medium';
    return 'low';
  };

  return (
    <div className="space-y-6 animate-slide-up p-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatsCard
          title="Total Tracks"
          value={stats.total}
          icon={<Music className="h-6 w-6 text-primary" />}
          color="bg-primary/20"
        />
        <StatsCard
          title="High Potential"
          value={stats.high}
          icon={<Target className="h-6 w-6 text-success" />}
          color="bg-success/20"
          subtitle="Score 7-10"
        />
        <StatsCard
          title="Medium Potential"
          value={stats.medium}
          icon={<TrendingUp className="h-6 w-6 text-warning" />}
          color="bg-warning/20"
          subtitle="Score 4-6"
        />
        <StatsCard
          title="Avg Score"
          value={stats.avgScore}
          icon={<BarChart2 className="h-6 w-6 text-secondary" />}
          color="bg-secondary/20"
          subtitle="Out of 10"
        />
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap items-center gap-3">
        <button className="inline-flex items-center px-6 py-3 border border-transparent rounded-xl text-sm font-medium text-white bg-gradient-to-r from-primary to-secondary hover:shadow-lg hover:shadow-primary/50 focus:outline-none transition-all duration-200 hover:scale-105" data-testid="button-fetch-data">
          <RefreshCw className="h-4 w-4 mr-2" />
          Fetch Data
        </button>
        <button className="inline-flex items-center px-4 py-3 border border-white/10 rounded-xl text-sm font-medium text-textPrimary bg-white/5 backdrop-blur-lg hover:bg-white/10 hover:border-white/20 focus:outline-none transition-all duration-200">
          <Filter className="h-4 w-4 mr-2" />
          Enrich (MB)
        </button>
        <button className="inline-flex items-center px-4 py-3 border border-white/10 rounded-xl text-sm font-medium text-textPrimary bg-white/5 backdrop-blur-lg hover:bg-white/10 hover:border-white/20 focus:outline-none transition-all duration-200">
          <Filter className="h-4 w-4 mr-2" />
          Enrich (Credits)
        </button>
        <button className="inline-flex items-center px-4 py-3 border border-white/10 rounded-xl text-sm font-medium text-textPrimary bg-white/5 backdrop-blur-lg hover:bg-white/10 hover:border-white/20 focus:outline-none transition-all duration-200">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-col lg:flex-row gap-3">
        <select
          value={selectedWeek}
          onChange={(e) => setSelectedWeek(e.target.value)}
          className="px-4 py-3 border border-white/10 rounded-xl text-sm font-medium text-textPrimary bg-white/5 backdrop-blur-lg hover:bg-white/10 focus:outline-none focus:border-primary/50 transition-all duration-200"
          data-testid="select-week"
        >
          <option value="latest">Latest</option>
          {weeks.map(week => (
            <option key={week} value={week}>{week}</option>
          ))}
        </select>
        <select
          value={selectedPlaylist}
          onChange={(e) => setSelectedPlaylist(e.target.value)}
          className="px-4 py-3 border border-white/10 rounded-xl text-sm font-medium text-textPrimary bg-white/5 backdrop-blur-lg hover:bg-white/10 focus:outline-none focus:border-primary/50 transition-all duration-200"
          data-testid="select-playlist"
        >
          <option value="all">All Playlists</option>
        </select>
        <select className="px-4 py-3 border border-white/10 rounded-xl text-sm font-medium text-textPrimary bg-white/5 backdrop-blur-lg hover:bg-white/10 focus:outline-none focus:border-primary/50 transition-all duration-200">
          <option>All Tags</option>
        </select>
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-textSecondary" />
          <input
            type="text"
            placeholder="Search tracks, artists, labels..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-12 pr-4 py-3 w-full bg-white/5 backdrop-blur-lg border border-white/10 rounded-xl text-sm text-textPrimary placeholder-textSecondary focus:border-primary/50 focus:bg-white/10 transition-all duration-200"
            data-testid="input-search"
          />
        </div>
        <button className="inline-flex items-center px-4 py-3 border border-white/10 rounded-xl text-sm font-medium text-textPrimary bg-white/5 backdrop-blur-lg hover:bg-white/10 hover:border-white/20 focus:outline-none transition-all duration-200 whitespace-nowrap">
          <Sliders className="h-4 w-4 mr-2" />
          Completeness Filters
        </button>
      </div>

      {/* View Mode and Results Count */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setViewMode('table')}
            className={`inline-flex items-center px-3 py-2 border rounded-xl text-sm font-medium transition-all duration-200 ${
              viewMode === 'table'
                ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-lg shadow-primary/30'
                : 'border-white/10 text-textSecondary bg-white/5 hover:text-textPrimary hover:bg-white/10'
            }`}
            data-testid="button-view-table"
          >
            <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" />
            </svg>
            Table
          </button>
          <button
            onClick={() => setViewMode('card')}
            className={`inline-flex items-center px-3 py-2 border rounded-xl text-sm font-medium transition-all duration-200 ${
              viewMode === 'card'
                ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-lg shadow-primary/30'
                : 'border-white/10 text-textSecondary bg-white/5 hover:text-textPrimary hover:bg-white/10'
            }`}
            data-testid="button-view-card"
          >
            <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2V6zM14 6a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2V6zM4 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2H6a2 2 0 01-2-2v-2zM14 16a2 2 0 012-2h2a2 2 0 012 2v2a2 2 0 01-2 2h-2a2 2 0 01-2-2v-2z" />
            </svg>
            Card
          </button>
          <button
            onClick={() => setViewMode('kanban')}
            className={`inline-flex items-center px-3 py-2 border rounded-xl text-sm font-medium transition-all duration-200 ${
              viewMode === 'kanban'
                ? 'bg-gradient-to-r from-primary to-secondary text-white shadow-lg shadow-primary/30'
                : 'border-white/10 text-textSecondary bg-white/5 hover:text-textPrimary hover:bg-white/10'
            }`}
            data-testid="button-view-kanban"
          >
            <svg className="h-4 w-4 mr-1.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2" />
            </svg>
            Kanban
          </button>
        </div>
        <div className="text-sm font-medium text-textSecondary">
          {filteredTracks.length} results
        </div>
      </div>

      {/* Table */}
      {viewMode === 'table' && (
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 overflow-hidden">
          <table className="min-w-full divide-y divide-white/10">
            <thead className="bg-white/5">
              <tr>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-textSecondary uppercase tracking-wider">
                  Track
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-textSecondary uppercase tracking-wider">
                  Artist
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-textSecondary uppercase tracking-wider">
                  Playlist
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-textSecondary uppercase tracking-wider">
                  Label / Publisher
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-textSecondary uppercase tracking-wider">
                  Songwriter
                </th>
                <th scope="col" className="px-6 py-4 text-left text-xs font-semibold text-textSecondary uppercase tracking-wider">
                  Score
                </th>
                <th scope="col" className="relative px-6 py-4">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/10">
              {filteredTracks.map(track => (
                <tr
                  key={track.id}
                  className="hover:bg-white/5 cursor-pointer transition-all duration-200"
                  data-testid={`row-track-${track.id}`}
                >
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-textPrimary">
                      {track.trackName}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-textSecondary">
                      {track.artistName}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-textSecondary">
                      {track.playlistName}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-textSecondary">
                      {track.label || 'Unknown'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm text-textSecondary">
                      {track.songwriter || 'Unknown'}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <StatusBadge
                      status={`${getScoreBadgeType(track.unsignedScore)} ${track.unsignedScore}`}
                      size="sm"
                    />
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <button className="text-textSecondary hover:text-textPrimary transition-colors p-2 rounded-lg hover:bg-white/10">
                      <MoreHorizontal className="h-5 w-5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Card and Kanban views placeholder */}
      {viewMode === 'card' && (
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-12 text-center">
          <p className="text-textSecondary">Card view coming soon...</p>
        </div>
      )}
      {viewMode === 'kanban' && (
        <div className="bg-white/5 backdrop-blur-lg rounded-2xl border border-white/10 p-12 text-center">
          <p className="text-textSecondary">Kanban view coming soon...</p>
        </div>
      )}
    </div>
  );
}

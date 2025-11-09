interface StatsCardProps {
  title: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
}

export function StatsCard({
  title,
  value,
  icon,
  color,
  subtitle
}: StatsCardProps) {
  return (
    <div className="bg-white/5 backdrop-blur-lg rounded-2xl p-6 border border-white/10 hover:border-white/20 hover:bg-white/10 transition-all duration-300 hover:scale-105 cursor-pointer group" data-testid={`stats-card-${title.toLowerCase().replace(/\s+/g, '-')}`}>
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <p className="text-sm font-medium text-textSecondary group-hover:text-textPrimary transition-colors">
            {title}
          </p>
          <p className="text-4xl font-bold font-display text-textPrimary mt-2" data-testid={`stats-value-${title.toLowerCase().replace(/\s+/g, '-')}`}>
            {value}
          </p>
          {subtitle && (
            <p className="text-xs text-textSecondary mt-2">{subtitle}</p>
          )}
        </div>
        <div className={`p-3 rounded-xl ${color} flex-shrink-0 group-hover:scale-110 transition-transform duration-300`}>
          {icon}
        </div>
      </div>
    </div>
  );
}

interface StatusBadgeProps {
  status: 'accessible' | 'restricted' | 'error' | 'editorial' | 'api' | 'high' | 'medium' | 'low' | string;
  size?: 'sm' | 'md';
}

export function StatusBadge({
  status,
  size = 'md'
}: StatusBadgeProps) {
  const getStatusStyles = () => {
    const normalizedStatus = status.toLowerCase();
    
    switch (normalizedStatus) {
      case 'accessible':
        return 'bg-success/10 text-success border-success/20';
      case 'restricted':
        return 'bg-warning/10 text-warning border-warning/20';
      case 'error':
        return 'bg-error/10 text-error border-error/20';
      case 'editorial':
        return 'bg-purple/10 text-purple border-purple/20';
      case 'api':
        return 'bg-secondary/10 text-secondary border-secondary/20';
      case 'high':
      case 'high 8':
      case 'high 9':
      case 'high 10':
        return 'bg-success/10 text-success border-success/20';
      case 'medium':
      case 'medium 5':
      case 'medium 6':
      case 'medium 7':
        return 'bg-warning/10 text-warning border-warning/20';
      case 'low':
      case 'low 1':
      case 'low 2':
      case 'low 3':
      case 'low 4':
        return 'bg-error/10 text-error border-error/20';
      default:
        return 'bg-white/5 text-textSecondary border-white/10';
    }
  };

  const sizeClasses = size === 'sm' ? 'text-xs px-2.5 py-1' : 'text-sm px-3 py-1.5';

  return (
    <span 
      className={`inline-flex items-center rounded-full font-medium border backdrop-blur-sm ${sizeClasses} ${getStatusStyles()}`}
      data-testid={`status-badge-${status.toLowerCase().replace(/\s+/g, '-')}`}
    >
      {status}
    </span>
  );
}

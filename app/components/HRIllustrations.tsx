/**
 * HR-themed SVG illustrations for visual enhancement
 * Used throughout the application to make it more harmonious and appealing for HR professionals
 */

export function PeopleCollaborationIcon({ className = "w-32 h-32" }: { className?: string }) {
  return (
    <svg className={`grayscale ${className}`} viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
      {/* Three people in collaboration */}
      <circle cx="30" cy="30" r="12" fill="currentColor" opacity="0.3" />
      <path d="M 30 45 L 30 65 M 20 55 L 40 55" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.4" />

      <circle cx="90" cy="35" r="12" fill="currentColor" opacity="0.3" />
      <path d="M 90 50 L 90 70 M 80 60 L 100 60" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.4" />

      <circle cx="60" cy="50" r="14" fill="currentColor" opacity="0.2" />
      <path d="M 60 67 L 60 90 M 48 80 L 72 80" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.4" />

      {/* Handshake/collaboration symbol */}
      <path d="M 35 55 Q 50 45 65 55" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.5" />
      <path d="M 65 55 Q 75 60 85 60" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.5" />
    </svg>
  );
}

export function TimeManagementIcon({ className = "w-24 h-24" }: { className?: string }) {
  return (
    <svg className={`grayscale ${className}`} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      {/* Clock representing time management */}
      <circle cx="50" cy="50" r="40" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.3" />
      <path d="M 50 50 L 50 25" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <path d="M 50 50 L 70 50" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <circle cx="50" cy="50" r="4" fill="currentColor" opacity="0.4" />

      {/* Calendar accent */}
      <rect x="20" y="70" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4" rx="2" />
      <line x1="20" y1="76" x2="36" y2="76" stroke="currentColor" strokeWidth="1" opacity="0.3" />
    </svg>
  );
}

export function AnalyticsIcon({ className = "w-24 h-24" }: { className?: string }) {
  return (
    <svg className={`grayscale ${className}`} viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      {/* Bar chart representing analytics */}
      <rect x="15" y="60" width="12" height="25" fill="currentColor" opacity="0.3" />
      <rect x="35" y="45" width="12" height="40" fill="currentColor" opacity="0.4" />
      <rect x="55" y="35" width="12" height="50" fill="currentColor" opacity="0.5" />
      <rect x="75" y="25" width="12" height="60" fill="currentColor" opacity="0.6" />

      {/* Growth arrow */}
      <path d="M 20 80 L 80 30" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.4" strokeLinecap="round" />
      <path d="M 75 30 L 80 30 L 80 25" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.4" strokeLinecap="round" />
    </svg>
  );
}

export function PeopleIcon({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg className={`grayscale ${className}`} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      {/* Multiple people icon */}
      <circle cx="8" cy="7" r="3" fill="currentColor" opacity="0.6" />
      <path d="M 8 11 L 8 17 M 5 14 L 11 14" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.6" strokeLinecap="round" />

      <circle cx="16" cy="9" r="3" fill="currentColor" opacity="0.5" />
      <path d="M 16 13 L 16 19 M 13 16 L 19 16" stroke="currentColor" strokeWidth="1.5" fill="none" opacity="0.5" strokeLinecap="round" />
    </svg>
  );
}

export function CheckmarkIcon({ className = "w-12 h-12" }: { className?: string }) {
  return (
    <svg className={`grayscale ${className}`} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
      {/* Checkmark for success/completion */}
      <path d="M 3 12 L 9 18 L 21 6" stroke="currentColor" strokeWidth="2" fill="none" opacity="0.7" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function HRWelcomeBanner() {
  return (
    <div className="relative overflow-hidden rounded-lg bg-gradient-to-r from-card to-card p-8 mb-6 border border-border">
      <div className="relative flex items-center justify-between gap-8">
        <div className="flex-1">
          <h2 className="text-3xl font-bold text-foreground mb-2">
            Bem-vindo ao Sistema RH
          </h2>
          <p className="text-foreground text-lg">
            Gerenciamento moderno de recursos humanos com foco em pessoas
          </p>
        </div>
        <div className="hidden md:flex text-foreground">
          <PeopleCollaborationIcon className="w-32 h-32" />
        </div>
      </div>

      {/* Decorative elements */}
      <div className="absolute top-0 right-0 w-48 h-48 bg-card rounded-full mix-blend-multiply filter blur-3xl opacity-20 -z-10" />
      <div className="absolute bottom-0 left-12 w-48 h-48 bg-card rounded-full mix-blend-multiply filter blur-3xl opacity-20 -z-10" />
    </div>
  );
}

export function ModuleCard({
  icon: Icon,
  title,
  description
}: {
  icon: React.ComponentType<{ className?: string }>,
  title: string,
  description: string
}) {
  return (
    <div className="flex items-start gap-4 p-4 rounded-lg bg-gradient-to-br from-card to-card border border-border hover:shadow-md transition-shadow">
      <div className="text-foreground flex-shrink-0 mt-1">
        <Icon className="w-6 h-6" />
      </div>
      <div className="flex-1">
        <h3 className="font-semibold text-muted-foreground mb-1">{title}</h3>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}

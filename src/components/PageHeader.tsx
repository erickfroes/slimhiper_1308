import React from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
  breadcrumb?: { label: string; href?: string }[];
}

export default function PageHeader({ title, subtitle, actions, breadcrumb }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 mb-6">
      <div className="min-w-0">
        {breadcrumb && breadcrumb.length > 0 && (
          <nav className="flex items-center gap-1 mb-1">
            {breadcrumb.map((crumb, i) => (
              <React.Fragment key={`crumb-${i}`}>
                {i > 0 && <span className="text-muted-foreground text-xs">/</span>}
                {crumb.href ? (
                  <a href={crumb.href} className="text-xs text-muted-foreground hover:text-primary transition-colors">
                    {crumb.label}
                  </a>
                ) : (
                  <span className="text-xs text-muted-foreground">{crumb.label}</span>
                )}
              </React.Fragment>
            ))}
          </nav>
        )}
        <h1 className="text-2xl font-bold text-foreground tracking-tight truncate">{title}</h1>
        {subtitle && <p className="text-sm text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}
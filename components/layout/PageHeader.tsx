'use client';

interface PageHeaderProps {
  title: string;
  children?: React.ReactNode;
}

export default function PageHeader({ title, children }: PageHeaderProps) {
  return (
    <header className="main-header">
      <h1 className="main-header-title">{title}</h1>
      <div className="main-header-actions">
        {children}
      </div>
    </header>
  );
}

interface BreadcrumbItem {
  label: string;
  href?: string;
}

interface BreadcrumbProps {
  items: BreadcrumbItem[];
}

export function Breadcrumb({ items }: BreadcrumbProps) {
  return (
    <nav className="flex items-center gap-2 text-sm text-zinc-500">
      {items.map((item, i) => (
        <span key={`${item.label}-${i}`} className="flex items-center gap-2">
          {i > 0 && <span>/</span>}
          {item.href ? (
            <a href={item.href} className="hover:text-zinc-700 dark:hover:text-zinc-300">
              {item.label}
            </a>
          ) : (
            <span className="text-zinc-900 dark:text-white">{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

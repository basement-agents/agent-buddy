export function EmptyState({ icon, title, description, action }: { icon?: React.ReactNode; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-zinc-300 p-8 text-center dark:border-zinc-700">
      {icon && <div className="mb-3">{icon}</div>}
      <p className="text-sm font-medium text-zinc-600 dark:text-zinc-400">{title}</p>
      {description && <p className="mt-1 text-xs text-zinc-500">{description}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

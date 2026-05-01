import { Spinner } from "~/components/system/spinner";

function StatusWrapper({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center justify-center py-8" role="status" aria-live="polite">
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

export function HomePageSkeleton() {
  return (
    <StatusWrapper label="Loading dashboard...">
      <Spinner size="medium" />
    </StatusWrapper>
  );
}

export function SettingsPageSkeleton() {
  return (
    <StatusWrapper label="Loading settings...">
      <Spinner size="medium" />
    </StatusWrapper>
  );
}

export function ReposPageSkeleton() {
  return (
    <StatusWrapper label="Loading repositories...">
      <Spinner size="medium" />
    </StatusWrapper>
  );
}

export function BuddyDetailPageSkeleton() {
  return (
    <StatusWrapper label="Loading buddy profile...">
      <Spinner size="medium" />
    </StatusWrapper>
  );
}

export function BuddyComparePageSkeleton() {
  return (
    <StatusWrapper label="Loading comparison...">
      <Spinner size="medium" />
    </StatusWrapper>
  );
}

export function GenericPageSkeleton() {
  return (
    <StatusWrapper label="Loading...">
      <Spinner size="medium" />
    </StatusWrapper>
  );
}

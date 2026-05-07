import { Layout } from "~/components/layout/layout";
import { ToastProvider } from "~/components/system/toast";
import { ErrorBoundary } from "~/components/shared/error-boundary";
import { Spinner } from "~/components/system/spinner";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "~/lib/query-client";
import * as React from "react";
import { useState, useEffect } from "react";

const HomePage = React.lazy(() => import("~/pages/home/index").then(m => ({ default: m.HomePage })));
const ReposPage = React.lazy(() => import("~/pages/repos/index").then(m => ({ default: m.ReposPage })));
const RepoDetailPage = React.lazy(() => import("~/pages/repo-detail/index").then(m => ({ default: m.RepoDetailPage })));
const BuddiesPage = React.lazy(() => import("~/pages/buddies/index").then(m => ({ default: m.BuddiesPage })));
const BuddyDetailPage = React.lazy(() => import("~/pages/buddy-detail/index").then(m => ({ default: m.BuddyDetailPage })));
const BuddyComparePage = React.lazy(() => import("~/pages/buddy-compare/index").then(m => ({ default: m.BuddyComparePage })));
const ReviewsPage = React.lazy(() => import("~/pages/reviews/index").then(m => ({ default: m.ReviewsPage })));
const ReviewDetailPage = React.lazy(() => import("~/pages/review-detail-page/index").then(m => ({ default: m.ReviewDetailPage })));
const JobsPage = React.lazy(() => import("~/pages/jobs/index").then(m => ({ default: m.JobsPage })));
const SettingsPage = React.lazy(() => import("~/pages/settings/index").then(m => ({ default: m.SettingsPage })));
const NotFoundPage = React.lazy(() => import("~/pages/not-found/index").then(m => ({ default: m.NotFoundPage })));

function LoadingFallback() {
  return (
    <div className="flex h-full min-h-[40vh] items-center justify-center" role="status" aria-live="polite">
      <span className="sr-only">Loading...</span>
      <Spinner size="medium" />
    </div>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return (
    <ErrorBoundary>
      <React.Suspense fallback={<LoadingFallback />}>{children}</React.Suspense>
    </ErrorBoundary>
  );
}

type RouteEntry =
  | { kind: "pattern"; path: RegExp; render: (match: RegExpMatchArray) => React.ReactNode }
  | { kind: "static"; path: string; render: () => React.ReactNode };

const routes: RouteEntry[] = [
  { kind: "pattern", path: /^\/repos\/([^/]+)\/([^/]+)$/, render: (match) => <RepoDetailPage owner={match[1]} repo={match[2]} /> },
  { kind: "pattern", path: /^\/buddies\/compare$/, render: () => <BuddyComparePage /> },
  { kind: "pattern", path: /^\/buddies\/(.+)$/, render: (match) => <BuddyDetailPage buddyId={match[1]} /> },
  { kind: "pattern", path: /^\/reviews\/(.+)$/, render: (match) => <ReviewDetailPage reviewIndex={match[1]} /> },
  { kind: "static", path: "/", render: () => <HomePage /> },
  { kind: "static", path: "/repos", render: () => <ReposPage /> },
  { kind: "static", path: "/buddies", render: () => <BuddiesPage /> },
  { kind: "static", path: "/reviews", render: () => <ReviewsPage /> },
  { kind: "static", path: "/jobs", render: () => <JobsPage /> },
  { kind: "static", path: "/settings", render: () => <SettingsPage /> },
];

function Router() {
  const [, setTick] = useState(0);
  useEffect(() => {
    const handler = () => setTick((t) => t + 1);
    window.addEventListener("popstate", handler);
    window.addEventListener("app:navigate", handler);
    return () => {
      window.removeEventListener("popstate", handler);
      window.removeEventListener("app:navigate", handler);
    };
  }, []);
  const path = window.location.pathname;

  for (const route of routes) {
    if (route.kind === "pattern") {
      const match = path.match(route.path);
      if (match) {
        return <Page>{route.render(match)}</Page>;
      }
    } else if (path === route.path || (route.path === "/" && path === "")) {
      return <Page>{route.render()}</Page>;
    }
  }

  return <Page><NotFoundPage /></Page>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <ErrorBoundary>
          <Layout>
            <Router />
          </Layout>
        </ErrorBoundary>
      </ToastProvider>
    </QueryClientProvider>
  );
}

export default App;

import { Layout } from "@/components/layout/Layout";
import { ToastProvider } from "@/components/ui/toast";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Skeleton } from "@/components/ui/skeleton";
import * as React from "react";
import { useState, useEffect } from "react";

// Lazy load all page components
const HomePage = React.lazy(() => import("@/pages/Home").then(m => ({ default: m.HomePage })));
const ReposPage = React.lazy(() => import("@/pages/Repos").then(m => ({ default: m.ReposPage })));
const RepoDetailPage = React.lazy(() => import("@/pages/RepoDetail").then(m => ({ default: m.RepoDetailPage })));
const BuddiesPage = React.lazy(() => import("@/pages/Buddies").then(m => ({ default: m.BuddiesPage })));
const BuddyDetailPage = React.lazy(() => import("@/pages/BuddyDetail").then(m => ({ default: m.BuddyDetailPage })));
const BuddyComparePage = React.lazy(() => import("@/pages/BuddyCompare").then(m => ({ default: m.BuddyComparePage })));
const ReviewsPage = React.lazy(() => import("@/pages/Reviews").then(m => ({ default: m.ReviewsPage })));
const ReviewDetailPage = React.lazy(() => import("@/pages/ReviewDetailPage").then(m => ({ default: m.ReviewDetailPage })));
const JobsPage = React.lazy(() => import("@/pages/Jobs").then(m => ({ default: m.JobsPage })));
const SettingsPage = React.lazy(() => import("@/pages/Settings").then(m => ({ default: m.SettingsPage })));
const NotFoundPage = React.lazy(() => import("@/pages/NotFound").then(m => ({ default: m.NotFoundPage })));

function LoadingFallback() {
  return (
    <div className="space-y-4 p-6">
      <Skeleton className="h-6 w-48" />
      <div className="space-y-2">
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    </div>
  );
}

function Page({ children }: { children: React.ReactNode }) {
  return <React.Suspense fallback={<LoadingFallback />}>{children}</React.Suspense>;
}

interface RouteEntry {
  path: string | RegExp;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: React.LazyExoticComponent<React.ComponentType<any>>;
  props?: (match: RegExpMatchArray) => Record<string, unknown>;
}

const routes: RouteEntry[] = [
  { path: /^\/repos\/([^/]+)\/([^/]+)$/, component: RepoDetailPage, props: (m) => ({ owner: m[1], repo: m[2] }) },
  { path: /^\/buddies\/compare$/, component: BuddyComparePage },
  { path: /^\/buddies\/(.+)$/, component: BuddyDetailPage, props: (m) => ({ buddyId: m[1] }) },
  { path: /^\/reviews\/(.+)$/, component: ReviewDetailPage, props: (m) => ({ reviewIndex: m[1] }) },
  { path: "/", component: HomePage },
  { path: "/repos", component: ReposPage },
  { path: "/buddies", component: BuddiesPage },
  { path: "/reviews", component: ReviewsPage },
  { path: "/jobs", component: JobsPage },
  { path: "/settings", component: SettingsPage },
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
    if (route.path instanceof RegExp) {
      const match = path.match(route.path);
      if (match) {
        const Comp = route.component;
        return <Page><Comp {...(route.props?.(match) ?? {})} /></Page>;
      }
    } else if (path === route.path || (route.path === "/" && path === "")) {
      const Comp = route.component;
      return <Page><Comp /></Page>;
    }
  }

  return <Page><NotFoundPage /></Page>;
}

function App() {
  return (
    <ToastProvider>
      <ErrorBoundary>
        <Layout>
          <Router />
        </Layout>
      </ErrorBoundary>
    </ToastProvider>
  );
}

export default App;

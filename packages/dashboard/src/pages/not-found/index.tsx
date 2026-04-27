import { useNavigate } from "~/lib/hooks";
import { Button } from "~/components/system/button";

export function NotFoundPage() {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col items-center justify-center py-24">
      <p className="text-7xl font-bold text-zinc-200 dark:text-zinc-800">404</p>
      <h1 className="mt-4 text-2xl font-bold text-zinc-900 dark:text-white">Page not found</h1>
      <p className="mt-2 text-sm text-zinc-500">The page you're looking for doesn't exist.</p>
      <Button className="mt-6" onClick={() => navigate("/")}>Go Home</Button>
    </div>
  );
}

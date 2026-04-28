import * as React from "react";
import { cn } from "~/lib/utils";

function NativeSelect({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      className={cn(
        "w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm dark:border-zinc-700 dark:bg-zinc-900",
        className
      )}
      {...props}
    />
  );
}

export { NativeSelect };

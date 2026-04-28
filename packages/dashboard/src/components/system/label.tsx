import * as React from "react";
import { cn } from "~/lib/utils";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label
      className={cn("mb-1 block text-sm font-medium text-zinc-700 dark:text-zinc-300", className)}
      {...props}
    />
  );
}

export { Label };

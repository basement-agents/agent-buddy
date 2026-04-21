import * as React from "react";
import { cn } from "@/lib/utils";

function Checkbox({ className, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type="checkbox"
      className={cn("h-4 w-4 rounded border-zinc-300", className)}
      {...props}
    />
  );
}

export { Checkbox };

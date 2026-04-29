import { Component, type ReactNode, type ErrorInfo } from "react";
import { Button } from "~/components/system/button";
import { Card, CardContent } from "~/components/system/card";

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="flex h-screen items-center justify-center bg-[var(--ds-color-surface-secondary)]">
          <Card className="max-w-md">
            <CardContent className="p-6">
              <h2 className="mb-2 text-xl font-semibold text-[var(--ds-color-text-primary)]">Something went wrong</h2>
              <p className="mb-4 text-sm text-[var(--ds-color-text-secondary)]">
                {this.state.error?.message || "An unexpected error occurred"}
              </p>
              <Button size="small" onClick={this.handleReset}>
                Try Again
              </Button>
            </CardContent>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

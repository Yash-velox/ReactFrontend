import AonePage from "./AonePage";
import { Component, type ErrorInfo, type ReactNode } from "react";

type Props = {
  children: ReactNode;
};

type State = {
  error: Error | null;
};

/**
 * Catches render/lifecycle crashes so the Admin iframe never stays a blank white page.
 * Auth and data errors should still be handled in screens; this is the last safety net.
 */
export class AppErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("AppErrorBoundary caught", error, info.componentStack);
  }

  private handleRetry = () => {
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <AonePage heading="Something went wrong">
        <s-section>
          <s-box padding="base" borderWidth="base" borderRadius="base">
            <s-stack direction="block" gap="base">
              <s-text tone="critical">
                {error.message || "The app crashed while rendering."}
              </s-text>
              <s-paragraph>
                Hard-refresh this Admin tab, or re-open Apps → Image-Enhancement-UAT. If the
                problem continues, confirm tunnels are up and the Partner application URL matches
                the live frontend tunnel.
              </s-paragraph>
              <s-button onClick={this.handleRetry}>Try again</s-button>
            </s-stack>
          </s-box>
        </s-section>
      </AonePage>
    );
  }
}

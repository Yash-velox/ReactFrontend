type Props = {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
};

export default function ErrorBanner({ message, onRetry, retryLabel = "Try again" }: Props) {
  return (
    <s-banner tone="critical" heading="Something went wrong">
      <s-stack direction="block" gap="small">
        <s-paragraph>{message}</s-paragraph>
        {onRetry ? (
          <s-button onClick={onRetry}>{retryLabel}</s-button>
        ) : null}
      </s-stack>
    </s-banner>
  );
}

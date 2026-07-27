type FinalResultActionsProps = {
  canDownload: boolean;
  onDownloadFinal: () => void;
  onStartAgain: () => void;
  onRetryFromFailedStep?: () => void;
};

export default function FinalResultActions({
  canDownload,
  onDownloadFinal,
  onStartAgain,
  onRetryFromFailedStep,
}: FinalResultActionsProps) {
  return (
    <s-section heading="Actions">
      <s-stack direction="inline" gap="base">
        <s-button variant="primary" disabled={!canDownload} onClick={onDownloadFinal}>
          Download Final Image
        </s-button>
        {onRetryFromFailedStep ? (
          <s-button tone="critical" onClick={onRetryFromFailedStep}>
            Retry From Failed Step
          </s-button>
        ) : null}
        <s-button onClick={onStartAgain}>Start Again</s-button>
      </s-stack>
    </s-section>
  );
}

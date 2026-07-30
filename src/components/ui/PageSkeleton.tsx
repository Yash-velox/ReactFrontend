type Props = {
  metricCount?: number;
  tableRows?: number;
};

export default function PageSkeleton({ metricCount = 4, tableRows = 5 }: Props) {
  return (
    <s-stack direction="block" gap="base">
      <div className="aone-metrics">
        {Array.from({ length: metricCount }, (_, i) => (
          <div key={i} className="aone-skeleton aone-skeleton-metric" aria-hidden="true" />
        ))}
      </div>
      <div aria-hidden="true">
        {Array.from({ length: tableRows }, (_, i) => (
          <div key={i} className="aone-skeleton aone-skeleton-table-row" />
        ))}
      </div>
    </s-stack>
  );
}

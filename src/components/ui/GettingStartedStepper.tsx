import { navigateApp } from "../../utils/routes";

export type SetupStepStatus = "complete" | "current" | "upcoming";

export type SetupStep = {
  id: string;
  label: string;
  hint: string;
  status: SetupStepStatus;
  /** In-app path passed to navigateApp; omit when the step has no destination */
  href?: string;
};

type Props = {
  steps: SetupStep[];
  loading?: boolean;
};

function nodeContent(step: SetupStep, index: number): string {
  if (step.status === "complete") return "✓";
  return String(index + 1);
}

export default function GettingStartedStepper({ steps, loading }: Props) {
  if (loading) {
    return (
      <div className="aone-stepper aone-stepper--loading" aria-hidden="true">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="aone-stepper-item">
            <div className="aone-skeleton aone-stepper-node-skeleton" />
            <div className="aone-skeleton aone-skeleton-line aone-skeleton-line-short" />
            {i < 4 ? <span className="aone-stepper-connector" aria-hidden="true" /> : null}
          </div>
        ))}
      </div>
    );
  }

  const currentIndex = steps.findIndex((s) => s.status === "current");
  const allComplete = steps.length > 0 && steps.every((s) => s.status === "complete");

  return (
    <div className="aone-stepper-wrap">
      <ol className="aone-stepper" aria-label="Getting started steps">
        {steps.map((step, index) => {
          const clickable = Boolean(step.href);
          const isCurrent = step.status === "current";
          const className = [
            "aone-stepper-item",
            `is-${step.status}`,
            clickable ? "is-clickable" : "",
          ]
            .filter(Boolean)
            .join(" ");

          const body = (
            <>
              <span className="aone-stepper-node" aria-hidden="true">
                {nodeContent(step, index)}
              </span>
              <span className="aone-stepper-text">
                <span className="aone-stepper-label">{step.label}</span>
                <span className="aone-stepper-hint">{step.hint}</span>
              </span>
            </>
          );

          return (
            <li key={step.id} className={className}>
              {clickable ? (
                <button
                  type="button"
                  className="aone-stepper-hit"
                  aria-current={isCurrent ? "step" : undefined}
                  onClick={() => {
                    if (step.href) navigateApp(step.href);
                  }}
                >
                  {body}
                </button>
              ) : (
                <div className="aone-stepper-hit" aria-current={isCurrent ? "step" : undefined}>
                  {body}
                </div>
              )}
              {index < steps.length - 1 ? (
                <span
                  className={`aone-stepper-connector${
                    step.status === "complete" ? " is-complete" : ""
                  }`}
                  aria-hidden="true"
                />
              ) : null}
            </li>
          );
        })}
      </ol>
      <p className="aone-stepper-caption">
        {allComplete
          ? "You're all set — use At a glance below to monitor ongoing work."
          : currentIndex >= 0
            ? `Step ${currentIndex + 1} of ${steps.length}: ${steps[currentIndex].hint}`
            : null}
      </p>
    </div>
  );
}

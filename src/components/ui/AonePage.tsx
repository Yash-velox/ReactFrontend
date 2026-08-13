import { useLayoutEffect, useRef, type ReactNode } from "react";

type InlineSize = "small" | "base" | "large";

type Props = {
  heading: string;
  children?: ReactNode;
  /** Polaris page width. Default large — base caps cards around 966px and leaves empty side space. */
  inlineSize?: InlineSize;
};

/**
 * Thin wrapper around Polaris `<s-page>`.
 * React attribute casing can fail to apply `inlineSize` on the web component, which
 * silently falls back to `base` (max ~966px). We set the JS property explicitly.
 */
export default function AonePage({ heading, children, inlineSize = "large" }: Props) {
  const ref = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = ref.current as (HTMLElement & { inlineSize?: InlineSize }) | null;
    if (!el) return;
    el.inlineSize = inlineSize;
    el.setAttribute("inline-size", inlineSize);
  }, [inlineSize]);

  return (
    // @ts-expect-error polaris custom element; ref + camelCase prop for React binding
    <s-page ref={ref} heading={heading} inlineSize={inlineSize}>
      {children}
    </s-page>
  );
}

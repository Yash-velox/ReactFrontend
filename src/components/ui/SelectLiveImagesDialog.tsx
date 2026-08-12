import { useModalOverlay } from "./useModalOverlay";

export type SelectableLiveImage = {
  key: string;
  mediaGid: string;
  cdnUrl?: string | null;
  label: string;
  title: string;
};

type Props = {
  open: boolean;
  images: SelectableLiveImage[];
  selectedGids: string[];
  busy?: boolean;
  onToggle: (mediaGid: string) => void;
  onSelectAll: () => void;
  onClear: () => void;
  onContinue: () => void;
  onCancel: () => void;
};

export default function SelectLiveImagesDialog({
  open,
  images,
  selectedGids,
  busy = false,
  onToggle,
  onSelectAll,
  onClear,
  onContinue,
  onCancel,
}: Props) {
  const { id: modalId, ref: modalRef, dismiss } = useModalOverlay(open, onCancel);

  if (!open) return null;

  const selectedCount = selectedGids.length;

  return (
    <s-modal id={modalId} ref={modalRef} heading="Select images to reprocess">
      <s-stack direction="block" gap="base">
        <s-paragraph>
          Choose the live Shopify images to reprocess. Next you can edit the prompt. Apply publishes
          automatically and cannot be undone on its own.
        </s-paragraph>

        {images.length === 0 ? (
          <s-banner tone="warning" heading="No live images">
            <s-paragraph>This product has no visible live images to reprocess.</s-paragraph>
          </s-banner>
        ) : (
          <>
            <div className="aone-toolbar" style={{ flexWrap: "wrap", gap: "0.5rem" }}>
              <s-button onClick={onSelectAll} disabled={busy}>
                Select all
              </s-button>
              <s-button onClick={onClear} disabled={busy || selectedCount === 0}>
                Clear
              </s-button>
              <s-text>
                {selectedCount} selected
              </s-text>
            </div>
            <div className="aone-media-grid aone-media-grid-lg aone-modal-media-grid">
              {images.map((tile) => {
                const selected = selectedGids.includes(tile.mediaGid);
                return (
                  <figure
                    key={tile.key}
                    className={`aone-media-tile is-selectable${selected ? " is-selected" : ""}`}
                    title={tile.title}
                    onClick={() => {
                      if (!busy) onToggle(tile.mediaGid);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        if (!busy) onToggle(tile.mediaGid);
                      }
                    }}
                    role="checkbox"
                    aria-checked={selected}
                    tabIndex={0}
                  >
                    <span className="aone-media-tile-check" aria-hidden="true">
                      <input type="checkbox" checked={selected} readOnly tabIndex={-1} />
                    </span>
                    {tile.cdnUrl ? (
                      <img src={tile.cdnUrl} alt={tile.title} className="aone-media-tile-img" />
                    ) : (
                      <div className="aone-media-tile-fallback">No preview</div>
                    )}
                    <figcaption className="aone-media-tile-caption">
                      <span className="aone-media-tile-type">{tile.label}</span>
                      <span className="aone-media-tile-filename" title={tile.title}>
                        {tile.title}
                      </span>
                    </figcaption>
                  </figure>
                );
              })}
            </div>
          </>
        )}

        <div className="aone-toolbar">
          <s-button onClick={dismiss} disabled={busy}>
            Cancel
          </s-button>
          <s-button
            variant="primary"
            disabled={busy || selectedCount === 0}
            onClick={onContinue}
          >
            Continue ({selectedCount})
          </s-button>
        </div>
      </s-stack>
    </s-modal>
  );
}

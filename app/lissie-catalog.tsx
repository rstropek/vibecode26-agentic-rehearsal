import {
  basicCatalog,
  Catalog,
  createReactComponent,
  DataBindingSchema,
  DynamicNumberSchema,
  DynamicStringSchema,
} from "@copilotkit/a2ui-renderer";
import { LISSIE_CATALOG_ID } from "@/lib/lissie-tool-schemas";

// The A2UI catalog the chat renders Lissie's surfaces with: the basic components plus a ProgressBar, for the
// progress card that her showProgress tool builds (lib/lissie-tools.ts). See tech-docs/agent.md.

// A bar for `value` out of `max`, with the label and the count above it. Inside the chat, muted text reads
// --color-muted, because CopilotKit redefines --muted as a surface (tech-docs/ui.md).
export function ProgressBar({
  label,
  value,
  max,
}: {
  label: string;
  value: number;
  max: number;
}) {
  const total = Number.isFinite(max) && max > 0 ? max : 0;
  const current = Number.isFinite(value)
    ? Math.min(Math.max(value, 0), total)
    : 0;
  const percent = total === 0 ? 0 : (current / total) * 100;
  return (
    <div className="m-2 flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-4 text-sm">
        <span className="font-semibold text-ink">{label}</span>
        <span className="text-(--color-muted) tabular-nums">
          {current} of {total}
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={current}
        aria-valuetext={`${current} of ${total}`}
        className="h-2 overflow-hidden rounded-full bg-line"
      >
        <div className="h-full bg-amber" style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

// A2UI's binder resolves a prop from the data model only when its schema is a Zod 3 union with a { path } member,
// and it reads Zod 3 internals, which the app's Zod 4 schemas lack. So the props are A2UI's own Dynamic* schemas,
// on an empty object made from DataBindingSchema without its path. createCatalog would type them against the
// renderer's private Zod copy, so the catalog is put together from the parts createCatalog uses.
const progressBarApi = {
  name: "ProgressBar",
  schema: DataBindingSchema.omit({ path: true }).extend({
    label: DynamicStringSchema.describe("What is being counted"),
    value: DynamicNumberSchema.describe("How many are done"),
    max: DynamicNumberSchema.describe("How many there are in all"),
  }),
};

export const lissieCatalog = new Catalog(
  LISSIE_CATALOG_ID,
  [
    ...basicCatalog.components.values(),
    createReactComponent(progressBarApi, ({ props }) => (
      <ProgressBar label={props.label} value={props.value} max={props.max} />
    )),
  ],
  [...basicCatalog.functions.values()],
);

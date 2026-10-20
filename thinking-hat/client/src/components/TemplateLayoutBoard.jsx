import { useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import ManagementReportView from "./ManagementReportView";
import { Button } from "./ui";

function clampZoom(value) {
  return Math.min(1, Math.max(0.25, Math.round(value * 100) / 100));
}

function LayoutCard({ section, template, zoom, overId, activeId, onEdit, onDelete, disabled }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: section.id,
    disabled,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };
  const showDrop = overId === section.id && activeId && activeId !== section.id;
  const omitted = template !== "purple-hat-demo" && (section.presentation === "aging" || section.presentation === "ecommerce");
  return (
    <article
      ref={setNodeRef}
      style={style}
      data-section-card
      className={`rounded-3xl border bg-white p-3 shadow-card ${section.hidden ? "opacity-60" : ""} ${isDragging ? "border-plum" : "border-[rgba(109,40,217,0.12)]"}`}
    >
      {showDrop ? <div className="mb-3 h-1.5 rounded-full bg-plum" aria-hidden="true" /> : null}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          ref={setActivatorNodeRef}
          className="inline-flex h-11 w-11 cursor-grab items-center justify-center rounded-2xl border border-[rgba(109,40,217,0.16)] text-plum active:cursor-grabbing"
          aria-label={`Drag ${section.title}`}
          {...attributes}
          {...listeners}
        >
          <span aria-hidden="true" className="text-lg leading-none">⋮⋮</span>
        </button>
        <div className="min-w-0 flex-1">
          <h3 className="truncate font-display text-lg font-extrabold text-ink">{section.title}</h3>
          {section.hidden ? <p className="text-xs font-semibold text-mute">Hidden in the report</p> : null}
        </div>
        <Button type="button" variant="quiet" onClick={() => onEdit(section)} disabled={disabled}>Edit</Button>
        <Button type="button" variant="ghost" onClick={() => onDelete(section)} disabled={disabled}>Delete</Button>
      </div>
      {omitted ? (
        <p className="mt-3 text-sm text-mute">This report layout does not include aging or e-commerce pages.</p>
      ) : null}
      <div data-preview className="mt-3 overflow-hidden rounded-2xl border border-[rgba(109,40,217,0.08)] bg-[#fbfaff]" style={{ zoom }}>
        <ManagementReportView
          report={{ sections: [{ ...section, hidden: false }], customOrder: true }}
          template={template}
        />
      </div>
    </article>
  );
}

export default function TemplateLayoutBoard({ sections, template, onReorder, onEdit, onDelete, disabled }) {
  const [zoom, setZoom] = useState(0.45);
  const [overId, setOverId] = useState(null);
  const [activeId, setActiveId] = useState(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  function fitToScreen(event) {
    const viewport = event.currentTarget.closest("[data-layout-board]")?.querySelector("[data-layout-viewport]");
    if (!viewport) return;
    const previews = [...viewport.querySelectorAll("[data-preview]")];
    if (!previews.length) return;
    const natural = previews.reduce((sum, preview) => sum + preview.getBoundingClientRect().height / zoom, 0);
    const chrome = [...viewport.querySelectorAll("[data-section-card]")].reduce((sum, card) => {
      const preview = card.querySelector("[data-preview]");
      const previewHeight = preview ? preview.getBoundingClientRect().height : 0;
      return sum + Math.max(0, card.getBoundingClientRect().height - previewHeight);
    }, 0);
    const available = Math.max(160, viewport.clientHeight - 32 - chrome);
    setZoom(clampZoom(available / Math.max(natural, 1)));
  }

  function finishDrag(event) {
    setOverId(null);
    setActiveId(null);
    const over = event.over;
    if (!over || event.active.id === over.id) return;
    const ids = sections.map((section) => section.id);
    const oldIndex = ids.indexOf(event.active.id);
    const newIndex = ids.indexOf(over.id);
    if (oldIndex < 0 || newIndex < 0) return;
    const next = ids.slice();
    const [moved] = next.splice(oldIndex, 1);
    next.splice(newIndex, 0, moved);
    onReorder(next);
  }

  if (!sections.length) {
    return <p className="text-mute">This template has no sections.</p>;
  }

  return (
    <div data-layout-board>
      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-[rgba(109,40,217,0.1)] bg-white p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <Button type="button" variant="quiet" onClick={() => setZoom((value) => clampZoom(value - 0.1))}>Zoom out</Button>
        <label className="flex min-w-0 flex-1 items-center gap-3 text-sm font-semibold text-ink">
          <span className="shrink-0">Zoom</span>
          <input
            type="range"
            min="25"
            max="100"
            step="1"
            value={Math.round(zoom * 100)}
            aria-valuemin={25}
            aria-valuemax={100}
            aria-valuenow={Math.round(zoom * 100)}
            aria-label="Fit to screen zoom"
            className="min-w-[8rem] flex-1 accent-[#6d28d9]"
            onChange={(event) => setZoom(clampZoom(Number(event.target.value) / 100))}
          />
          <span className="w-12 tabular-nums">{Math.round(zoom * 100)}%</span>
        </label>
        <Button type="button" variant="quiet" onClick={() => setZoom((value) => clampZoom(value + 0.1))}>Zoom in</Button>
        <Button type="button" variant="ghost" onClick={fitToScreen}>Fit to screen</Button>
      </div>
      <div data-layout-viewport className="max-h-[75vh] space-y-4 overflow-auto rounded-3xl border border-[rgba(109,40,217,0.1)] bg-[#f7f4ff] p-3 sm:p-4">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={(event) => setActiveId(event.active.id)}
          onDragOver={(event) => setOverId(event.over?.id ?? null)}
          onDragCancel={() => { setOverId(null); setActiveId(null); }}
          onDragEnd={finishDrag}
        >
          <SortableContext items={sections.map((section) => section.id)} strategy={verticalListSortingStrategy}>
            {sections.map((section) => (
              <LayoutCard
                key={section.id}
                section={section}
                template={template}
                zoom={zoom}
                overId={overId}
                activeId={activeId}
                onEdit={onEdit}
                onDelete={onDelete}
                disabled={disabled}
              />
            ))}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
}

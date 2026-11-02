import { MODULE_LAYOUT, NODE_SIZE } from "../config/constants";
import { nodeId } from "./helpers";
import { lessonOffsetInModule, moduleHeight, modulesColumn, resolveFreePositions } from "./layout";
import type { DndDraft } from "../model/types";

export interface NodeData extends Record<string, unknown> {
  entityId: string;
}

/** Узел холста в формате React Flow с подписью для скринридера. */
export interface DndNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: NodeData;
  parentId?: string;
  style?: { width: number; height: number };
  width?: number;
  height?: number;
  zIndex?: number;
  ariaLabel?: string;
  selectable?: boolean;
  connectable?: boolean;
  draggable?: boolean;
}

export interface DndEdge {
  id: string;
  source: string;
  target: string;
  kind: "module" | "material";
}

type GraphState = Pick<
  DndDraft,
  "course" | "materials" | "lessons" | "modules" | "positions" | "showUsedMaterials"
>;

// Стабильные объекты data, чтобы мемоизированные узлы не перерисовывались зря.
const dataCache = new Map<string, NodeData>();
function stableData(id: string, entityId: string): NodeData {
  const cached = dataCache.get(id);
  if (cached && cached.entityId === entityId) return cached;
  const data = { entityId };
  dataCache.set(id, data);
  return data;
}

/** Строка-подпись структуры: граф пересчитывается, только когда она меняется. */
export function structureSignature(state: GraphState): string {
  if (!state.course?.id) return "";
  return JSON.stringify([
    state.course.id,
    state.materials.map((item) => [item.id, item.lessonId]),
    state.lessons.map((item) => item.id),
    state.modules.map((item) => [item.id, item.order, item.lessonIds]),
    state.positions,
    Boolean(state.showUsedMaterials),
  ]);
}

export function buildGraph(state: GraphState): {
  nodes: DndNode[];
  edges: DndEdge[];
} {
  const nodes: DndNode[] = [];
  const edges: DndEdge[] = [];
  if (!state.course?.id) return { nodes, edges };

  const free = resolveFreePositions(state);
  const assigned = new Set(state.modules.flatMap((module) => module.lessonIds));

  modulesColumn(state.modules, state.positions || {}).forEach((rect) => {
    const module = state.modules.find((item) => item.id === rect.id);
    if (!module) return; // прямоугольники строятся по тем же модулям
    const id = nodeId.module(module.id);
    nodes.push({
      id,
      type: "module",
      position: { x: rect.x, y: rect.y },
      data: stableData(id, module.id),
      style: { width: MODULE_LAYOUT.width, height: moduleHeight(module.lessonIds.length) },
      width: MODULE_LAYOUT.width,
      height: moduleHeight(module.lessonIds.length),
      zIndex: 0,
      ariaLabel: `Модуль «${module.title}»`,
    });
    module.lessonIds.forEach((lessonId, index) => {
      const lessonNode = nodeId.lesson(lessonId);
      nodes.push({
        id: lessonNode,
        type: "lesson",
        parentId: id,
        position: lessonOffsetInModule(index),
        data: stableData(lessonNode, lessonId),
        width: NODE_SIZE.lesson.width,
        height: NODE_SIZE.lesson.height,
        zIndex: 1,
      });
    });
    edges.push({
      id: `edge:${id}->course`,
      source: id,
      target: "course",
      kind: "module",
    });
  });

  nodes.push({
    id: "course",
    type: "course",
    position: free.course,
    data: stableData("course", "course"),
    width: NODE_SIZE.course.width,
    height: NODE_SIZE.course.height,
    zIndex: 2,
  });

  nodes.push({
    id: "upload",
    type: "upload",
    position: free.upload,
    data: stableData("upload", "upload"),
    selectable: false,
    connectable: false,
    draggable: false,
    width: NODE_SIZE.upload.width,
    height: NODE_SIZE.upload.height,
  });

  state.lessons
    .filter((lesson) => !assigned.has(lesson.id))
    .forEach((lesson) => {
      const id = nodeId.lesson(lesson.id);
      nodes.push({
        id,
        type: "lesson",
        position: free[id],
        data: stableData(id, lesson.id),
        width: NODE_SIZE.lesson.width,
        height: NODE_SIZE.lesson.height,
        zIndex: 2,
      });
    });

  state.materials
    .filter((material) => state.showUsedMaterials || !material.lessonId)
    .forEach((material) => {
    const id = nodeId.material(material.id);
    nodes.push({
      id,
      type: "material",
      position: free[id],
      data: stableData(id, material.id),
      width: NODE_SIZE.material.width,
      height: NODE_SIZE.material.height,
      zIndex: 2,
    });
    if (material.lessonId && state.lessons.some((lesson) => lesson.id === material.lessonId)) {
      const target = nodeId.lesson(material.lessonId);
      edges.push({
        id: `edge:${id}->${target}`,
        source: id,
        target,
        kind: "material",
      });
    }
  });

  return { nodes, edges };
}

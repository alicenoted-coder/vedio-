// 平台（尤其 Meta 系）會把資料埋在深層、又常改名的 JSON 結構裡。
// 與其鎖死路徑，不如遞迴掃整棵樹、用「形狀」找出我們要的物件，
// 這樣平台小改 schema 時比較不會整支爛掉。

type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

// 對 JSON 樹做深度優先走訪，對每個物件節點呼叫 visitor。
export function walk(
  node: unknown,
  visitor: (obj: Record<string, unknown>) => void,
  seen = new WeakSet<object>()
): void {
  if (node === null || typeof node !== "object") return;
  if (seen.has(node as object)) return;
  seen.add(node as object);

  if (Array.isArray(node)) {
    for (const child of node) walk(child, visitor, seen);
    return;
  }

  const obj = node as Record<string, unknown>;
  visitor(obj);
  for (const key of Object.keys(obj)) {
    walk(obj[key], visitor, seen);
  }
}

// 從可能是 HTML 內嵌 <script> 或 fetch 回應的字串中，盡力挑出 JSON 片段。
export function tryParseJson(text: string): JsonValue | null {
  try {
    return JSON.parse(text) as JsonValue;
  } catch {
    return null;
  }
}

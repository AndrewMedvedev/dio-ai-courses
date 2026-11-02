import { Fragment, type ComponentPropsWithoutRef, type ReactNode } from "react";

const languageAliases: Record<string, string> = {
  py: "python",
  python3: "python",
  js: "javascript",
  jsx: "javascript",
  ts: "typescript",
  tsx: "typescript",
  cplusplus: "cpp",
  "c++": "cpp",
  cs: "csharp",
  "c#": "csharp",
  "1c": "bsl",
  oscript: "bsl",
};

// prettier-ignore
const keywords = new Set(
  [
    "and", "as", "assert", "async", "await", "break", "case", "catch", "class",
    "const", "continue", "def", "default", "delete", "do", "else", "elif",
    "enum", "except", "export", "extends", "finally", "for", "foreach", "from",
    "function", "goto", "if", "implements", "import", "in", "instanceof",
    "interface", "is", "lambda", "let", "namespace", "new", "of", "package",
    "pass", "private", "protected", "public", "raise", "readonly", "return",
    "sizeof", "static", "struct", "super", "switch", "throw", "throws", "try",
    "typedef", "typeof", "using", "var", "virtual", "volatile", "while",
    "with", "yield", "select", "insert", "update", "create", "drop", "alter",
    "where", "join", "inner", "left", "right", "group", "order", "having",
    "limit", "values", "into", "table", "database", "procedure",
    "если", "тогда", "иначе", "иначеесли", "конецесли", "для", "каждого",
    "из", "цикл", "конеццикла", "пока", "процедура", "конецпроцедуры",
    "функция", "конецфункции", "возврат", "попытка", "исключение",
    "конецпопытки", "вызватьисключение", "перем", "экспорт", "новый",
    "знач", "выполнить", "продолжить", "прервать",
  ].map((word) => word.toLowerCase()),
);

// prettier-ignore
const types = new Set(
  [
    "bool", "boolean", "byte", "char", "date", "datetime", "decimal", "dict",
    "double", "dynamic", "float", "int", "integer", "list", "long", "map",
    "number", "object", "set", "short", "string", "tuple", "unsigned",
    "array", "promise", "record", "variant", "void", "строка", "число", "дата",
    "булево", "массив", "структура", "соответствие", "таблицазначений",
  ].map((word) => word.toLowerCase()),
);

// prettier-ignore
const literals = new Set(
  [
    "true", "false", "null", "none", "undefined", "nan", "inf", "истина",
    "ложь", "неопределено", "null",
  ].map((word) => word.toLowerCase()),
);

// prettier-ignore
const builtins = new Set(
  [
    "print", "len", "range", "open", "input", "sum", "min", "max", "map",
    "filter", "zip", "enumerate", "console", "document", "window", "json",
    "printf", "scanf", "malloc", "free", "sizeof", "std", "vector", "cout",
    "cin", "сообщить", "предупреждение", "вопрос", "формат", "стрдлина",
    "лев", "прав", "сред", "текущаядата", "типзнч", "заполнитьзначениясвойств",
  ].map((word) => word.toLowerCase()),
);

const tokenPattern =
  /\/\*[\s\S]*?\*\/|\/\/[^\n]*|#[^\n]*|"(?:\\[\s\S]|[^"\\])*"|'(?:\\[\s\S]|[^'\\])*'|`(?:\\[\s\S]|[^`\\])*`|@[A-Za-zА-Яа-яЁё_][A-Za-zА-Яа-яЁё0-9_]*|\b(?:0x[\da-f]+|\d+(?:\.\d+)?(?:e[+-]?\d+)?)\b|[A-Za-zА-Яа-яЁё_][A-Za-zА-Яа-яЁё0-9_]*|[+\-*/%=&|!<>^~?:]+|[{}[\]();,.]/gi;

export function getCodeLanguage(className = ""): string {
  const match = /(?:^|\s)language-([^\s]+)/i.exec(className);
  const rawLanguage = match?.[1]?.toLowerCase() || "";
  return languageAliases[rawLanguage] || rawLanguage;
}

function getTokenKind(
  token: string,
  source: string,
  index: number,
  language: string,
): string {
  if (token.startsWith("/*") || token.startsWith("//")) {
    return "comment";
  }
  if (token.startsWith("#")) {
    return ["c", "cpp", "csharp", "java"].includes(language)
      ? "preprocessor"
      : "comment";
  }
  if (/^["'`]/.test(token)) {
    return "string";
  }
  if (token.startsWith("@")) {
    return "decorator";
  }
  if (/^(?:0x[\da-f]+|\d)/i.test(token)) {
    return "number";
  }
  if (/^[+\-*/%=&|!<>^~?:]+$/.test(token)) {
    return "operator";
  }
  if (/^[{}[\]()]$/.test(token)) {
    return "bracket";
  }
  if (/^[;,.]$/.test(token)) {
    return "punctuation";
  }

  const normalized = token.toLowerCase();
  if (keywords.has(normalized)) {
    return "keyword";
  }
  if (types.has(normalized)) {
    return "type";
  }
  if (literals.has(normalized)) {
    return "literal";
  }
  if (builtins.has(normalized)) {
    return "builtin";
  }
  const previousWord = /([A-Za-zА-Яа-яЁё_][A-Za-zА-Яа-яЁё0-9_]*)\s*$/
    .exec(source.slice(0, index))?.[1]
    ?.toLowerCase();
  if (
    previousWord &&
    ["class", "interface", "struct", "enum"].includes(previousWord)
  ) {
    return "class";
  }
  if (/\.\s*$/.test(source.slice(0, index))) {
    return "property";
  }
  if (/^\s*\(/.test(source.slice(index + token.length))) {
    return "function";
  }
  if (/^[A-ZА-ЯЁ][A-Za-zА-Яа-яЁё0-9_]*$/.test(token)) {
    return "class";
  }
  return "";
}

function highlight(source: string, language: string): ReactNode[] {
  const parts: ReactNode[] = [];
  let cursor = 0;
  let match: RegExpExecArray | null;

  tokenPattern.lastIndex = 0;
  while ((match = tokenPattern.exec(source)) !== null) {
    if (match.index > cursor) {
      parts.push(source.slice(cursor, match.index));
    }

    const token = match[0];
    const kind = getTokenKind(token, source, match.index, language);
    parts.push(
      kind ? (
        <span
          key={`${match.index}-${kind}`}
          className={`tw:[&.syntax-keyword]:text-[#c678dd] tw:[&.syntax-function]:text-[#61afef] tw:[&.syntax-bracket]:text-[#d7ba7d] tw:[&.syntax-operator]:text-[#56b6c2] tw:[&.syntax-string]:text-[#cbaacb] tw:[&.syntax-comment]:text-[#7f8c98] tw:[&.syntax-number]:text-[#d19a66] tw:[&.syntax-decorator]:text-[#d19a66] tw:[&.syntax-preprocessor]:text-[#c678dd] tw:[&.syntax-type]:text-[#56b6c2] tw:[&.syntax-literal]:text-[#e06c75] tw:[&.syntax-builtin]:text-[#61afef] tw:[&.syntax-class]:text-[#e5c07b] tw:[&.syntax-property]:text-[#e5c07b] tw:[&.syntax-punctuation]:text-[#abb2bf] tw:[&.syntax-keyword]:font-[700] tw:[&.syntax-bracket]:font-[700] tw:[&.syntax-preprocessor]:font-[700] tw:[&.syntax-literal]:font-[700] tw:[&.syntax-comment]:italic syntax-${kind}`}
        >
          {token}
        </span>
      ) : (
        <Fragment key={`${match.index}-plain`}>{token}</Fragment>
      ),
    );
    cursor = match.index + token.length;
  }

  if (cursor < source.length) {
    parts.push(source.slice(cursor));
  }
  return parts;
}

export interface SyntaxHighlightedCodeProps
  extends ComponentPropsWithoutRef<"code"> {
  /** Узел AST от react-markdown — не пробрасываем в DOM. */
  node?: unknown;
}

export function SyntaxHighlightedCode({
  className = "",
  children,
  node: _node,
  ...props
}: SyntaxHighlightedCodeProps) {
  const language = getCodeLanguage(className);
  const source = String(children).replace(/\n$/, "");

  if (!language) {
    return (
      <code className={className} {...props}>
        {children}
      </code>
    );
  }

  return (
    <code
      className={`tw:[.page.is-inner-page_.lesson-markdown_pre_&]:text-[#d8dee9] tw:[.generated-course-learning-grid_.lesson-markdown_pre_&]:text-[inherit] tw:[.page.is-inner-page_.lesson-markdown_pre_&]:text-[clamp(0.9rem,_1.05vw,_0.98rem)] tw:[.lesson-markdown_&]:text-[0.84rem] tw:[.page.is-inner-page_.lesson-markdown_pre_&]:block tw:[.page.is-inner-page_.lesson-markdown_pre_&]:min-w-[max-content] tw:[.page.is-inner-page_.lesson-markdown_pre_&]:leading-[1.72] tw:[.page.is-inner-page_.lesson-markdown_pre_&]:tracking-[0.005em] tw:[.lesson-markdown_&]:[font-family:'JetBrains_Mono',_'Fira_Code',_monospace] tw:[&::before]:block tw:[&::before]:w-[fit-content] tw:[&::before]:m-[-8px_0_13px] tw:[&::before]:rounded-[999px] tw:[&::before]:text-[#8f9baa] tw:[&::before]:p-[3px_9px] tw:[&::before]:text-[0.68rem] tw:[&::before]:font-[800] tw:[&::before]:leading-[1.3] tw:[&::before]:tracking-[0.1em] tw:[&::before]:uppercase tw:[&::before]:[content:attr(data-language)] tw:[&::before]:[border:1px_solid_rgba(171,_178,_191,_0.2)] tw:[&::before]:[background:rgba(255,_255,_255,_0.055)] tw:[&::before]:[font-family:'Manrope',_sans-serif] ${className} syntax-highlighted-code`}
      data-language={language}
      {...props}
    >
      {highlight(source, language)}
    </code>
  );
}

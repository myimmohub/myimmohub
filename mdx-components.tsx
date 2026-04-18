import type { MDXComponents } from "mdx/types";

/**
 * Global MDX component overrides.
 * Applied automatically to all .mdx files in the project.
 * Article-level layout is set via `export default` inside each page.mdx.
 */
export function useMDXComponents(components: MDXComponents): MDXComponents {
  return {
    // Heading styles
    h1: ({ children }) => (
      <h1 className="mt-10 text-3xl font-semibold tracking-tight text-slate-900 dark:text-slate-100 first:mt-0">
        {children}
      </h1>
    ),
    h2: ({ children }) => (
      <h2 className="mt-8 text-xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">
        {children}
      </h2>
    ),
    h3: ({ children }) => (
      <h3 className="mt-6 text-base font-semibold text-slate-900 dark:text-slate-100">
        {children}
      </h3>
    ),
    // Paragraph
    p: ({ children }) => (
      <p className="mt-4 leading-7 text-slate-600 dark:text-slate-400">{children}</p>
    ),
    // Lists
    ul: ({ children }) => (
      <ul className="mt-4 space-y-1.5 pl-5 text-slate-600 dark:text-slate-400 list-disc">
        {children}
      </ul>
    ),
    ol: ({ children }) => (
      <ol className="mt-4 space-y-1.5 pl-5 text-slate-600 dark:text-slate-400 list-decimal">
        {children}
      </ol>
    ),
    li: ({ children }) => <li className="leading-7">{children}</li>,
    // Code
    code: ({ children }) => (
      <code className="rounded bg-slate-100 px-1.5 py-0.5 text-sm font-mono text-slate-800 dark:bg-slate-800 dark:text-slate-200">
        {children}
      </code>
    ),
    pre: ({ children }) => (
      <pre className="mt-4 overflow-x-auto rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm dark:border-slate-800 dark:bg-slate-900">
        {children}
      </pre>
    ),
    // Blockquote
    blockquote: ({ children }) => (
      <blockquote className="mt-4 border-l-4 border-blue-400 pl-4 text-slate-500 dark:border-blue-600 dark:text-slate-400 italic">
        {children}
      </blockquote>
    ),
    // Strong / em
    strong: ({ children }) => (
      <strong className="font-semibold text-slate-900 dark:text-slate-100">{children}</strong>
    ),
    // Horizontal rule
    hr: () => <hr className="my-8 border-slate-200 dark:border-slate-800" />,
    // Merge with any passed-in components
    ...components,
  };
}

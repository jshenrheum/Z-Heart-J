// Local-only typecheck shim. @types/react cannot be installed here (the npm registry
// is unreachable), so this declares just the React surface the app uses, typed well
// enough to catch real mistakes in our own code. The authoritative check is
// `npm run typecheck` (tsconfig.json + @types/react), to be run where npm works.
declare namespace JSX {
  interface Element { type: unknown; props: unknown; key: string | null }
  interface IntrinsicAttributes { key?: string | number | null }
  interface ElementChildrenAttribute { children: {} }
  interface IntrinsicElements { [name: string]: import('react').HTMLProps }
}

declare module 'react/jsx-runtime' {
  export const jsx: any; export const jsxs: any; export const Fragment: any;
}
declare module '*.css';
declare module 'react-dom/client' {
  export function createRoot(el: Element | DocumentFragment): { render(node: import('react').ReactNode): void; unmount(): void };
}

declare module 'react' {
  export type ReactElement = JSX.Element;
  export type ReactNode = string | number | boolean | null | undefined | ReactElement | Iterable<ReactNode>;
  export type Dispatch<A> = (value: A) => void;
  export type SetStateAction<S> = S | ((prev: S) => S);
  export interface RefObject<T> { current: T }
  export interface MutableRefObject<T> { current: T }

  export interface SyntheticEvent<T = Element> {
    currentTarget: T; target: EventTarget; defaultPrevented: boolean;
    preventDefault(): void; stopPropagation(): void;
  }
  export interface FormEvent<T = Element> extends SyntheticEvent<T> {}
  export interface ChangeEvent<T = Element> extends SyntheticEvent<T> { target: EventTarget & T }
  export interface MouseEvent<T = Element> extends SyntheticEvent<T> { button: number; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }
  export interface KeyboardEvent<T = Element> extends SyntheticEvent<T> { key: string; metaKey: boolean; ctrlKey: boolean; shiftKey: boolean; altKey: boolean }

  export interface HTMLProps {
    [attr: string]: any;
    ref?: any; key?: string | number | null; children?: ReactNode; className?: string;
    onClick?: (e: MouseEvent<any>) => void;
    onChange?: (e: ChangeEvent<any>) => void;
    onInput?: (e: FormEvent<any>) => void;
    onSubmit?: (e: FormEvent<any>) => void;
    onKeyDown?: (e: KeyboardEvent<any>) => void;
    onMouseDown?: (e: MouseEvent<any>) => void;
    onPointerDown?: (e: MouseEvent<any>) => void;
    onFocus?: (e: SyntheticEvent<any>) => void;
    onBlur?: (e: SyntheticEvent<any>) => void;
  }
  export interface AnchorHTMLAttributes<T> extends HTMLProps { href?: string; target?: string; rel?: string; onClick?: (e: MouseEvent<T>) => void }

  export function useState<S>(initial: S | (() => S)): [S, Dispatch<SetStateAction<S>>];
  export function useState<S = undefined>(): [S | undefined, Dispatch<SetStateAction<S | undefined>>];
  export function useEffect(effect: () => void | (() => void), deps?: readonly unknown[]): void;
  export function useRef<T>(initial: T): MutableRefObject<T>;
  export function useRef<T>(initial: T | null): RefObject<T | null>;
  export function useRef<T = undefined>(): MutableRefObject<T | undefined>;
  export function useMemo<T>(factory: () => T, deps: readonly unknown[]): T;
  export function useCallback<T extends (...args: any[]) => any>(cb: T, deps: readonly unknown[]): T;
  export function useSyncExternalStore<T>(subscribe: (cb: () => void) => () => void, getSnapshot: () => T, getServerSnapshot?: () => T): T;
  export function useId(): string;
  export interface Context<T> { Provider: (props: { value: T; children?: ReactNode }) => ReactElement | null }
  export function createContext<T>(defaultValue: T): Context<T>;
  export function useContext<T>(ctx: Context<T>): T;
  export const StrictMode: (props: { children?: ReactNode }) => ReactElement | null;
}

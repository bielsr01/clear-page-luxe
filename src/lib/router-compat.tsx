import * as React from "react";

type To = string | { pathname?: string; search?: string; hash?: string };

type NavigateOptions = {
  replace?: boolean;
  state?: unknown;
};

function toHref(to: To): string {
  if (typeof to === "string") return to;
  return `${to.pathname ?? "/"}${to.search ?? ""}${to.hash ?? ""}`;
}

function getCurrentLocation() {
  if (typeof window === "undefined") {
    return { pathname: "/", search: "", hash: "", state: undefined };
  }
  return {
    pathname: window.location.pathname,
    search: window.location.search,
    hash: window.location.hash,
    state: window.history.state,
  };
}

function emitLocationChange() {
  window.dispatchEvent(new Event("mesapro:navigation"));
}

function navigateTo(to: To, options?: NavigateOptions) {
  if (typeof window === "undefined") return;
  const href = toHref(to);
  if (options?.replace) window.history.replaceState(options.state ?? null, "", href);
  else window.history.pushState(options?.state ?? null, "", href);
  emitLocationChange();
}

export function useNavigate() {
  return React.useCallback((to: To | number, options?: NavigateOptions) => {
    if (typeof window === "undefined") return;
    if (typeof to === "number") {
      window.history.go(to);
      return;
    }
    navigateTo(to, options);
  }, []);
}

export function useLocation() {
  const [location, setLocation] = React.useState(getCurrentLocation);

  React.useEffect(() => {
    const update = () => setLocation(getCurrentLocation());
    window.addEventListener("popstate", update);
    window.addEventListener("mesapro:navigation", update);
    return () => {
      window.removeEventListener("popstate", update);
      window.removeEventListener("mesapro:navigation", update);
    };
  }, []);

  return location;
}

export function useSearchParams(): [URLSearchParams] {
  const location = useLocation();
  return React.useMemo(() => [new URLSearchParams(location.search)] as [URLSearchParams], [location.search]);
}

function matchParams(pathname: string): Record<string, string> {
  const pairs: Array<[RegExp, string[]]> = [
    [/^\/r\/([^/]+)$/, ["slug"]],
    [/^\/pedido\/([^/]+)$/, ["token"]],
    [/^\/ticket\/([^/]+)$/, ["orderId"]],
    [/^\/ticket-cozinha\/([^/]+)$/, ["orderId"]],
    [/^\/ticket-cliente\/([^/]+)$/, ["orderId"]],
  ];

  for (const [regex, names] of pairs) {
    const match = pathname.match(regex);
    if (!match) continue;
    return Object.fromEntries(names.map((name, index) => [name, decodeURIComponent(match[index + 1] ?? "")])) as Record<string, string>;
  }

  return {};
}

export function useParams<T extends Record<string, string | undefined> = Record<string, string | undefined>>() {
  const location = useLocation();
  return React.useMemo(() => matchParams(location.pathname) as T, [location.pathname]);
}

type LinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  to: To;
  replace?: boolean;
  state?: unknown;
};

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(({ to, children, onClick, target, replace, state, ...props }, ref) => {
  const href = toHref(to);

  return (
    <a
      ref={ref}
      href={href}
      target={target}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          target ||
          event.button !== 0 ||
          event.metaKey ||
          event.altKey ||
          event.ctrlKey ||
          event.shiftKey
        ) {
          return;
        }
        event.preventDefault();
        navigateTo(href, { replace, state });
      }}
      {...props}
    >
      {children}
    </a>
  );
});
Link.displayName = "Link";

export type NavLinkProps = Omit<LinkProps, "className"> & {
  className?: string | ((props: { isActive: boolean; isPending: boolean }) => string | undefined);
  end?: boolean;
};

export const NavLink = React.forwardRef<HTMLAnchorElement, NavLinkProps>(
  ({ to, className, end, children, ...props }, ref) => {
    const location = useLocation();
    const href = toHref(to).split(/[?#]/)[0] || "/";
    const isActive = end ? location.pathname === href : location.pathname === href || location.pathname.startsWith(`${href}/`);
    const computedClassName = typeof className === "function" ? className({ isActive, isPending: false }) : className;

    return (
      <Link ref={ref} to={to} className={computedClassName} aria-current={isActive ? "page" : undefined} {...props}>
        {children}
      </Link>
    );
  },
);
NavLink.displayName = "NavLink";

export function Navigate({ to, replace }: { to: To; replace?: boolean }) {
  React.useEffect(() => {
    navigateTo(to, { replace });
  }, [to, replace]);

  return null;
}

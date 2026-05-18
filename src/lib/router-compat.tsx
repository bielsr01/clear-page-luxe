import * as React from "react";
import {
  Navigate as TanStackNavigate,
  useLocation,
  useNavigate as useTanStackNavigate,
  useParams as useTanStackParams,
} from "@tanstack/react-router";

type To = string | { pathname?: string; search?: string; hash?: string };

type NavigateOptions = {
  replace?: boolean;
  state?: unknown;
};

function toHref(to: To): string {
  if (typeof to === "string") return to;
  return `${to.pathname ?? "/"}${to.search ?? ""}${to.hash ?? ""}`;
}

function splitHref(href: string) {
  const [pathAndSearch, hash = ""] = href.split("#");
  const [pathname, search = ""] = pathAndSearch.split("?");
  return {
    pathname: pathname || "/",
    search: search ? `?${search}` : "",
    hash: hash ? `#${hash}` : "",
  };
}

export function useNavigate() {
  const navigate = useTanStackNavigate();

  return React.useCallback(
    (to: To | number, options?: NavigateOptions) => {
      if (typeof to === "number") {
        window.history.go(to);
        return;
      }

      const href = toHref(to);
      const { pathname, search, hash } = splitHref(href);
      return navigate({
        to: pathname as never,
        search: (search ? Object.fromEntries(new URLSearchParams(search)) : undefined) as never,
        hash: hash ? hash.slice(1) : undefined,
        replace: options?.replace,
      } as never);
    },
    [navigate],
  );
}

export function useParams<T extends Record<string, string | undefined> = Record<string, string | undefined>>() {
  return useTanStackParams({ strict: false }) as T;
}

export function useSearchParams(): [URLSearchParams] {
  const location = useLocation();
  return React.useMemo(() => [new URLSearchParams(location.searchStr)] as [URLSearchParams], [location.searchStr]);
}

export function useLocationCompat() {
  const location = useLocation();
  return {
    pathname: location.pathname,
    search: location.searchStr,
    hash: location.hash,
    state: location.state,
  };
}

export { useLocationCompat as useLocation };

type LinkProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "className"> & {
  to: To;
  replace?: boolean;
  state?: unknown;
  className?: string;
};

export const Link = React.forwardRef<HTMLAnchorElement, LinkProps>(({ to, children, onClick, target, replace, ...props }, ref) => {
  const href = toHref(to);
  const navigate = useNavigate();

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
        navigate(href, { replace });
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
    const href = toHref(to);
    const targetPath = splitHref(href).pathname;
    const isActive = end ? location.pathname === targetPath : location.pathname === targetPath || location.pathname.startsWith(`${targetPath}/`);
    const computedClassName = typeof className === "function" ? (className as (props: { isActive: boolean; isPending: boolean }) => string | undefined)({ isActive, isPending: false }) : className;

    return (
      <Link ref={ref} to={to} className={computedClassName} aria-current={isActive ? "page" : undefined} {...props}>
        {children}
      </Link>
    );
  },
);
NavLink.displayName = "NavLink";

export function Navigate({ to, replace }: { to: To; replace?: boolean }) {
  const href = toHref(to);
  const { pathname, search, hash } = splitHref(href);
  const searchObj = search ? Object.fromEntries(new URLSearchParams(search)) : undefined;

  return <TanStackNavigate to={pathname as never} search={searchObj as never} hash={hash ? hash.slice(1) : undefined} replace={replace} />;
}

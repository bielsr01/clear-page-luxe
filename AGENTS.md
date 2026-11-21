Order dashboards use restaurant-scoped Realtime for immediate updates and a 15-second query reconciliation while open, because network interruptions can silently lose events.

On iPhone/iPad the iFood widget's full-screen transparent iframe (restaurant dashboard) steals scroll gestures from every nested scroll container, so only page scroll works: in-page mobile layouts must grow with the page (no fixed heights or inner `overflow-*` below `md:`, cards instead of horizontal tables), while dialogs, sheets and popovers rely on the `html.ios` rule in `src/index.css` that hides the widget while they are open.

PDV sales must be created through the `create_pdv_order` database function, which saves the order, items and options in one transaction and is idempotent by request id; never split them into separate client writes, because that left 99 PDV orders without items.

Auth initialization must defer to newer auth events, ignore stale role responses across identities, and retry failed role lookups instead of treating connection errors as missing access; this prevents spurious redirects without overriding genuine sign-out or server-side RLS.
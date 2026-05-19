create policy if not exists "Order item options are viewable with order items"
on public.order_item_options
for select
to public
using (
  exists (
    select 1
    from public.order_items oi
    where oi.id = order_item_options.order_item_id
  )
);
